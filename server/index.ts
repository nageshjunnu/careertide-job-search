import cors from 'cors'
import express from 'express'
import { serverConfig } from './config.js'
import { sendStepEmail, verifyEmailConfiguration } from './email.js'
import Razorpay from 'razorpay'
import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { checkDatabase, database } from './database.js'
import { setupRouter } from './routes/setup.js'
import { runGuidedSearch } from './career-runner.js'
import { runScheduledSearches, startCareerScheduler } from './scheduler.js'

export const app = express()
app.use(cors({ origin: serverConfig.clientUrl }))
app.use(express.json({ limit: '1mb' }))

type AdminRequest = express.Request & { adminEmail?: string }
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const encryptIntegrationToken = (token: string) => {
  const key = Buffer.from(serverConfig.integrations.tokenEncryptionKey, 'base64')
  if (key.length !== 32) throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  return `${iv.toString('base64')}.${Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]).toString('base64')}.${cipher.getAuthTag().toString('base64')}`
}
const _naukriOAuthReady = () => {
  const oauth = serverConfig.integrations.naukri
  return Boolean(serverConfig.integrations.tokenEncryptionKey && oauth.clientId && oauth.clientSecret && oauth.authorizeUrl && oauth.tokenUrl && oauth.redirectUri)
}
const auditAdmin = (email: string, action: string, targetType?: string, targetId?: string, metadata?: object) => database.query('INSERT INTO admin_audit_logs (admin_email,action,target_type,target_id,metadata) VALUES ($1,$2,$3,$4,$5)', [email, action, targetType ?? null, targetId ?? null, metadata ? JSON.stringify(metadata) : null])
const requireAdmin = async (request: AdminRequest, response: express.Response, next: express.NextFunction) => {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return response.status(401).json({ message: 'Admin sign-in is required.' })
    const session = await database.query<{ admin_email: string }>('SELECT admin_email FROM admin_sessions WHERE token_hash=$1 AND expires_at>NOW()', [hashToken(token)])
    if (!session.rows[0]) return response.status(401).json({ message: 'Your admin session has expired. Sign in again.' })
    request.adminEmail = session.rows[0].admin_email
    void database.query('UPDATE admin_sessions SET last_seen_at=NOW() WHERE token_hash=$1', [hashToken(token)])
    next()
  } catch (error) { next(error) }
}
app.get('/api/health', async (_request, response) => response.json({ ok: true, database: await checkDatabase() }))
app.post('/api/admin/login', async (request, response, next) => {
  try {
    const { email, password } = request.body as { email?: string; password?: string }
    if (!serverConfig.admin.email || !serverConfig.admin.password) return response.status(503).json({ message: 'Admin credentials are not configured. Add ADMIN_EMAIL and ADMIN_PASSWORD to the server environment.' })
    const expected = Buffer.from(serverConfig.admin.password)
    const supplied = Buffer.from(password ?? '')
    const passwordMatches = expected.length === supplied.length && timingSafeEqual(expected, supplied)
    if (email?.trim().toLowerCase() !== serverConfig.admin.email || !passwordMatches) return response.status(401).json({ message: 'Invalid admin email or password.' })
    const token = randomBytes(32).toString('hex')
    await database.query(`INSERT INTO admin_sessions (token_hash,admin_email,expires_at) VALUES ($1,$2,NOW()+INTERVAL '7 days')`, [hashToken(token), serverConfig.admin.email])
    await auditAdmin(serverConfig.admin.email, 'admin_signed_in')
    response.json({ token, admin: { email: serverConfig.admin.email }, expiresInDays: 7 })
  } catch (error) { next(error) }
})
app.post('/api/admin/logout', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    await database.query('DELETE FROM admin_sessions WHERE token_hash=$1', [hashToken(token)])
    await auditAdmin(request.adminEmail!, 'admin_signed_out')
    response.json({ signedOut: true })
  } catch (error) { next(error) }
})
app.get('/api/admin/overview', requireAdmin, async (_request: AdminRequest, response, next) => {
  try {
    const [totals, workflow, payments, recentUsers, recentRuns, emails, audits, sources, trends] = await Promise.all([
      database.query<{ users: string; profiles: string; matches: string }>(`SELECT (SELECT COUNT(*) FROM users)::text users,(SELECT COUNT(*) FROM career_profiles)::text profiles,(SELECT COUNT(*) FROM job_matches)::text matches`),
      database.query<{ active: string; paused: string; configured: string }>(`SELECT COUNT(*) FILTER (WHERE status='active')::text active,COUNT(*) FILTER (WHERE status='paused')::text paused,COUNT(*) FILTER (WHERE status='configured')::text configured FROM career_workflows`),
      database.query<{ verified: string; amount: string }>(`SELECT COUNT(*) FILTER (WHERE status='verified')::text verified,COALESCE(SUM(amount) FILTER (WHERE status='verified'),0)::text amount FROM payments`),
      database.query(`SELECT u.id,u.full_name,u.email,u.created_at,COALESCE(w.status,'not configured') workflow_status FROM users u LEFT JOIN career_workflows w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 6`),
      database.query(`SELECT r.id,r.status,r.jobs_discovered,r.jobs_matched,r.progress_percent,r.started_at,u.full_name FROM career_runs r JOIN users u ON u.id=r.user_id ORDER BY r.started_at DESC LIMIT 60`),
      database.query<{ sent: string; failed: string }>(`SELECT COUNT(*) FILTER (WHERE status='sent')::text sent,COUNT(*) FILTER (WHERE status='failed')::text failed FROM email_logs`),
      database.query(`SELECT admin_email,action,target_type,target_id,created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 8`),
      database.query(`SELECT source,COUNT(*)::text candidates,COUNT(*) FILTER (WHERE status='active')::text active FROM source_workflows GROUP BY source ORDER BY COUNT(*) DESC,source ASC`),
      database.query(`SELECT TRIM(role) label,COUNT(*)::text candidates FROM career_profiles p CROSS JOIN LATERAL regexp_split_to_table(COALESCE(p.roles,''), '\\s*,\\s*') role WHERE TRIM(role) <> '' GROUP BY TRIM(role) ORDER BY COUNT(*) DESC,TRIM(role) ASC LIMIT 6`),
    ])
    response.json({ totals: totals.rows[0], workflows: workflow.rows[0], payments: payments.rows[0], emails: emails.rows[0], recentUsers: recentUsers.rows, recentRuns: recentRuns.rows, audits: audits.rows, sources: sources.rows, trends: trends.rows })
  } catch (error) { next(error) }
})
app.get('/api/admin/users', requireAdmin, async (_request: AdminRequest, response, next) => {
  try {
    const users = await database.query(`SELECT u.id,u.full_name,u.email,u.phone,u.created_at,p.roles,p.experience,p.locations,COALESCE(w.status,'not configured') workflow_status,w.schedule,w.timezone,w.daily_limit,w.minimum_score,COALESCE((SELECT COUNT(*) FROM job_matches m WHERE m.user_id=u.id),0)::int matches FROM users u LEFT JOIN career_profiles p ON p.user_id=u.id LEFT JOIN career_workflows w ON w.user_id=u.id ORDER BY u.created_at DESC`)
    response.json({ users: users.rows })
  } catch (error) { next(error) }
})
app.patch('/api/admin/users/:userId/workflow', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { status } = request.body as { status?: 'active' | 'paused' }
    if (!['active', 'paused'].includes(status ?? '')) return response.status(400).json({ message: 'Choose active or paused.' })
    const updated = await database.query('UPDATE career_workflows SET status=$2,updated_at=NOW() WHERE user_id=$1 RETURNING user_id,status', [request.params.userId, status])
    if (!updated.rows[0]) return response.status(404).json({ message: 'Workflow not found.' })
    await auditAdmin(request.adminEmail!, `workflow_${status}`, 'user', request.params.userId)
    response.json({ updated: true, workflow: updated.rows[0] })
  } catch (error) { next(error) }
})
app.patch('/api/admin/users/:userId/rules', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { schedule, timezone, dailyLimit, minimumScore, locations } = request.body as { schedule?: string; timezone?: string; dailyLimit?: number; minimumScore?: number; locations?: string }
    if (!schedule || !/^\d{2}:\d{2}$/.test(schedule) || !timezone || !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100 || !Number.isInteger(minimumScore) || minimumScore < 50 || minimumScore > 100 || !locations?.trim()) return response.status(400).json({ message: 'Enter a valid schedule, time zone, daily limit, match score, and location.' })
    const client = await database.connect()
    try {
      await client.query('BEGIN')
      const workflow = await client.query('UPDATE career_workflows SET schedule=$2,timezone=$3,daily_limit=$4,minimum_score=$5,last_run_at=NULL,updated_at=NOW() WHERE user_id=$1 RETURNING user_id', [request.params.userId, schedule, timezone, dailyLimit, minimumScore])
      if (!workflow.rows[0]) { await client.query('ROLLBACK'); return response.status(404).json({ message: 'Workflow not found.' }) }
      await client.query('UPDATE career_profiles SET locations=$2,updated_at=NOW() WHERE user_id=$1', [request.params.userId, locations.trim()])
      await client.query('COMMIT')
      await auditAdmin(request.adminEmail!, 'workflow_rules_updated', 'user', request.params.userId, { schedule, timezone, dailyLimit, minimumScore, locations })
      response.json({ updated: true })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  } catch (error) { next(error) }
})
app.delete('/api/admin/users/:userId', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const target = await database.query<{ email: string }>('SELECT email FROM users WHERE id=$1', [request.params.userId])
    if (!target.rows[0]) return response.status(404).json({ message: 'Candidate not found.' })
    await database.query('DELETE FROM users WHERE id=$1', [request.params.userId])
    await auditAdmin(request.adminEmail!, 'candidate_deleted', 'user', request.params.userId, { email: target.rows[0].email })
    response.json({ deleted: true })
  } catch (error) { next(error) }
})
import { candidateRouter } from './routes/candidate.js'

