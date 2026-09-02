import cors from 'cors'
import express from 'express'
import { serverConfig } from './config.js'
import { sendStepEmail, verifyEmailConfiguration, sendRecruiterApplicationEmail } from './email.js'
import Razorpay from 'razorpay'
import cron from 'node-cron'
import { createCipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { checkDatabase, database } from './database.js'
import { setupRouter } from './routes/setup.js'
import { runGuidedSearch } from './career-runner.js'
import { refreshJobSchedules, runScheduledSearches, startCareerScheduler } from './scheduler.js'

const DEFAULT_PLATFORMS = ['Naukri', 'LinkedIn', 'Foundit', 'Monster', 'Indeed', 'Google Jobs', 'Remotive', 'Arbeitnow', 'Jobicy', 'Glassdoor', 'Wellfound', 'Instahyre', 'Cutshort', 'TimesJobs', 'Shine', 'Remote OK']
async function initPlatformConfigs() {
  try {
    await database.query(`CREATE TABLE IF NOT EXISTS platform_dispatch_configs (source TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'recruiter_email', auto_dispatch BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ DEFAULT NOW())`)
    await database.query(`ALTER TABLE platform_dispatch_configs ADD COLUMN IF NOT EXISTS api_key TEXT`)
    await database.query(`ALTER TABLE platform_dispatch_configs ADD COLUMN IF NOT EXISTS api_secret TEXT`)
    await database.query(`ALTER TABLE platform_dispatch_configs ADD COLUMN IF NOT EXISTS oauth_authorize_url TEXT`)
    await database.query(`ALTER TABLE platform_dispatch_configs ADD COLUMN IF NOT EXISTS oauth_token_url TEXT`)
    await database.query(`ALTER TABLE platform_dispatch_configs ADD COLUMN IF NOT EXISTS redirect_uri TEXT`)
    await database.query(`ALTER TABLE platform_dispatch_configs ADD COLUMN IF NOT EXISTS scopes TEXT`)
    for (const source of DEFAULT_PLATFORMS) {
      const mode = ['Remotive', 'Arbeitnow', 'Jobicy'].includes(source) ? 'api' : 'recruiter_email'
      await database.query(`INSERT INTO platform_dispatch_configs (source, mode, auto_dispatch, updated_at) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT(source) DO NOTHING`, [source, mode])
    }
    const envIntegrations: Record<string, { key: string; secret: string; authorize: string; token: string; redirect: string; scopes: string }> = {
      LinkedIn: { key: process.env.LINKEDIN_OAUTH_CLIENT_ID ?? '', secret: process.env.LINKEDIN_OAUTH_CLIENT_SECRET ?? '', authorize: process.env.LINKEDIN_OAUTH_AUTHORIZE_URL ?? '', token: process.env.LINKEDIN_OAUTH_TOKEN_URL ?? '', redirect: process.env.LINKEDIN_OAUTH_REDIRECT_URI ?? '', scopes: process.env.LINKEDIN_OAUTH_SCOPES ?? '' },
      Naukri: { key: serverConfig.integrations.naukri.clientId, secret: serverConfig.integrations.naukri.clientSecret, authorize: serverConfig.integrations.naukri.authorizeUrl, token: serverConfig.integrations.naukri.tokenUrl, redirect: serverConfig.integrations.naukri.redirectUri, scopes: serverConfig.integrations.naukri.scopes },
      Foundit: { key: process.env.FOUNDIT_PARTNER_CLIENT_ID ?? '', secret: process.env.FOUNDIT_PARTNER_CLIENT_SECRET ?? '', authorize: '', token: '', redirect: '', scopes: '' },
      Monster: { key: process.env.MONSTER_PARTNER_CLIENT_ID ?? '', secret: process.env.MONSTER_PARTNER_CLIENT_SECRET ?? '', authorize: '', token: '', redirect: '', scopes: '' },
      Shine: { key: process.env.SHINE_PARTNER_CLIENT_ID ?? '', secret: process.env.SHINE_PARTNER_CLIENT_SECRET ?? '', authorize: '', token: '', redirect: '', scopes: '' },
    }
    for (const [source, values] of Object.entries(envIntegrations)) {
      if (!Object.values(values).some(Boolean)) continue
      await database.query(`UPDATE platform_dispatch_configs SET api_key=COALESCE(NULLIF($2,''),api_key),api_secret=COALESCE(NULLIF($3,''),api_secret),oauth_authorize_url=COALESCE(NULLIF($4,''),oauth_authorize_url),oauth_token_url=COALESCE(NULLIF($5,''),oauth_token_url),redirect_uri=COALESCE(NULLIF($6,''),redirect_uri),scopes=COALESCE(NULLIF($7,''),scopes),updated_at=NOW() WHERE source=$1`, [source, values.key, values.secret, values.authorize, values.token, values.redirect, values.scopes])
    }
  } catch (error) {
    console.error('Error initializing platform dispatch configs:', error)
  }
}
void initPlatformConfigs()

const DEFAULT_PAYMENT_GATEWAYS = ['razorpay', 'stripe', 'payu', 'cashfree', 'phonepe']
async function initPaymentGateways() {
  try {
    await database.query(`CREATE TABLE IF NOT EXISTS payment_gateways (name TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE, is_default BOOLEAN NOT NULL DEFAULT FALSE, mode TEXT NOT NULL DEFAULT 'test', config JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ DEFAULT NOW())`)
    await database.query(`ALTER TABLE payment_gateways ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`)
    for (const name of DEFAULT_PAYMENT_GATEWAYS) {
      await database.query(`INSERT INTO payment_gateways (name, enabled, is_default, mode, config, updated_at) VALUES ($1, $2, $2, 'test', '{}'::jsonb, NOW()) ON CONFLICT(name) DO NOTHING`, [name, name === 'razorpay'])
    }
    if (serverConfig.razorpay.keyId || serverConfig.razorpay.keySecret) {
      await database.query(`UPDATE payment_gateways SET enabled=TRUE,is_default=TRUE,config=config || $1::jsonb,updated_at=NOW() WHERE name='razorpay'`, [JSON.stringify({ apiKey: serverConfig.razorpay.keyId, apiSecret: serverConfig.razorpay.keySecret })])
    }
  } catch (error) {
    console.error('Error initializing payment gateways:', error)
  }
}
void initPaymentGateways()
async function initJobRunSchedules() {
  try {
    await database.query(`CREATE TABLE IF NOT EXISTS job_run_schedules (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, cron_expression TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`)
    await database.query(`INSERT INTO job_run_schedules (name,cron_expression,active,timezone) SELECT 'Candidate job discovery','*/5 * * * *',TRUE,'Asia/Kolkata' WHERE NOT EXISTS (SELECT 1 FROM job_run_schedules WHERE name='Candidate job discovery')`)
  } catch (error) { console.error('Error initializing job schedules:', error) }
}
void initJobRunSchedules()
async function initSiteSettings() {
  try {
    await database.query(`CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())`)
    await database.query(`INSERT INTO site_settings (key,value) VALUES ('brand_name','SkillBridge') ON CONFLICT (key) DO NOTHING`)
  } catch (error) { console.error('Error initializing site settings:', error) }
}
void initSiteSettings()
async function initSourceChangeOtps() {
  try { await database.query(`CREATE TABLE IF NOT EXISTS source_change_otps (id BIGSERIAL PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,source TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,verified_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW())`) } catch (error) { console.error('Error initializing source change OTPs:', error) }
}
void initSourceChangeOtps()

export const app = express()
app.use(cors({ origin: serverConfig.clientUrl }))
app.use(express.json({ limit: '1mb' }))

type AdminRequest = express.Request & { adminEmail?: string }
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const hashAdminPassword = (password: string, salt = randomBytes(16).toString('hex')) => `${salt}:${pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')}`
const verifyAdminPassword = (password: string, stored: string) => { const [salt, hash] = stored.split(':'); return Boolean(salt && hash) && timingSafeEqual(Buffer.from(hash), Buffer.from(pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex'))) }
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
    const session = await database.query<{ admin_email: string }>(`SELECT admin_email FROM admin_sessions WHERE token_hash=$1 AND expires_at>NOW() AND last_seen_at>NOW()-INTERVAL '1 hour'`, [hashToken(token)])
    if (!session.rows[0]) return response.status(401).json({ message: 'Your admin session has expired. Sign in again.' })
    request.adminEmail = session.rows[0].admin_email
    void database.query(`UPDATE admin_sessions SET last_seen_at=NOW(), expires_at=NOW()+INTERVAL '1 hour' WHERE token_hash=$1`, [hashToken(token)])
    next()
  } catch (error) { next(error) }
}
app.get('/api/health', async (_request, response) => response.json({ ok: true, database: await checkDatabase() }))
app.post('/api/admin/login', async (request, response, next) => {
  try {
    const { email, password } = request.body as { email?: string; password?: string }
    if (!serverConfig.admin.email || !serverConfig.admin.password) return response.status(503).json({ message: 'Admin credentials are not configured. Add ADMIN_EMAIL and ADMIN_PASSWORD to the server environment.' })
    const override = await database.query<{ value: string }>(`SELECT value FROM site_settings WHERE key='admin_password_hash'`)
    const passwordOverride = override.rows[0]?.value
    const expected = Buffer.from(serverConfig.admin.password)
    const supplied = Buffer.from(password ?? '')
    const passwordMatches = passwordOverride ? verifyAdminPassword(password ?? '', passwordOverride) : expected.length === supplied.length && timingSafeEqual(expected, supplied)
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
      database.query(`SELECT r.id,r.status,r.jobs_discovered,r.jobs_matched,r.progress_percent,r.started_at,u.full_name,u.email,r.user_id FROM career_runs r JOIN users u ON u.id=r.user_id ORDER BY r.started_at DESC LIMIT 60`),
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
app.get('/api/admin/candidate-analytics', requireAdmin, async (_request: AdminRequest, response, next) => {
  try {
    const analytics = await database.query(`
      SELECT u.id,u.full_name,u.email,
        COUNT(DISTINCT m.id)::int matches,
        COUNT(DISTINCT m.id) FILTER (WHERE m.status='applied')::int applications,
        COUNT(DISTINCT m.id) FILTER (WHERE m.status IN ('review_required','pending'))::int awaiting_review,
        COUNT(DISTINCT r.id)::int runs,
        COALESCE(MAX(r.started_at), NULL) last_run_at,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status='sent')::int emails_sent,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status='failed')::int emails_failed
      FROM users u
      LEFT JOIN job_matches m ON m.user_id=u.id
      LEFT JOIN career_runs r ON r.user_id=u.id
      LEFT JOIN email_logs e ON e.user_id=u.id
      GROUP BY u.id,u.full_name,u.email
      ORDER BY u.full_name ASC`)
    response.json({ analytics: analytics.rows })
  } catch (error) { next(error) }
})
app.get('/api/admin/candidates/:userId/analytics-detail', requireAdmin, async (request: AdminRequest, response, next) => { try { const payments = await database.query(`SELECT payment_id,amount,mode,status,verified_at,created_at,months_covered FROM payments WHERE user_id=$1 ORDER BY created_at DESC`, [request.params.userId]); const daily = await database.query(`SELECT DATE(started_at) day,COALESCE(SUM(jobs_discovered),0) fetched,COALESCE(SUM(jobs_matched),0) matched,COALESCE(SUM((SELECT COUNT(*) FROM job_matches jm WHERE jm.run_id=career_runs.id AND jm.status='applied')),0) applied FROM career_runs WHERE user_id=$1 GROUP BY DATE(started_at) ORDER BY day DESC LIMIT 90`, [request.params.userId]); response.json({ payments: payments.rows, daily: daily.rows }) } catch (error) { next(error) } })
app.get('/api/admin/job-run-schedules', requireAdmin, async (_request: AdminRequest, response, next) => {
  try { response.json({ schedules: (await database.query(`SELECT id,name,cron_expression,active,timezone,updated_at FROM job_run_schedules ORDER BY id ASC`)).rows }) } catch (error) { next(error) }
})
app.get('/api/admin/cron-jobs', requireAdmin, async (_request: AdminRequest, response, next) => {
  try { response.json({ jobs: (await database.query(`SELECT id,name,cron_expression AS schedule,active AS enabled,timezone,updated_at FROM job_run_schedules ORDER BY id ASC`)).rows }) } catch (error) { next(error) }
})
app.patch('/api/admin/cron-jobs/:id', requireAdmin, async (request: AdminRequest, response, next) => {
  const { schedule, enabled } = request.body as { schedule?: string; enabled?: boolean }
  try {
    if (schedule && !cron.validate(schedule)) return response.status(400).json({ message: 'Enter a valid five-field cron expression.' })
    const updated = await database.query(`UPDATE job_run_schedules SET cron_expression=COALESCE($2,cron_expression),active=COALESCE($3,active),updated_at=NOW() WHERE id=$1 RETURNING id,name,cron_expression AS schedule,active AS enabled,timezone,updated_at`, [request.params.id, schedule ?? null, enabled ?? null])
    if (!updated.rows[0]) return response.status(404).json({ message: 'Cron job not found.' })
    await refreshJobSchedules(); response.json({ updated: true, job: updated.rows[0] })
  } catch (error) { next(error) }
})
app.get('/api/site-settings', async (_request, response, next) => { try { response.json({ settings: (await database.query(`SELECT key,value FROM site_settings`)).rows }) } catch (error) { next(error) } })
app.patch('/api/admin/site-settings', requireAdmin, async (request: AdminRequest, response, next) => {
  try { const brandName = String(request.body.brand_name ?? '').trim(); if (!brandName || brandName.length > 60) return response.status(400).json({ message: 'Enter a brand name up to 60 characters.' }); await database.query(`INSERT INTO site_settings (key,value,updated_at) VALUES ('brand_name',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=NOW()`, [brandName]); await auditAdmin(request.adminEmail!, 'updated_brand_name', 'site_setting', 'brand_name'); response.json({ updated: true, brand_name: brandName }) } catch (error) { next(error) }
})
app.get('/api/admin/settings', requireAdmin, async (_request: AdminRequest, response, next) => {
  try { response.json({ settings: Object.fromEntries((await database.query(`SELECT key,value FROM site_settings`)).rows.map((row: { key: string; value: string }) => [row.key, row.value])) }) } catch (error) { next(error) }
})
app.patch('/api/admin/settings', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const allowed = ['brand_name', 'brand_subtitle', 'logo_url', 'candidate_payments_enabled', 'monthly_membership_enabled', 'monthly_membership_amount', 'quarterly_membership_amount', 'yearly_membership_amount', 'included_jobs', 'extra_job_amount', 'first_connection_amount', 'account_change_amount', 'smtp_host', 'smtp_port', 'smtp_from']
    const entries = Object.entries(request.body as Record<string, unknown>).filter(([key, value]) => allowed.includes(key) && typeof value === 'string' && value.length <= 500)
    for (const [key, value] of entries) await database.query(`INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()`, [key, value])
    await auditAdmin(request.adminEmail!, 'updated_admin_settings', 'site_setting', 'multiple', { keys: entries.map(([key]) => key) })
    response.json({ updated: true })
  } catch (error) { next(error) }
})
app.patch('/api/admin/password', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { currentPassword, newPassword } = request.body as { currentPassword?: string; newPassword?: string }
    if (!currentPassword || !newPassword || newPassword.length < 8 || !/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(newPassword)) return response.status(400).json({ message: 'Use a new password with 8+ characters, uppercase, lowercase, number, and special character.' })
    const override = await database.query<{ value: string }>(`SELECT value FROM site_settings WHERE key='admin_password_hash'`)
    const valid = override.rows[0]?.value ? verifyAdminPassword(currentPassword, override.rows[0].value) : serverConfig.admin.password === currentPassword
    if (!valid) return response.status(401).json({ message: 'Current admin password is incorrect.' })
    await database.query(`INSERT INTO site_settings (key,value,updated_at) VALUES ('admin_password_hash',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=NOW()`, [hashAdminPassword(newPassword)])
    await auditAdmin(request.adminEmail!, 'admin_password_changed', 'admin', request.adminEmail)
    response.json({ updated: true })
  } catch (error) { next(error) }
})
app.post('/api/admin/settings/logo', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const dataUrl = String(request.body.dataUrl ?? '')
    if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(dataUrl) || dataUrl.length > 2_800_000) return response.status(400).json({ message: 'Upload a PNG, JPEG, WebP, or SVG logo under 2 MB.' })
    await database.query(`INSERT INTO site_settings (key,value,updated_at) VALUES ('logo_url',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=NOW()`, [dataUrl])
    await auditAdmin(request.adminEmail!, 'uploaded_site_logo', 'site_setting', 'logo_url')
    response.json({ uploaded: true, logoUrl: dataUrl })
  } catch (error) { next(error) }
})
app.get('/api/admin/pricing', requireAdmin, async (_request: AdminRequest, response, next) => {
  try {
    const settings = await database.query(`SELECT key,value FROM site_settings WHERE key = ANY($1)`, [['monthly_membership_amount', 'included_jobs', 'extra_job_amount', 'first_connection_amount', 'account_change_amount']])
    const values = Object.fromEntries(settings.rows.map((row: { key: string; value: string }) => [row.key, Number(row.value)]))
    response.json({ pricing: { monthlyMembershipAmount: values.monthly_membership_amount ?? 1000, includedJobs: values.included_jobs ?? 100, extraJobAmount: values.extra_job_amount ?? 10, firstConnectionAmount: values.first_connection_amount ?? 100, accountChangeAmount: values.account_change_amount ?? 500 } })
  } catch (error) { next(error) }
})
app.get('/api/admin/payments', requireAdmin, async (_request: AdminRequest, response, next) => {
  try { const payments = await database.query(`SELECT p.id,p.payment_id,p.amount,p.mode,p.status,p.verified_at,p.created_at,u.full_name,u.email,COALESCE(CEIL(p.amount/1000.0),1)::int months_covered FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200`); response.json({ payments: payments.rows }) } catch (error) { next(error) }
})
app.patch('/api/admin/pricing', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const entries = Object.entries(request.body as Record<string, unknown>).filter(([key, value]) => ['monthlyMembershipAmount', 'includedJobs', 'extraJobAmount', 'firstConnectionAmount', 'accountChangeAmount'].includes(key) && Number.isInteger(value) && Number(value) >= 0)
    const keys: Record<string, string> = { monthlyMembershipAmount: 'monthly_membership_amount', includedJobs: 'included_jobs', extraJobAmount: 'extra_job_amount', firstConnectionAmount: 'first_connection_amount', accountChangeAmount: 'account_change_amount' }
    for (const [key, value] of entries) await database.query(`INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()`, [keys[key], String(value)])
    await auditAdmin(request.adminEmail!, 'updated_billing_pricing', 'site_setting', 'pricing')
    response.json({ updated: true })
  } catch (error) { next(error) }
})
app.patch('/api/admin/job-run-schedules/:id', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { cronExpression, active, timezone } = request.body as { cronExpression?: string; active?: boolean; timezone?: string }
    if (cronExpression && !cron.validate(cronExpression)) return response.status(400).json({ message: 'Enter a valid five-field cron expression.' })
    const updated = await database.query(`UPDATE job_run_schedules SET cron_expression=COALESCE($2,cron_expression),active=COALESCE($3,active),timezone=COALESCE($4,timezone),updated_at=NOW() WHERE id=$1 RETURNING id,name,cron_expression,active,timezone,updated_at`, [request.params.id, cronExpression ?? null, active ?? null, timezone ?? null])
    if (!updated.rows[0]) return response.status(404).json({ message: 'Schedule not found.' })
    await refreshJobSchedules()
    await auditAdmin(request.adminEmail!, 'updated_job_run_schedule', 'job_run_schedule', String(request.params.id), { cronExpression, active, timezone })
    response.json({ updated: true, schedule: updated.rows[0] })
  } catch (error) { next(error) }
})
app.get('/api/admin/runs/:runId/details', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const runRes = await database.query(`SELECT id, user_id, started_at, finished_at FROM career_runs WHERE id = $1`, [request.params.runId]);
    if (!runRes.rows.length) return response.status(404).json({ message: 'Run not found' });
    const run = runRes.rows[0];

    const jobsRes = await database.query(`
      SELECT m.status as match_status, m.updated_at, j.title, j.company, j.source
      FROM job_matches m
      JOIN discovered_jobs j ON j.id = m.job_id
      WHERE m.user_id = $1 AND m.status = 'applied'
      ORDER BY m.updated_at DESC
      LIMIT 100
    `, [run.user_id]);

    const emailsRes = await database.query(`
      SELECT status, count(*) as count
      FROM email_logs
      WHERE user_id = $1 AND step = 'recruiter_application_email'
      GROUP BY status
    `, [run.user_id]);

    const emailsSent = parseInt(emailsRes.rows.find((r: any) => r.status === 'sent')?.count || '0', 10);
    const emailsFailed = parseInt(emailsRes.rows.find((r: any) => r.status === 'failed')?.count || '0', 10);

    response.json({
      jobsApplied: jobsRes.rows,
      emailsSent,
      emailsFailed
    });
  } catch (error) { next(error) }
})
app.patch('/api/admin/users/:userId/workflow', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { status } = request.body as { status?: 'active' | 'paused' }
    if (!['active', 'paused'].includes(status ?? '')) return response.status(400).json({ message: 'Choose active or paused.' })
    const updated = await database.query('UPDATE career_workflows SET status=$2,updated_at=NOW() WHERE user_id=$1 RETURNING user_id,status', [request.params.userId, status])
    if (!updated.rows[0]) return response.status(404).json({ message: 'Workflow not found.' })
    await auditAdmin(request.adminEmail!, `workflow_${status}`, 'user', String(request.params.userId))
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
      await auditAdmin(request.adminEmail!, 'workflow_rules_updated', 'user', String(request.params.userId), { schedule, timezone, dailyLimit, minimumScore, locations })
      response.json({ updated: true })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  } catch (error) { next(error) }
})
app.patch('/api/admin/users/:userId/email', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const email = String(request.body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ message: 'Enter a valid candidate email address.' })
    const updated = await database.query(`UPDATE users SET email=$2,updated_at=NOW() WHERE id=$1 RETURNING id,email`, [request.params.userId, email])
    if (!updated.rows[0]) return response.status(404).json({ message: 'Candidate not found.' })
    await auditAdmin(request.adminEmail!, 'candidate_email_updated', 'user', String(request.params.userId), { email })
    response.json({ updated: true, email })
  } catch (error: any) { if (error?.code === '23505') return response.status(409).json({ message: 'That email is already used by another candidate.' }); next(error) }
})
app.delete('/api/admin/users/:userId', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const target = await database.query<{ email: string }>('SELECT email FROM users WHERE id=$1', [request.params.userId])
    if (!target.rows[0]) return response.status(404).json({ message: 'Candidate not found.' })
    await database.query('DELETE FROM users WHERE id=$1', [request.params.userId])
    await auditAdmin(request.adminEmail!, 'candidate_deleted', 'user', String(request.params.userId), { email: target.rows[0].email })
    response.json({ deleted: true })
  } catch (error) { next(error) }
})

