import { randomBytes, pbkdf2Sync, createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { database } from '../database.js'
import { sendStepEmail } from '../email.js'
import { sourceWorkflowFor } from '../source-workflows.js'

export const candidateRouter = Router()

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false
  const [salt, originalHash] = storedHash.split(':')
  const computed = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return computed === originalHash
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

async function createCandidateSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const tokenHashed = hashToken(token)
  await database.query(
    `INSERT INTO candidate_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [tokenHashed, userId]
  )
  return token
}

async function getCandidateFullRecord(userId: string) {
  const userResult = await database.query<{
    id: string
    email: string
    full_name: string
    phone: string | null
    created_at: string
  }>(`SELECT id, email, full_name, phone, created_at FROM users WHERE id=$1`, [userId])

  if (!userResult.rows[0]) return null
  const user = userResult.rows[0]

  const profileResult = await database.query<{
    resume_name: string | null
    roles: string | null
    skills: string | null
    locations: string | null
    experience: string | null
    salary_expectation: string | null
    service: string | null
  }>(`SELECT resume_name, roles, skills, locations, experience, salary_expectation, service FROM career_profiles WHERE user_id=$1`, [userId])
  const profile = profileResult.rows[0] ?? null

  const workflowResult = await database.query<{
    schedule: string
    timezone: string
    sources: string[]
    minimum_score: number
    daily_limit: number
    status: string
  }>(`SELECT schedule, timezone, sources, minimum_score, daily_limit, status FROM career_workflows WHERE user_id=$1`, [userId])
  const workflow = workflowResult.rows[0] ?? null

  const paymentResult = await database.query<{ payment_id: string }>(
    `SELECT payment_id FROM payments WHERE user_id=$1 AND status='verified' ORDER BY verified_at DESC LIMIT 1`,
    [userId]
  )
  const paymentId = paymentResult.rows[0]?.payment_id ?? null

  const appRulesResult = await database.query<{ review_required: boolean; retries: number }>(
    `SELECT review_required, retries FROM application_preferences WHERE user_id=$1`,
    [userId]
  )
  const appRules = appRulesResult.rows[0] ?? { review_required: true, retries: 2 }

  const notifyResult = await database.query<{ email_notifications: boolean; daily_summary: boolean }>(
    `SELECT email_notifications, daily_summary FROM notification_preferences WHERE user_id=$1`,
    [userId]
  )
  const notify = notifyResult.rows[0] ?? { email_notifications: true, daily_summary: true }

  const onboardingData = {
    email: user.email,
    fullName: user.full_name,
    phone: user.phone ?? '',
    resumeName: profile?.resume_name ?? '',
    roles: profile?.roles ?? 'Software Engineer',
    skills: profile?.skills ?? 'React, TypeScript, Node.js',
    locations: profile?.locations ?? 'Hyderabad, Bengaluru, Remote',
    experience: profile?.experience ?? '0-3',
    salaryExpectation: profile?.salary_expectation ?? '₹8–15 LPA',
    service: profile?.service ?? 'guided-automation',
    paymentId: paymentId ?? `LOCAL_ACTIVE_${Date.now()}`,
    schedule: workflow?.schedule ?? '08:00',
    timezone: workflow?.timezone ?? 'Asia/Kolkata',
    sources: workflow?.sources ?? ['Remotive', 'LinkedIn', 'Naukri', 'Indeed', 'Google Jobs'],
    minimumScore: workflow?.minimum_score ?? 80,
    dailyLimit: workflow?.daily_limit ?? 25,
    reviewRequired: appRules.review_required,
    retries: appRules.retries,
    emailNotifications: notify.email_notifications,
    dailySummary: notify.daily_summary,
  }

  const onboardingRecord = {
    id: 'current-user',
    currentStep: 4,
    completed: true,
    authenticated: true,
    serverUserId: user.id,
    data: onboardingData,
    syncedSteps: {
      user: JSON.stringify({ email: user.email, fullName: user.full_name }),
      payment: JSON.stringify({ paymentId: onboardingData.paymentId }),
      automation: JSON.stringify({ schedule: onboardingData.schedule, sources: onboardingData.sources }),
      application: JSON.stringify({ reviewRequired: onboardingData.reviewRequired }),
      operations: JSON.stringify({ emailNotifications: onboardingData.emailNotifications }),
    },
    updatedAt: new Date().toISOString(),
  }

  return { user, profile, workflow, onboardingData, onboardingRecord }
}

// POST /api/candidate/login
candidateRouter.post('/login', async (request, response, next) => {
  try {
    const { email, password } = request.body as { email?: string; password?: string }
    if (!email?.trim()) {
      return response.status(400).json({ message: 'Email address is required.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const userQuery = await database.query<{ id: string; email: string; full_name: string; password_hash: string | null }>(
      `SELECT id, email, full_name, password_hash FROM users WHERE LOWER(email)=$1`,
      [cleanEmail]
    )

    const user = userQuery.rows[0]
    if (!user) {
      return response.status(404).json({
        message: 'No candidate account found with this email. Please create a candidate account.',
      })
    }

    if (user.password_hash && password) {
      const valid = verifyPassword(password, user.password_hash)
      if (!valid) {
        return response.status(401).json({ message: 'Incorrect password. Please try again.' })
      }
    } else if (password && !user.password_hash) {
      const newHash = hashPassword(password)
      await database.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, user.id])
    }

    const token = await createCandidateSession(user.id)
    const fullRecord = await getCandidateFullRecord(user.id)

    response.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
      onboardingRecord: fullRecord?.onboardingRecord,
      profile: fullRecord?.profile,
      workflow: fullRecord?.workflow,
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/candidate/register
candidateRouter.post('/register', async (request, response, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phone = '',
      roles = 'Software Engineer',
      skills = 'JavaScript, React, Node.js',
      locations = 'Hyderabad, Bengaluru, Remote',
      experience = '0-3',
      salaryExpectation = '₹8–15 LPA',
      resumeName = 'Candidate_Resume.pdf',
      sources = ['Remotive', 'LinkedIn', 'Naukri', 'Indeed', 'Google Jobs', 'Glassdoor', 'Wellfound'],
    } = request.body

    if (!fullName?.trim() || !email?.trim()) {
      return response.status(400).json({ message: 'Full name and email are required.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const passwordHash = password?.trim() ? hashPassword(password.trim()) : null
    const userId = randomUUID()

    await database.query(
      `INSERT INTO users (id, email, full_name, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name=$3, phone=$4, password_hash=COALESCE(EXCLUDED.password_hash, users.password_hash), updated_at=NOW()`,
      [userId, cleanEmail, fullName.trim(), phone.trim() || null, passwordHash]
    )

    const resolvedUser = await database.query<{ id: string; email: string; full_name: string }>(
      `SELECT id, email, full_name FROM users WHERE LOWER(email)=$1`,
      [cleanEmail]
    )
    const finalUserId = resolvedUser.rows[0].id

    await database.query(
      `INSERT INTO career_profiles (user_id, resume_name, roles, skills, locations, experience, salary_expectation, service)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'guided-automation')
       ON CONFLICT (user_id) DO UPDATE SET
         resume_name=COALESCE(EXCLUDED.resume_name, career_profiles.resume_name),
         roles=EXCLUDED.roles, skills=EXCLUDED.skills, locations=EXCLUDED.locations,
         experience=EXCLUDED.experience, salary_expectation=EXCLUDED.salary_expectation, updated_at=NOW()`,
      [finalUserId, resumeName, roles, skills, locations, experience, salaryExpectation]
    )

    await database.query(
      `INSERT INTO career_workflows (user_id, schedule, timezone, sources, minimum_score, daily_limit, status)
       VALUES ($1, '08:00', 'Asia/Kolkata', $2, 75, 30, 'active')
       ON CONFLICT (user_id) DO UPDATE SET sources=EXCLUDED.sources, status='active', updated_at=NOW()`,
      [finalUserId, sources]
    )

    for (const source of sources) {
      const def = sourceWorkflowFor(source)
      await database.query(
        `INSERT INTO source_workflows (user_id, source, automation_mode, submission_mode, status, detail, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id, source) DO UPDATE SET status=$5, detail=$6, updated_at=NOW()`,
        [finalUserId, def.source, def.automationMode, def.submissionMode, def.status, def.detail]
      )
      await database.query(
        `INSERT INTO platform_integrations (user_id, source)
         VALUES ($1, $2) ON CONFLICT (user_id, source) DO NOTHING`,
        [finalUserId, def.source]
      )
    }

    await database.query(
      `INSERT INTO application_preferences (user_id, review_required, retries)
       VALUES ($1, true, 2) ON CONFLICT (user_id) DO NOTHING`,
      [finalUserId]
    )
    await database.query(
      `INSERT INTO notification_preferences (user_id, email_notifications, daily_summary)
       VALUES ($1, true, true) ON CONFLICT (user_id) DO NOTHING`,
      [finalUserId]
    )
    await database.query(
      `INSERT INTO payments (user_id, payment_id, amount, mode, status, verified_at)
       VALUES ($1, $2, 1000, 'test', 'verified', NOW()) ON CONFLICT (payment_id) DO NOTHING`,
      [finalUserId, `AUTO_ACTIVATE_${Date.now()}`]
    )
    await database.query(
      `INSERT INTO onboarding_progress (user_id, current_step, completed_steps, is_complete, updated_at)
       VALUES ($1, 'dashboard', ARRAY['user', 'payment', 'workflow', 'application', 'operations'], true, NOW())
       ON CONFLICT (user_id) DO UPDATE SET is_complete=true, current_step='dashboard', updated_at=NOW()`,
      [finalUserId]
    )

    const token = await createCandidateSession(finalUserId)
    const fullRecord = await getCandidateFullRecord(finalUserId)

    void sendStepEmail(
      finalUserId,
      cleanEmail,
      fullName,
      'Welcome to CareerTide',
      'Your candidate account and Career Assistant are ready. Sign in anytime to explore jobs, connect platform integrations, and track your applications.'
    )

    response.json({
      token,
      user: { id: finalUserId, email: cleanEmail, fullName: fullName.trim() },
      onboardingRecord: fullRecord?.onboardingRecord,
      profile: fullRecord?.profile,
      workflow: fullRecord?.workflow,
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/candidate/me
candidateRouter.get('/me', async (request, response, next) => {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return response.status(401).json({ message: 'Candidate session token missing.' })

    const session = await database.query<{ user_id: string }>(
      `SELECT user_id FROM candidate_sessions WHERE token_hash=$1 AND expires_at > NOW()`,
      [hashToken(token)]
    )

    if (!session.rows[0]) {
      return response.status(401).json({ message: 'Candidate session expired. Please sign in again.' })
    }

    const userId = session.rows[0].user_id
    void database.query(`UPDATE candidate_sessions SET last_seen_at=NOW() WHERE token_hash=$1`, [hashToken(token)])

    const fullRecord = await getCandidateFullRecord(userId)
    if (!fullRecord) return response.status(404).json({ message: 'Candidate not found.' })

    response.json(fullRecord)
  } catch (error) {
    next(error)
  }
})

// POST /api/candidate/logout
candidateRouter.post('/logout', async (request, response, next) => {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (token) {
      await database.query(`DELETE FROM candidate_sessions WHERE token_hash=$1`, [hashToken(token)])
    }
    response.json({ loggedOut: true })
  } catch (error) {
    next(error)
  }
})

// GET /api/candidate/profiles
candidateRouter.get('/profiles', async (_request, response, next) => {
  try {
    const users = await database.query<{
      id: string
      email: string
      full_name: string
      roles: string | null
      experience: string | null
      locations: string | null
    }>(
      `SELECT u.id, u.email, u.full_name, p.roles, p.experience, p.locations
       FROM users u
       LEFT JOIN career_profiles p ON p.user_id = u.id
       ORDER BY u.created_at DESC LIMIT 12`
    )
    response.json({ profiles: users.rows })
  } catch (error) {
    next(error)
  }
})