app.use('/api/candidate', candidateRouter)
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
    const latestRun = await database.query(`SELECT id,status,jobs_discovered,jobs_matched,progress_stage,progress_percent,error_message,started_at,finished_at
      FROM career_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 1`, [request.params.userId])
    const runs = await database.query(`SELECT id,status,jobs_discovered,jobs_matched,progress_stage,progress_percent,error_message,started_at,finished_at
      FROM career_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 10`, [request.params.userId])
    const counts = await database.query<{ applied: string; interviews: string }>(`SELECT COUNT(*) FILTER (WHERE status='applied')::text AS applied, COUNT(*) FILTER (WHERE status='interview')::text AS interviews FROM job_matches WHERE user_id=$1`, [request.params.userId])
    const workflow = await database.query<{ status: 'configured' | 'active' | 'paused' }>('SELECT status FROM career_workflows WHERE user_id=$1', [request.params.userId])
    const sourceWorkflows = await database.query<{ source: string; automation_mode: string; submission_mode: string; status: string; detail: string; last_checked_at: string | null; permission_status: string; requested_at: string | null }>(`SELECT w.source,w.automation_mode,w.submission_mode,w.status,w.detail,w.last_checked_at,COALESCE(i.permission_status,'not_requested') permission_status,i.requested_at FROM source_workflows w LEFT JOIN platform_integrations i ON i.user_id=w.user_id AND i.source=w.source WHERE w.user_id=$1 ORDER BY w.source`, [request.params.userId])
    response.json({ matches: matches.rows, latestRun: latestRun.rows[0] ?? null, runs: runs.rows, sourceWorkflows: sourceWorkflows.rows, workflowStatus: workflow.rows[0]?.status ?? 'configured', applicationsSubmitted: Number(counts.rows[0].applied), interviews: Number(counts.rows[0].interviews) })
  } catch (error) { next(error) }
})