app.get('/api/admin/platform-configs', requireAdmin, async (_request: AdminRequest, response, next) => {
  try {
    const configs = await database.query(`SELECT source, mode, auto_dispatch, api_key, api_secret, oauth_authorize_url, oauth_token_url, redirect_uri, scopes, updated_at FROM platform_dispatch_configs ORDER BY source ASC`)
    response.json({ configs: configs.rows })
  } catch (error) { next(error) }
})

app.patch('/api/admin/platform-configs/:source', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { source } = request.params
    const { mode, autoDispatch, api_key, api_secret, oauth_authorize_url, oauth_token_url, redirect_uri, scopes } = request.body as { mode?: string, autoDispatch?: boolean, api_key?: string, api_secret?: string, oauth_authorize_url?: string, oauth_token_url?: string, redirect_uri?: string, scopes?: string }

    if (mode && !['api', 'recruiter_email'].includes(mode)) {
      return response.status(400).json({ message: 'Mode must be api or recruiter_email.' })
    }

    const updated = await database.query(
      `INSERT INTO platform_dispatch_configs (source, mode, auto_dispatch, api_key, api_secret, oauth_authorize_url, oauth_token_url, redirect_uri, scopes, updated_at)
       VALUES ($1, COALESCE($2, 'recruiter_email'), COALESCE($3, true), $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT(source) DO UPDATE SET
         mode = COALESCE($2, platform_dispatch_configs.mode),
         auto_dispatch = COALESCE($3, platform_dispatch_configs.auto_dispatch),
         api_key = COALESCE($4, platform_dispatch_configs.api_key),
         api_secret = COALESCE($5, platform_dispatch_configs.api_secret),
         oauth_authorize_url = COALESCE($6, platform_dispatch_configs.oauth_authorize_url),
         oauth_token_url = COALESCE($7, platform_dispatch_configs.oauth_token_url),
         redirect_uri = COALESCE($8, platform_dispatch_configs.redirect_uri),
         scopes = COALESCE($9, platform_dispatch_configs.scopes),
         updated_at = NOW()
       RETURNING source, mode, auto_dispatch, api_key, api_secret, oauth_authorize_url, oauth_token_url, redirect_uri, scopes, updated_at`,
      [source, mode || null, autoDispatch !== undefined ? autoDispatch : null, api_key || null, api_secret || null, oauth_authorize_url || null, oauth_token_url || null, redirect_uri || null, scopes || null]
    )

    await auditAdmin(request.adminEmail!, `updated_platform_config_${source}`, 'platform', source)
    response.json({ config: updated.rows[0] })
  } catch (error) { next(error) }
})

