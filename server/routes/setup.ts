import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { database } from '../database.js'
import { sendStepEmail } from '../email.js'
import { sourceWorkflowFor } from '../source-workflows.js'

export const setupRouter = Router()

setupRouter.get('/operations', (_request, response) => response.status(405).json({
  message: 'This endpoint requires POST. Opening it directly in a browser sends GET.',
  method: 'POST',
  requiredBody: { userId: 'UUID', emailNotifications: true, dailySummary: true },
}))

async function userFor(userId: string) {
  const result = await database.query<{ email: string; full_name: string }>('SELECT email, full_name FROM users WHERE id=$1', [userId])
  if (!result.rows[0]) throw new Error('User not found')
  return result.rows[0]
}

async function completeStep(userId: string, step: string, payload: unknown, emailMessage: string) {
  const previous = await database.query('SELECT 1 FROM setup_step_events WHERE user_id=$1 AND step=$2 AND payload=$3::jsonb LIMIT 1', [userId, step, JSON.stringify(payload)])
  if (previous.rows[0]) return { status: 'skipped_unchanged', providerId: null }
  await database.query(`INSERT INTO setup_step_events (user_id, step, payload) VALUES ($1,$2,$3)`, [userId, step, JSON.stringify(payload)])
  await database.query(`INSERT INTO onboarding_progress (user_id, current_step, completed_steps, updated_at) VALUES ($1,$2,ARRAY[$3],NOW()) ON CONFLICT (user_id) DO UPDATE SET current_step=EXCLUDED.current_step, completed_steps=(SELECT ARRAY(SELECT DISTINCT unnest(onboarding_progress.completed_steps || ARRAY[$3]))), updated_at=NOW()`, [userId, step, step])
  // Send one consolidated setup email only after every onboarding stage is complete.
  if (step === 'Guided setup') {
    const user = await userFor(userId)
    void sendStepEmail(userId, user.email, user.full_name, step, emailMessage)
  }
  return { status: 'queued', providerId: null }
}