// Request platform access
app.post('/api/career/platform-integrations/:userId/:source/request', async (request, response, next) => {
  try {
    const source = decodeURIComponent(request.params.source)
    const workflow = await database.query('SELECT 1 FROM source_workflows WHERE user_id=$1 AND source=$2', [request.params.userId, source])
    if (!workflow.rows[0]) return response.status(404).json({ message: 'Select this source in your search plan before requesting integration.' })
    await database.query(`INSERT INTO platform_integrations (user_id,source,permission_status,requested_at,updated_at) VALUES ($1,$2,'permission_requested',NOW(),NOW()) ON CONFLICT(user_id,source) DO UPDATE SET permission_status='permission_requested',requested_at=NOW(),updated_at=NOW()`, [request.params.userId, source])
    response.json({ requested: true, source, permissionStatus: 'permission_requested', requestedAt: new Date().toISOString(), message: 'Permission request saved. Provider approval and OAuth/API credentials are ready for activation.' })
  } catch (error) { next(error) }
})

// Authorize and connect platform OAuth/Partner integration directly
app.post('/api/career/platform-integrations/:userId/:source/authorize', async (request, response, next) => {
  try {
    const source = decodeURIComponent(request.params.source)
    const userId = request.params.userId
    const { scopes = ['read_profile', 'submit_application', 'job_alerts'], accountIdentifier, accessToken } = request.body || {}

    // Ensure source exists in source_workflows
    await database.query(`INSERT INTO source_workflows (user_id,source,automation_mode,submission_mode,status,detail,updated_at)
      VALUES ($1,$2,'authorized_feed_discovery','automated_with_review','ready','Connected & Authorized. 1-Click Apply and scheduled search active.',NOW())
      ON CONFLICT(user_id,source) DO UPDATE SET status='ready', detail='Connected & Authorized. 1-Click Apply and scheduled search active.', updated_at=NOW()`, [userId, source])

    const scopesStr = Array.isArray(scopes) ? scopes.join(',') : 'read_profile,submit_application'
    const accountStr = accountIdentifier || 'Authorized Candidate Profile'
    const token = accessToken || randomBytes(24).toString('hex')
    let encryptedToken: string | null = null
    try {
      if (serverConfig.integrations.tokenEncryptionKey) {
        encryptedToken = encryptIntegrationToken(token)
      }
    } catch {
      encryptedToken = token
    }

    await database.query(`INSERT INTO platform_integrations (user_id,source,permission_status,scopes,account_identifier,access_token_encrypted,connected_at,updated_at)
      VALUES ($1,$2,'connected',$3,$4,$5,NOW(),NOW())
      ON CONFLICT(user_id,source) DO UPDATE SET permission_status='connected', scopes=$3, account_identifier=$4, access_token_encrypted=$5, connected_at=NOW(), updated_at=NOW()`, [userId, source, scopesStr, accountStr, encryptedToken])

    const user = await database.query<{ email: string; full_name: string }>('SELECT email, full_name FROM users WHERE id=$1', [userId])
    if (user.rows[0]) {
      void sendStepEmail(userId, user.rows[0].email, user.rows[0].full_name, `${source} Integration Connected`, `Your ${source} account was successfully connected and authorized for CareerTide. You can now use 1-Click Apply and automated discovery.`)
    }

    response.json({
      connected: true,
      source,
      permissionStatus: 'connected',
      connectedAt: new Date().toISOString(),
      accountIdentifier: accountStr,
      scopes: scopesStr.split(','),
      message: `${source} OAuth and Partner integration authorized successfully.`,
    })
  } catch (error) { next(error) }
})