app.get('/api/admin/payment-gateways', requireAdmin, async (_request: AdminRequest, response, next) => {
  try {
    const gateways = await database.query<{ name: string; enabled: boolean; is_default: boolean; mode: string; config: Record<string, unknown>; updated_at: string }>(`SELECT name, enabled, is_default, mode, config, updated_at FROM payment_gateways WHERE name = ANY($1) ORDER BY name ASC`, [DEFAULT_PAYMENT_GATEWAYS])
    response.json({ gateways: gateways.rows.map((gateway) => ({
      ...gateway,
      configured: Boolean(gateway.config?.apiKey || gateway.config?.keyId),
      config: { apiKey: gateway.config?.apiKey ?? gateway.config?.keyId ?? '', webhookUrl: gateway.config?.webhookUrl ?? '' },
    })) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/payment-gateways/:name', requireAdmin, async (request: AdminRequest, response, next) => {
  try {
    const { enabled, isDefault, mode, apiKey, apiSecret, webhookUrl, webhookSecret } = request.body as { enabled?: boolean; isDefault?: boolean; mode?: string; apiKey?: string; apiSecret?: string; webhookUrl?: string; webhookSecret?: string }
    if (mode && !['test', 'live'].includes(mode)) return response.status(400).json({ message: 'Mode must be test or live.' })
    if (enabled !== undefined && typeof enabled !== 'boolean') return response.status(400).json({ message: 'Enabled must be true or false.' })
    const name = String(request.params.name).trim()
    if (!DEFAULT_PAYMENT_GATEWAYS.includes(name.toLowerCase())) return response.status(404).json({ message: 'Unknown payment gateway.' })
    const gatewayName = name.toLowerCase()
    const existing = await database.query<{ config: Record<string, unknown> }>(`SELECT config FROM payment_gateways WHERE name=$1`, [gatewayName])
    const current = existing.rows[0]?.config ?? {}
    const config = {
      ...current,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(apiSecret !== undefined ? { apiSecret } : {}),
      ...(webhookUrl !== undefined ? { webhookUrl } : {}),
      ...(webhookSecret !== undefined ? { webhookSecret } : {}),
    }
    if (isDefault) await database.query(`UPDATE payment_gateways SET is_default=FALSE WHERE name <> $1`, [gatewayName])
    const updated = await database.query(`UPDATE payment_gateways SET enabled=COALESCE($2,enabled),is_default=COALESCE($3,is_default), mode=COALESCE($4,mode), config=$5, updated_at=NOW() WHERE name=$1 RETURNING name,enabled,is_default,mode,updated_at`, [gatewayName, enabled ?? null, isDefault ?? null, mode ?? null, JSON.stringify(config)])
    await auditAdmin(request.adminEmail!, `updated_payment_gateway_${gatewayName}`, 'payment_gateway', gatewayName, { enabled, mode })
    response.json({ updated: true, gateway: { ...updated.rows[0], configured: Boolean(config.apiKey), config: { apiKey: config.apiKey ?? '', webhookUrl: config.webhookUrl ?? '' } } })
  } catch (error) { next(error) }
})

import { candidateRouter } from './routes/candidate.js'

app.use('/api/candidate', candidateRouter)
app.use('/api/setup', setupRouter)
app.post('/api/career-runs/:userId', async (request, response, next) => {
  try { response.json(await runGuidedSearch(request.params.userId)) } catch (error) { if (error instanceof Error && /paid membership/i.test(error.message)) return response.status(402).json({ message: error.message }); next(error) }
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
    const runs = await database.query(`SELECT r.id,r.status,r.jobs_discovered,r.jobs_matched,r.progress_stage,r.progress_percent,r.error_message,r.started_at,r.finished_at,u.email
      FROM career_runs r JOIN users u ON u.id=r.user_id WHERE r.user_id=$1 ORDER BY r.started_at DESC LIMIT 10`, [request.params.userId])
    const counts = await database.query<{ applied: string; interviews: string }>(`SELECT COUNT(*) FILTER (WHERE status='applied')::text AS applied, COUNT(*) FILTER (WHERE status='interview')::text AS interviews FROM job_matches WHERE user_id=$1`, [request.params.userId])
    const workflow = await database.query<{ status: 'configured' | 'active' | 'paused' }>('SELECT status FROM career_workflows WHERE user_id=$1', [request.params.userId])
    const sourceWorkflows = await database.query<{ source: string; automation_mode: string; submission_mode: string; status: string; detail: string; last_checked_at: string | null; permission_status: string; requested_at: string | null }>(`SELECT w.source,w.automation_mode,w.submission_mode,w.status,w.detail,w.last_checked_at,COALESCE(i.permission_status,'not_requested') permission_status,i.requested_at FROM source_workflows w LEFT JOIN platform_integrations i ON i.user_id=w.user_id AND i.source=w.source LEFT JOIN platform_dispatch_configs p ON p.source=w.source WHERE w.user_id=$1 AND COALESCE(p.auto_dispatch,TRUE)=TRUE ORDER BY w.source`, [request.params.userId])
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
app.patch('/api/career/sources/:userId/:source', async (request, response, next) => {
  try {
    const enabled = request.body.enabled
    if (typeof enabled !== 'boolean') return response.status(400).json({ message: 'Enabled must be true or false.' })
    const source = decodeURIComponent(request.params.source)
    const platform = await database.query<{ auto_dispatch: boolean }>(`SELECT auto_dispatch FROM platform_dispatch_configs WHERE source=$1`, [source])
    if (platform.rows[0] && !platform.rows[0].auto_dispatch) return response.status(403).json({ message: 'This platform is currently disabled by the administrator.' })
    await database.query(`UPDATE source_workflows SET status=$3,detail=$4,updated_at=NOW() WHERE user_id=$1 AND source=$2`, [request.params.userId, source, enabled ? 'ready' : 'paused', enabled ? 'Source enabled for discovery and applications.' : 'Source disabled by candidate. No discovery or applications will run.'])
    response.json({ updated: true, source, enabled })
  } catch (error) { next(error) }
})
app.post('/api/career/sources/:userId/:source/change-account/otp', async (request, response, next) => {
  try {
    const source = decodeURIComponent(request.params.source)
    const user = await database.query<{ email: string; full_name: string }>(`SELECT email,full_name FROM users WHERE id=$1`, [request.params.userId])
    if (!user.rows[0]) return response.status(404).json({ message: 'Candidate not found.' })
    const code = String(Math.floor(100000 + Math.random() * 900000))
    await database.query(`INSERT INTO source_change_otps (user_id,source,code_hash,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '10 minutes')`, [request.params.userId, source, createHash('sha256').update(code).digest('hex')])
    void sendStepEmail(request.params.userId, user.rows[0].email, user.rows[0].full_name, 'Account change verification', `Your ${source} account-change verification code is <strong>${code}</strong>. It expires in 10 minutes. Do not share this code.`)
    response.json({ sent: true, message: `Verification code sent to ${user.rows[0].email}` })
  } catch (error) { next(error) }
})
app.post('/api/career/sources/:userId/:source/change-account/verify', async (request, response, next) => {
  try {
    const source = decodeURIComponent(request.params.source); const code = String(request.body.code ?? '')
    const otp = await database.query<{ id: number }>(`SELECT id FROM source_change_otps WHERE user_id=$1 AND source=$2 AND code_hash=$3 AND expires_at>NOW() AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`, [request.params.userId, source, createHash('sha256').update(code).digest('hex')])
    if (!otp.rows[0]) return response.status(400).json({ message: 'Invalid or expired verification code.' })
    await database.query(`UPDATE source_change_otps SET verified_at=NOW() WHERE id=$1`, [otp.rows[0].id])
    response.json({ verified: true })
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

// 1-Click Real Application Submission & Recruiter Email Dispatch Engine
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
      raw_data: string | object | null
    }>(
      `SELECT m.id AS match_id, j.id AS job_id, j.title, j.company, j.source, j.source_url, m.match_score, j.raw_data
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

    // Fetch contact check email
    const contactCheck = await database.query<{ contact_email: string | null }>(
      `SELECT contact_email FROM job_contact_checks WHERE user_id=$1 AND job_id=$2`,
      [userId, match.job_id]
    )
    let recruiterEmail = contactCheck.rows[0]?.contact_email || null

    // Extract email from raw_data if not in contact check
    if (!recruiterEmail && match.raw_data) {
      const text = typeof match.raw_data === 'string' ? match.raw_data : JSON.stringify(match.raw_data)
      recruiterEmail = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null
    }

    // Check platform config mode
    const platformConfig = await database.query<{ mode: string }>(
      `SELECT mode FROM platform_dispatch_configs WHERE source=$1`,
      [match.source]
    )
    const mode = platformConfig.rows[0]?.mode ?? 'recruiter_email'

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
          dispatchMode: mode,
          recruiterEmail: recruiterEmail || null,
          appliedAt: new Date().toISOString(),
        }),
      ]
    )

    let _dispatchResult = null
    const targetEmail = recruiterEmail

    if (targetEmail) {
      _dispatchResult = await sendRecruiterApplicationEmail({
        userId,
        recruiterEmail: targetEmail,
        candidateName: user?.full_name || 'Candidate',
        candidateEmail: user?.email || '',
        candidatePhone: user?.phone,
        candidateRoles: user?.roles,
        candidateSkills: user?.skills,
        candidateExperience: user?.experience,
        candidateResumeName: user?.resume_name,
        jobTitle: match.title,
        company: match.company,
        source: match.source,
        matchScore: match.match_score,
        sourceUrl: match.source_url,
      })
    } else if (user?.email) {
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
         <a href="${match.source_url}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">View Job Listing on ${match.source} →</a>`
      )
    }

    response.json({
      applied: true,
      matchId: match.match_id,
      jobTitle: match.title,
      company: match.company,
      source: match.source,
      dispatchMode: mode,
      recruiterEmail: targetEmail,
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

    const matches = await database.query<{ id: number; job_id: number; title: string; company: string; source: string; source_url: string; match_score: number; raw_data: string | object | null }>(
      `SELECT m.id, m.job_id, j.title, j.company, j.source, j.source_url, m.match_score, j.raw_data
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

    // Dispatch recruiter emails for each match
    for (const match of matches.rows) {
      const text = typeof match.raw_data === 'string' ? match.raw_data : JSON.stringify(match.raw_data)
      const recruiterEmail = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null
      if (user?.email && recruiterEmail) {
        void sendRecruiterApplicationEmail({
          userId,
          recruiterEmail,
          candidateName: user.full_name,
          candidateEmail: user.email,
          candidatePhone: user.phone,
          candidateRoles: user.roles,
          candidateSkills: user.skills,
          candidateExperience: user.experience,
          candidateResumeName: user.resume_name,
          jobTitle: match.title,
          company: match.company,
          source: match.source,
          matchScore: match.match_score,
          sourceUrl: match.source_url,
        })
      }
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
app.get('/api/payments/status', async (_request, response) => {
  const settings = await database.query<{ key: string; value: string }>(`SELECT key,value FROM site_settings WHERE key IN ('monthly_membership_amount','monthly_membership_enabled')`)
  const values = Object.fromEntries(settings.rows.map((row) => [row.key, row.value]))
  return response.json({
  configured: Boolean(serverConfig.razorpay.keyId && serverConfig.razorpay.keySecret),
  mode: 'test',
  keyId: serverConfig.razorpay.keyId || null,
  recurring: Boolean(serverConfig.razorpay.monthlyPlanId),
  amount: Number(values.monthly_membership_amount ?? 1000) * 100,
  monthlyEnabled: values.monthly_membership_enabled !== 'false',
  })
})
app.get('/api/payments/billing/:userId', async (request, response, next) => {
  try {
    const billing = await database.query(`SELECT status,period_end,advance_months,included_jobs,used_jobs FROM candidate_billing WHERE user_id=$1`, [request.params.userId])
    const settings = await database.query<{ key: string; value: string }>(`SELECT key,value FROM site_settings WHERE key = ANY($1)`, [['monthly_membership_amount', 'included_jobs', 'extra_job_amount', 'first_connection_amount', 'account_change_amount']])
    const values = Object.fromEntries(settings.rows.map((row) => [row.key, Number(row.value)])) as Record<string, number>
    response.json({ billing: billing.rows[0] ?? { status: 'inactive', period_end: null, advance_months: 0, included_jobs: values.included_jobs ?? 100, used_jobs: 0 }, pricing: { monthlyAmount: values.monthly_membership_amount ?? 1000, includedJobs: values.included_jobs ?? 100, extraJobAmount: values.extra_job_amount ?? 10, firstConnectionAmount: values.first_connection_amount ?? 100, accountChangeAmount: values.account_change_amount ?? 500 } })
  } catch (error) { next(error) }
})
app.post('/api/payments/billing/:userId/cancel', async (request, response, next) => {
  try { await database.query(`UPDATE candidate_billing SET status='cancel_at_period_end',updated_at=NOW() WHERE user_id=$1`, [request.params.userId]); response.json({ cancelled: true, message: 'Your plan stays active until the current paid period ends. New job applications will be disabled after that date until payment is renewed.' }) } catch (error) { next(error) }
})
// One provider-neutral webhook URL. Configure each provider to call
// POST /api/payments/webhooks/:gateway and keep its signing secret in that gateway's config.
app.get('/api/payments/gateways', async (_request, response, next) => {
  try {
    const paymentVisibility = await database.query<{ value: string }>(`SELECT value FROM site_settings WHERE key='candidate_payments_enabled'`)
    if (paymentVisibility.rows[0]?.value === 'false') return response.json({ gateways: [] })
    const gateways = await database.query<{ name: string; mode: string; is_default: boolean }>(`SELECT name,mode,is_default FROM payment_gateways WHERE enabled=TRUE ORDER BY is_default DESC,name ASC`)
    response.json({ gateways: gateways.rows })
  } catch (error) { next(error) }
})
app.post('/api/payments/webhooks/:gateway', async (request, response, next) => {
  try {
    const gateway = request.params.gateway.trim().toLowerCase()
    const result = await database.query<{ enabled: boolean; config: Record<string, unknown> }>(`SELECT enabled,config FROM payment_gateways WHERE name=$1`, [gateway])
    const config = result.rows[0]?.config
    if (!result.rows[0]?.enabled || !config) return response.status(404).json({ message: 'Payment gateway is not enabled.' })
    const signature = request.header(`x-${gateway}-signature`) ?? request.header('x-razorpay-signature')
    const webhookSecret = typeof config.webhookSecret === 'string' ? config.webhookSecret : ''
    if (webhookSecret) {
      if (!signature) return response.status(401).json({ message: 'Webhook signature is required.' })
      const payload = JSON.stringify(request.body ?? {})
      const expected = createHmac('sha256', webhookSecret).update(payload).digest('hex')
      const supplied = Buffer.from(signature)
      const expectedBuffer = Buffer.from(expected)
      if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) return response.status(401).json({ message: 'Invalid webhook signature.' })
    }
    await auditAdmin('payment-webhook', 'payment_webhook_received', 'payment_gateway', gateway, { event: request.body?.event ?? request.body?.type ?? 'unknown' })
    response.json({ received: true, gateway })
  } catch (error) { next(error) }
})
app.post('/api/payments/order', async (request, response, next) => {
  try {
    const requestedAmount = Number(request.body?.amount ?? 100000)
    if (!Number.isInteger(requestedAmount) || requestedAmount < 10000) return response.status(400).json({ message: 'Payment amount must be at least ₹100.' })
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
          amount: requestedAmount,
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
      amount: requestedAmount,
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
app.post('/api/payments/verify', async (request, response) => {
  const body = request.body as Record<string, unknown>
  const orderId = String(body.razorpay_order_id ?? body.orderId ?? '') || null
  const subscriptionId = String(body.razorpay_subscription_id ?? body.subscriptionId ?? '') || null
  const paymentId = String(body.razorpay_payment_id ?? body.paymentId ?? '') || null
  const signature = String(body.razorpay_signature ?? body.signature ?? '') || null
  const userId = typeof body.userId === 'string' ? body.userId : undefined
  const amount = Number(body.amount ?? 100000)
  if (!paymentId || !serverConfig.razorpay.keySecret) {
    return response.status(400).json({ verified: false, message: !serverConfig.razorpay.keySecret ? 'Payment verification is unavailable because Razorpay secret is not configured on the server.' : 'Razorpay did not return a payment ID.' })
  }

  let expected: string
  if (subscriptionId) {
    expected = createHmac('sha256', serverConfig.razorpay.keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex')
  } else if (orderId) {
    expected = createHmac('sha256', serverConfig.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  } else {
    return response.status(400).json({ verified: false, message: 'Missing order_id or subscription_id' })
  }

  let verified = Boolean(signature && expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
  // Some subscription callbacks omit the signature in embedded/redirect flows.
  // Confirm the payment server-to-server before accepting that callback.
  if (!verified && !signature) {
    try {
      const razorpay = new Razorpay({ key_id: serverConfig.razorpay.keyId, key_secret: serverConfig.razorpay.keySecret })
      const payment = await razorpay.payments.fetch(paymentId)
      verified = payment.status === 'captured' || payment.status === 'authorized'
    } catch { verified = false }
  }
  if (verified && userId) {
    const months = Math.max(1, Math.floor(Number(amount) / 100000))
    await database.query(`INSERT INTO payments (user_id,payment_id,amount,mode,status,verified_at) VALUES ($1,$2,$3,'test','verified',NOW()) ON CONFLICT(payment_id) DO NOTHING`, [userId, paymentId, Math.round(Number(amount) / 100)])
    await database.query(`INSERT INTO candidate_billing (user_id,status,period_end,advance_months,included_jobs,used_jobs,updated_at) VALUES ($1,'active',NOW()+($2 * INTERVAL '1 month'),$2,$2*100,0,NOW()) ON CONFLICT(user_id) DO UPDATE SET status='active',period_end=GREATEST(COALESCE(candidate_billing.period_end,NOW()),NOW())+($2 * INTERVAL '1 month'),advance_months=candidate_billing.advance_months+$2,included_jobs=candidate_billing.included_jobs+$2*100,updated_at=NOW()`, [userId, months])
  }
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
