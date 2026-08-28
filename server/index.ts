import cors from 'cors'
import express from 'express'
import { serverConfig } from './config.js'
import { sendStepEmail, verifyEmailConfiguration } from './email.js'
import Razorpay from 'razorpay'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { checkDatabase, database } from './database.js'
import { setupRouter } from './routes/setup.js'
import { runGuidedSearch } from './career-runner.js'
import { runScheduledSearches, startCareerScheduler } from './scheduler.js'

export const app = express()
app.use(cors({ origin: serverConfig.clientUrl }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', async (_request, response) => response.json({ ok: true, database: await checkDatabase() }))
app.use('/api/setup', setupRouter)
app.post('/api/career-runs/:userId', async (request, response, next) => {
  try { response.json(await runGuidedSearch(request.params.userId)) } catch (error) { next(error) }
})
app.post('/api/internal/run-scheduled-searches', async (request, response, next) => {
  try {
    const secret = process.env.CRON_SECRET
    const authorization = request.headers.authorization
    if (!secret || authorization !== `Bearer ${secret}`) return response.status(401).json({ message: 'Unauthorized scheduler request.' })
    response.json(await runScheduledSearches())
  } catch (error) { next(error) }
})
app.get('/api/career/dashboard/:userId', async (request, response, next) => {
  try {
    const matches = await database.query(`SELECT m.id,j.title,j.company,j.source,j.source_url,m.match_score,m.status,m.updated_at,c.contact_email,c.status AS contact_status
      FROM job_matches m JOIN discovered_jobs j ON j.id=m.job_id LEFT JOIN job_contact_checks c ON c.user_id=m.user_id AND c.job_id=m.job_id WHERE m.user_id=$1 ORDER BY m.updated_at DESC`, [request.params.userId])
    const latestRun = await database.query(`SELECT id,status,jobs_discovered,jobs_matched,error_message,started_at,finished_at
      FROM career_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 1`, [request.params.userId])
    const runs = await database.query(`SELECT id,status,jobs_discovered,jobs_matched,error_message,started_at,finished_at
      FROM career_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 10`, [request.params.userId])
    const counts = await database.query<{ applied: string; interviews: string }>(`SELECT COUNT(*) FILTER (WHERE status='applied')::text AS applied, COUNT(*) FILTER (WHERE status='interview')::text AS interviews FROM job_matches WHERE user_id=$1`, [request.params.userId])
    const workflow = await database.query<{ status: 'configured' | 'active' | 'paused' }>('SELECT status FROM career_workflows WHERE user_id=$1', [request.params.userId])
    const sourceWorkflows = await database.query<{ source: string; automation_mode: string; submission_mode: string; status: string; detail: string; last_checked_at: string | null; permission_status: string; requested_at: string | null }>(`SELECT w.source,w.automation_mode,w.submission_mode,w.status,w.detail,w.last_checked_at,COALESCE(i.permission_status,'not_requested') permission_status,i.requested_at FROM source_workflows w LEFT JOIN platform_integrations i ON i.user_id=w.user_id AND i.source=w.source WHERE w.user_id=$1 ORDER BY w.source`, [request.params.userId])
    response.json({ matches: matches.rows, latestRun: latestRun.rows[0] ?? null, runs: runs.rows, sourceWorkflows: sourceWorkflows.rows, workflowStatus: workflow.rows[0]?.status ?? 'configured', applicationsSubmitted: Number(counts.rows[0].applied), interviews: Number(counts.rows[0].interviews) })
  } catch (error) { next(error) }
})
app.post('/api/career/platform-integrations/:userId/:source/request', async (request, response, next) => {
  try {
    const source = decodeURIComponent(request.params.source)
    const workflow = await database.query('SELECT 1 FROM source_workflows WHERE user_id=$1 AND source=$2', [request.params.userId, source])
    if (!workflow.rows[0]) return response.status(404).json({ message: 'Select this source in your search plan before requesting integration.' })
    await database.query(`INSERT INTO platform_integrations (user_id,source,permission_status,requested_at,updated_at) VALUES ($1,$2,'permission_requested',NOW(),NOW()) ON CONFLICT(user_id,source) DO UPDATE SET permission_status='permission_requested',requested_at=NOW(),updated_at=NOW()`, [request.params.userId, source])
    response.json({ requested: true, source, permissionStatus: 'permission_requested', requestedAt: new Date().toISOString(), message: 'Permission request saved. Provider approval and OAuth/API credentials are still required before any automated submission can be enabled.' })
  } catch (error) { next(error) }
})
app.patch('/api/career/workflow/:userId/status', async (request, response, next) => {
  try {
    const { status } = request.body as { status?: 'active' | 'paused' }
    if (!['active', 'paused'].includes(status ?? '')) return response.status(400).json({ message: 'Status must be active or paused.' })
    const existing = await database.query<{ status: string }>('SELECT status FROM career_workflows WHERE user_id=$1', [request.params.userId])
    if (!existing.rows[0]) return response.status(404).json({ message: 'Search workflow not found.' })
    const changed = existing.rows[0].status !== status
    if (changed) {
      await database.query('UPDATE career_workflows SET status=$2,updated_at=NOW() WHERE user_id=$1', [request.params.userId, status])
      const user = await database.query<{ email: string; full_name: string }>('SELECT email,full_name FROM users WHERE id=$1', [request.params.userId])
      if (user.rows[0]) {
        const isPaused = status === 'paused'
        void sendStepEmail(request.params.userId, user.rows[0].email, user.rows[0].full_name, isPaused ? 'Search paused' : 'Search resumed', isPaused
          ? 'Your Career Assistant has been paused. Scheduled searches will not run until you activate it again.'
          : 'Your Career Assistant is active again. Scheduled searches can run at your saved time. We will discover and organise relevant opportunities; please handle calls, interviews, and any original-site application that needs your approval.')
      }
    }
    response.json({ updated: true, status, changed })
  } catch (error) { next(error) }
})
app.patch('/api/career/matches/:matchId/status', async (request, response, next) => {
  try {
    const { userId, status } = request.body as { userId?: string; status?: 'review_required' | 'applied' | 'interview' | 'failed' }
    if (!userId || !['review_required', 'applied', 'interview', 'failed'].includes(status ?? '')) return response.status(400).json({ message: 'A valid userId and status are required.' })
    const updated = await database.query<{ title: string; company: string; source: string; source_url: string; match_score: number }>(`UPDATE job_matches m SET status=$3,updated_at=NOW() FROM discovered_jobs j
      WHERE m.id=$1 AND m.user_id=$2 AND j.id=m.job_id RETURNING j.title,j.company,j.source,j.source_url,m.match_score`, [request.params.matchId, userId, status])
    if (!updated.rows[0]) return response.status(404).json({ message: 'Database match not found.' })
    const job = updated.rows[0]
    if (status === 'applied') {
      const user = await database.query<{ email: string; full_name: string }>('SELECT email,full_name FROM users WHERE id=$1', [userId])
      if (user.rows[0]) void sendStepEmail(userId, user.rows[0].email, user.rows[0].full_name, 'Application submitted', `<strong>Application status:</strong> Submitted by you<br><strong>Job:</strong> ${job.title}<br><strong>Company:</strong> ${job.company}<br><strong>Third-party source:</strong> ${job.source}<br><strong>Match score:</strong> ${job.match_score}%<br><a href="${job.source_url}">Open original application →</a><br><br>This was recorded after you confirmed submission on the original source.`)
    }
    response.json({ updated: true, job, status })
  } catch (error) { next(error) }
})
app.get('/api/email/status', async (_request, response) => response.json(await verifyEmailConfiguration()))
app.get('/api/payments/status', (_request, response) => response.json({ configured: Boolean(serverConfig.razorpay.keyId && serverConfig.razorpay.keySecret), mode: 'test', keyId: serverConfig.razorpay.keyId || null }))
app.post('/api/payments/order', async (_request, response, next) => {
  try {
    if (!serverConfig.razorpay.keyId || !serverConfig.razorpay.keySecret) return response.status(503).json({ message: 'Razorpay Test Mode keys are not configured.' })
    const razorpay = new Razorpay({ key_id: serverConfig.razorpay.keyId, key_secret: serverConfig.razorpay.keySecret })
    const order = await razorpay.orders.create({ amount: 100000, currency: 'INR', receipt: `ct_${Date.now()}`, notes: { purpose: 'refundable_test_activation_deposit' } })
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: serverConfig.razorpay.keyId, mode: 'test' })
  } catch (error) { next(error) }
})
app.post('/api/payments/verify', (request, response) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = request.body
  if (!orderId || !paymentId || !signature || !serverConfig.razorpay.keySecret) return response.status(400).json({ verified: false, message: 'Payment verification data is incomplete.' })
  const expected = createHmac('sha256', serverConfig.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  const verified = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  response.status(verified ? 200 : 400).json({ verified, paymentId, orderId, mode: 'test' })
})
app.post('/api/email/test', async (request, response, next) => {
  try {
    const user = await database.query<{ id: string; email: string; full_name: string }>('SELECT id,email,full_name FROM users WHERE id=$1', [request.body.userId])
    if (!user.rows[0]) return response.status(404).json({ message: 'User not found' })
    response.json(await sendStepEmail(user.rows[0].id, user.rows[0].email, user.rows[0].full_name, 'Email test', 'Your PostgreSQL API and SMTP provider are connected successfully.'))
  } catch (error) { next(error) }
})
app.post('/api/email/resend-steps/:userId', async (request, response, next) => {
  try {
    const user = await database.query<{ id: string; email: string; full_name: string }>('SELECT id,email,full_name FROM users WHERE id=$1', [request.params.userId])
    if (!user.rows[0]) return response.status(404).json({ message: 'User not found' })
    const steps = await database.query<{ step: string }>('SELECT DISTINCT step FROM setup_step_events WHERE user_id=$1 ORDER BY step', [request.params.userId])
    const results = []
    for (const item of steps.rows) results.push({ step: item.step, result: await sendStepEmail(user.rows[0].id, user.rows[0].email, user.rows[0].full_name, item.step, `${item.step} was completed successfully. This is your requested delivery retry.`) })
    response.json({ sent: results.filter((item) => item.result.status === 'sent').length, results })
  } catch (error) { next(error) }
})
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error)
  response.status(500).json({ message: error.message || 'Unexpected server error' })
})

if (!process.env.VERCEL) {
  startCareerScheduler()
  app.listen(serverConfig.port, () => {
    console.log(`CareerTide API running at http://localhost:${serverConfig.port}`)
    console.log(`Email configuration: ${serverConfig.smtp.host && serverConfig.smtp.user && serverConfig.smtp.pass ? 'ready' : 'missing (check .env)'}`)
  })
}