setupRouter.post('/user', async (request, response, next) => {
  try {
    const id = request.body.userId || randomUUID()
    const { email, fullName, phone, resumeName, roles, skills, locations, experience, salaryExpectation, service } = request.body
    const phoneDigits = String(phone ?? '').replace(/\D/g, '')
    if (!email || !fullName) return response.status(400).json({ message: 'Full name and email are required.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ message: 'Enter a valid email address.' })
    if (phoneDigits.length < 10 || phoneDigits.length > 15 || /^(\d)\1+$/.test(phoneDigits)) return response.status(400).json({ message: 'Enter a valid mobile number.' })
    if (!experience || !roles?.trim() || !skills?.trim() || !locations?.trim() || !salaryExpectation?.trim()) return response.status(400).json({ message: 'Experience, target roles, skills, locations, and salary expectation are required.' })
    if (!/\.(pdf|doc|docx)$/i.test(resumeName ?? '')) return response.status(400).json({ message: 'Upload a PDF, DOC, or DOCX resume.' })
    await database.query(`INSERT INTO users (id,email,full_name,phone) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET full_name=$3,phone=$4,updated_at=NOW()`, [id, email, fullName, phone || null])
    const found = await database.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [email])
    const userId = found.rows[0].id
    await database.query(`INSERT INTO career_profiles (user_id,resume_name,roles,skills,locations,experience,salary_expectation,service) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET resume_name=$2,roles=$3,skills=$4,locations=$5,experience=$6,salary_expectation=$7,service=$8,updated_at=NOW()`, [userId, resumeName, roles, skills, locations, experience, salaryExpectation, service])
    const emailResult = await completeStep(userId, 'User profile', request.body, 'Your profile, resume details, preferences, and selected service were saved successfully.')
    response.json({ userId, email: emailResult })
  } catch (error) { next(error) }
})

setupRouter.post('/payment', async (request, response, next) => {
  try {
    const { userId, paymentId, amount = 1000, mode = 'test' } = request.body
    await database.query(`INSERT INTO payments (user_id,payment_id,amount,mode,status,verified_at) VALUES ($1,$2,$3,$4,'verified',NOW()) ON CONFLICT(payment_id) DO NOTHING`, [userId, paymentId, amount, mode])
    const paymentMessage = mode === 'live'
      ? 'Congratulations — your ₹1,000 monthly CareerTide membership payment was verified. Complete the remaining setup steps and we will prepare your Career Assistant.'
      : 'Congratulations — your ₹1,000 monthly CareerTide membership was verified in Razorpay Test Mode. No real money was charged. Complete the remaining setup steps and we will prepare your Career Assistant.'
    const email = await completeStep(userId, 'Test payment', request.body, paymentMessage)
    // Payment is the only individual onboarding milestone that sends a message.
    // This keeps setup emails useful instead of sending one after every form.
    if (email.status !== 'skipped_unchanged') {
      const user = await userFor(userId)
      void sendStepEmail(userId, user.email, user.full_name, 'Payment activation', paymentMessage)
    }
    response.json({ verified: true, paymentId, email })
  } catch (error) { next(error) }
})

setupRouter.post('/workflow', async (request, response, next) => {
  try {
    const { userId, schedule, timezone = 'Asia/Kolkata', sources, minimumScore, dailyLimit } = request.body
    if (!Array.isArray(sources) || sources.length === 0) return response.status(400).json({ message: 'Select at least one source workflow.' })
    await database.query(`INSERT INTO career_workflows (user_id,schedule,timezone,sources,minimum_score,daily_limit,status) VALUES ($1,$2,$3,$4,$5,$6,'configured') ON CONFLICT(user_id) DO UPDATE SET last_run_at=CASE WHEN career_workflows.schedule IS DISTINCT FROM $2 OR career_workflows.timezone IS DISTINCT FROM $3 THEN NULL ELSE career_workflows.last_run_at END,schedule=$2,timezone=$3,sources=$4,minimum_score=$5,daily_limit=$6,updated_at=NOW()`, [userId, schedule, timezone, sources, minimumScore, dailyLimit])
    await database.query('DELETE FROM source_workflows WHERE user_id=$1 AND NOT (source = ANY($2::text[]))', [userId, sources])
    for (const source of sources) {
      const workflow = sourceWorkflowFor(source)
      await database.query(`INSERT INTO source_workflows (user_id,source,automation_mode,submission_mode,status,detail,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(user_id,source) DO UPDATE SET automation_mode=$3,submission_mode=$4,status=$5,detail=$6,updated_at=NOW()`, [userId, workflow.source, workflow.automationMode, workflow.submissionMode, workflow.status, workflow.detail])
      await database.query(`INSERT INTO platform_integrations (user_id,source) VALUES ($1,$2) ON CONFLICT(user_id,source) DO NOTHING`, [userId, workflow.source])
    }
    const email = await completeStep(userId, 'Search workflow', request.body, `Your daily search workflow is configured for ${schedule} (${timezone}) with a ${minimumScore}% match threshold.`)
    response.json({ configured: true, email })
  } catch (error) { next(error) }
})

setupRouter.post('/application-rules', async (request, response, next) => {
  try {
    const { userId, reviewRequired, retries } = request.body
    await database.query(`INSERT INTO application_preferences (user_id,review_required,retries) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET review_required=$2,retries=$3,updated_at=NOW()`, [userId, reviewRequired, retries])
    const email = await completeStep(userId, 'Application preferences', request.body, `Your application rules were saved with ${reviewRequired ? 'human review required' : 'rules-based processing'}.`)
    response.json({ configured: true, email })
  } catch (error) { next(error) }
})

setupRouter.post('/operations', async (request, response, next) => {
  try {
    const { userId, emailNotifications, dailySummary } = request.body
    await database.query(`INSERT INTO notification_preferences (user_id,email_notifications,daily_summary) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET email_notifications=$2,daily_summary=$3,updated_at=NOW()`, [userId, emailNotifications, dailySummary])
    await database.query(`UPDATE onboarding_progress SET is_complete=true,current_step='dashboard',updated_at=NOW() WHERE user_id=$1`, [userId])
    const email = await completeStep(userId, 'Guided setup', request.body, 'All setup steps are complete. We will take care of discovering opportunities, matching them to your profile, and keeping your review queue organised. Your part is to respond to calls, schedule interviews, and submit any application that needs your approval on the original job site. When you are shortlisted, update your Career Assistant so your next steps stay in one place.')
    response.json({ completed: true, email })
  } catch (error) { next(error) }
})

setupRouter.patch('/settings', async (request, response, next) => {
  const client = await database.connect()
  try {
    const { userId, schedule, timezone, dailyLimit, minimumScore, locations } = request.body
    if (!userId || !schedule || !timezone || !Array.isArray(locations) || locations.length === 0) return response.status(400).json({ message: 'User, schedule, timezone, and at least one location are required.' })
    await client.query('BEGIN')
    const workflow = await client.query(`UPDATE career_workflows SET last_run_at=CASE WHEN schedule IS DISTINCT FROM $2 OR timezone IS DISTINCT FROM $3 THEN NULL ELSE last_run_at END,schedule=$2,timezone=$3,daily_limit=$4,minimum_score=$5,updated_at=NOW() WHERE user_id=$1 RETURNING user_id`, [userId, schedule, timezone, dailyLimit, minimumScore])
    if (!workflow.rows[0]) { await client.query('ROLLBACK'); return response.status(404).json({ message: 'Search workflow not found.' }) }
    await client.query(`UPDATE career_profiles SET locations=$2,updated_at=NOW() WHERE user_id=$1`, [userId, locations.join(', ')])
    await client.query('COMMIT')
    response.json({ updated: true, settings: { schedule, timezone, dailyLimit, minimumScore, locations } })
  } catch (error) { await client.query('ROLLBACK'); next(error) } finally { client.release() }
})