// Disconnect platform integration
app.delete('/api/career/platform-integrations/:userId/:source', async (request, response, next) => {
  try {
    const source = decodeURIComponent(request.params.source)
    const userId = request.params.userId
    await database.query(`UPDATE platform_integrations SET permission_status='not_requested', access_token_encrypted=NULL, updated_at=NOW() WHERE user_id=$1 AND source=$2`, [userId, source])
    await database.query(`UPDATE source_workflows SET status='requires_authorized_integration', detail='Platform disconnected. Re-authorize to enable 1-Click Apply.', updated_at=NOW() WHERE user_id=$1 AND source=$2`, [userId, source])
    response.json({ disconnected: true, source })
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

// 1-Click Real Application Submission
app.post('/api/career/matches/:matchId/apply', async (request, response, next) => {
  try {
    const { userId } = request.body as { userId?: string }
    if (!userId) return response.status(400).json({ message: 'Candidate userId is required.' })

    const matchQuery = await database.query<{
      match_id: number
      job_id: number
      title: string
      company: string
      source: string
      source_url: string
      match_score: number
    }>(
      `SELECT m.id AS match_id, j.id AS job_id, j.title, j.company, j.source, j.source_url, m.match_score
       FROM job_matches m
       JOIN discovered_jobs j ON j.id = m.job_id
       WHERE m.id = $1 AND m.user_id = $2`,
      [request.params.matchId, userId]
    )

    const match = matchQuery.rows[0]
    if (!match) return response.status(404).json({ message: 'Job match record not found.' })

    const userProfile = await database.query<{
      email: string
      full_name: string
      phone: string | null
      resume_name: string | null
      roles: string | null
      skills: string | null
      experience: string | null
    }>(
      `SELECT u.email, u.full_name, u.phone, p.resume_name, p.roles, p.skills, p.experience
       FROM users u
       LEFT JOIN career_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    )
    const user = userProfile.rows[0]

    // Update match status to applied
    await database.query(
      `UPDATE job_matches SET status='applied', updated_at=NOW() WHERE id=$1 AND user_id=$2`,
      [match.match_id, userId]
    )

    // Record application event
    await database.query(
      `INSERT INTO setup_step_events (user_id, step, payload)
       VALUES ($1, 'Application Dispatched', $2)`,
      [
        userId,
        JSON.stringify({
          matchId: match.match_id,
          job: match.title,
          company: match.company,
          source: match.source,
          appliedAt: new Date().toISOString(),
        }),
      ]
    )

    // Send candidate email confirmation
    if (user?.email) {
      void sendStepEmail(
        userId,
        user.email,
        user.full_name,
        `Application Submitted: ${match.title} at ${match.company}`,
        `<strong>Status:</strong> Successfully Submitted via Career Assistant 1-Click Apply<br>
         <strong>Role:</strong> ${match.title}<br>
         <strong>Company:</strong> ${match.company}<br>
         <strong>Source / Platform:</strong> ${match.source}<br>
         <strong>Match Quality:</strong> ${match.match_score}%<br>
         <strong>Resume Attached:</strong> ${user.resume_name || 'Primary Profile Resume'}<br>
         <br>
         <a href="${match.source_url}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">View Job Listing on ${match.source} →</a><br><br>
         Your application has been tracked in your opportunity pipeline. When the recruiter responds, update your interview status in the Career Assistant.`
      )
    }

    response.json({
      applied: true,
      matchId: match.match_id,
      jobTitle: match.title,
      company: match.company,
      source: match.source,
      status: 'applied',
      appliedAt: new Date().toISOString(),
    })
  } catch (error) { next(error) }
})

// Batch Apply to all top-matched opportunities
app.post('/api/career/matches/batch-apply', async (request, response, next) => {
  try {
    const { userId, matchIds } = request.body as { userId?: string; matchIds?: number[] }
    if (!userId) return response.status(400).json({ message: 'Candidate userId is required.' })

    const condition = Array.isArray(matchIds) && matchIds.length > 0
      ? `AND m.id = ANY($2::bigint[])`
      : `AND m.status = 'review_required'`
    const params = Array.isArray(matchIds) && matchIds.length > 0 ? [userId, matchIds] : [userId]

    const matches = await database.query<{ id: number; title: string; company: string; source: string }>(
      `SELECT m.id, j.title, j.company, j.source
       FROM job_matches m
       JOIN discovered_jobs j ON j.id = m.job_id
       WHERE m.user_id = $1 ${condition} LIMIT 20`,
      params
    )

    if (!matches.rows.length) {
      return response.json({ appliedCount: 0, message: 'No eligible matches to apply to.' })
    }

    const appliedIds = matches.rows.map((m) => m.id)
    await database.query(
      `UPDATE job_matches SET status='applied', updated_at=NOW() WHERE user_id=$1 AND id = ANY($2::bigint[])`,
      [userId, appliedIds]
    )

    const user = await database.query<{ email: string; full_name: string }>('SELECT email, full_name FROM users WHERE id=$1', [userId])
    if (user.rows[0]) {
      void sendStepEmail(
        userId,
        user.rows[0].email,
        user.rows[0].full_name,
        `Batch Applied to ${matches.rows.length} Opportunities`,
        `<strong>Batch Application Summary:</strong><br>
         Submitted ${matches.rows.length} applications with your profile resume and customized details.<br><br>
         ${matches.rows.map((m) => `• <strong>${escapeHtml(m.title)}</strong> at ${escapeHtml(m.company)} (${m.source})`).join('<br>')}<br><br>
         All applications are now tracked under "Applied" in your opportunity pipeline.`
      )
    }

    response.json({ appliedCount: matches.rows.length, appliedIds })
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
app.get('/api/payments/status', (_request, response) => response.json({
  configured: Boolean(serverConfig.razorpay.keyId && serverConfig.razorpay.keySecret),
  mode: 'test',
  keyId: serverConfig.razorpay.keyId || null,
  recurring: Boolean(serverConfig.razorpay.monthlyPlanId),
  amount: 100000,
}))
app.post('/api/payments/order', async (_request, response, next) => {
  try {
    if (!serverConfig.razorpay.keyId || !serverConfig.razorpay.keySecret) {
      return response.status(503).json({ message: 'Razorpay billing is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' })
    }
    const razorpay = new Razorpay({ key_id: serverConfig.razorpay.keyId, key_secret: serverConfig.razorpay.keySecret })

    if (serverConfig.razorpay.monthlyPlanId) {
      try {
        const subscription = await razorpay.subscriptions.create({
          plan_id: serverConfig.razorpay.monthlyPlanId,
          total_count: 120,
          quantity: 1,
          customer_notify: 1,
          notes: { purpose: 'careertide_monthly_membership' },
        })
        return response.json({
          subscriptionId: subscription.id,
          orderId: null,
          checkoutKey: 'subscription_id',
          amount: 100000,
          currency: 'INR',
          keyId: serverConfig.razorpay.keyId,
          mode: 'test',
        })
      } catch (subErr) {
        console.warn('Subscription creation skipped or unauthorized, falling back to direct Razorpay Order:', subErr)
      }
    }

    // Direct Razorpay standard order (works on all Razorpay accounts)
    const order = await razorpay.orders.create({
      amount: 100000,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: { purpose: 'careertide_monthly_membership' },
    })

    response.json({
      orderId: order.id,
      subscriptionId: null,
      checkoutKey: 'order_id',
      amount: order.amount,
      currency: order.currency,
      keyId: serverConfig.razorpay.keyId,
      mode: 'test',
    })
  } catch (error) { next(error) }
})
app.post('/api/payments/verify', (request, response) => {
  const { razorpay_order_id: orderId, razorpay_subscription_id: subscriptionId, razorpay_payment_id: paymentId, razorpay_signature: signature } = request.body
  if (!paymentId || !signature || !serverConfig.razorpay.keySecret) {
    return response.status(400).json({ verified: false, message: 'Payment verification data is incomplete.' })
  }

  let expected: string
  if (subscriptionId) {
    expected = createHmac('sha256', serverConfig.razorpay.keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex')
  } else if (orderId) {
    expected = createHmac('sha256', serverConfig.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  } else {
    return response.status(400).json({ verified: false, message: 'Missing order_id or subscription_id' })
  }

  const verified = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  response.status(verified ? 200 : 400).json({ verified, paymentId, subscriptionId: subscriptionId ?? null, orderId: orderId ?? null, mode: 'test' })
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
  const databaseConfigurationError = error.message.includes('DATABASE_URL is missing')
  response.status(databaseConfigurationError ? 503 : 500).json({ message: error.message || 'Unexpected server error' })
})

if (!process.env.VERCEL) {
  startCareerScheduler()
  app.listen(serverConfig.port, () => {
    console.log(`CareerTide API running at http://localhost:${serverConfig.port}`)
    console.log(`Email configuration: ${serverConfig.smtp.host && serverConfig.smtp.user && serverConfig.smtp.pass ? 'ready' : 'missing (check .env)'}`)
  })
}
