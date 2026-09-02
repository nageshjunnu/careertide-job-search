import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Activity, BarChart3, Bell, CreditCard, LayoutDashboard, LogOut, Menu, PauseCircle, PlayCircle, Settings, ShieldCheck, SlidersHorizontal, Trash2, Users, X } from 'lucide-react'
import { adminApi, type AdminOverview, type AdminUser, type CandidateAnalytics, type JobRunSchedule, type PaymentGateway, type PlatformConfig } from '../services/admin.api'
import '../styles/admin.css'

const SESSION_KEY = 'careertide-admin-session'
type Section = 'overview' | 'users' | 'analytics' | 'platforms' | 'runs' | 'schedules' | 'payments' | 'notifications' | 'settings'

const nav = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'users', label: 'Candidates', Icon: Users },
  { id: 'analytics', label: 'Candidate analytics', Icon: BarChart3 },
  { id: 'platforms', label: 'Platform Gateways', Icon: SlidersHorizontal },
  { id: 'runs', label: 'Job runs', Icon: Activity },
  { id: 'schedules', label: 'Cron jobs', Icon: Settings },
  { id: 'payments', label: 'Payments', Icon: CreditCard },
  { id: 'notifications', label: 'Email logs', Icon: Bell },
  { id: 'settings', label: 'Settings', Icon: Settings },
] as const
const num = (value?: string) => Number(value ?? 0).toLocaleString('en-IN')

export function AdminPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { section: routeSection, candidateId } = useParams<{ section?: string; candidateId?: string }>()
  const [token, setToken] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [candidateAnalytics, setCandidateAnalytics] = useState<CandidateAnalytics[]>([])
  const [jobSchedules, setJobSchedules] = useState<JobRunSchedule[]>([])
  const [platformConfigs, setPlatformConfigs] = useState<PlatformConfig[]>([])
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([])
  const [section, setSection] = useState<Section>(() => nav.some((item) => item.id === routeSection) ? routeSection as Section : 'overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [selectedAnalytics, setSelectedAnalytics] = useState<CandidateAnalytics | null>(null)
  useEffect(() => { if (nav.some((item) => item.id === routeSection)) setSection(routeSection as Section); else if (location.pathname === '/admin') setSection('overview') }, [location.pathname, routeSection])
  const openSection = (next: Section) => { setSection(next); navigate(next === 'overview' ? '/admin' : `/admin/${next}`); setMenuOpen(false) }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [overviewData, usersData, analyticsData, scheduleData, platformData, paymentGatewayData] = await Promise.all([
        adminApi.overview(token),
        adminApi.users(token),
        adminApi.candidateAnalytics(token).catch(() => ({ analytics: [] })),
        adminApi.jobRunSchedules(token).catch(() => ({ schedules: [] })),
        adminApi.platformConfigs(token).catch(() => ({ configs: [] })),
        adminApi.paymentGateways(token).catch(() => ({ gateways: [] })),
      ])
      setOverview(overviewData)
      setUsers(usersData.users)
      setCandidateAnalytics(analyticsData.analytics)
      setJobSchedules(scheduleData.schedules)
      setPlatformConfigs(platformData.configs)
      setPaymentGateways(paymentGatewayData.gateways)
      setError('')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Could not load the admin dashboard.'
      setError(message)
      if (/session|sign-in|401/i.test(message)) {
        sessionStorage.removeItem(SESSION_KEY)
        setToken('')
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    const loadTimer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(loadTimer)
  }, [load, token])

  // Validate the admin JWT/session periodically so idle administrators are
  // returned to the login screen without needing a page refresh.
  useEffect(() => {
    if (!token) return
    const validate = async () => {
      try {
        await adminApi.overview(token)
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : ''
        if (/session|sign-in|401|expired/i.test(message)) {
          sessionStorage.removeItem(SESSION_KEY)
          setToken('')
          setOverview(null)
          setError('Your admin session expired after inactivity. Please sign in again.')
        }
      }
    }
    const interval = window.setInterval(() => { void validate() }, 5 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [token])

  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await adminApi.login(email, password)
      sessionStorage.setItem(SESSION_KEY, result.token)
      setToken(result.token)
      setPassword('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await adminApi.logout(token)
    } finally {
      sessionStorage.removeItem(SESSION_KEY)
      setToken('')
      setOverview(null)
    }
  }

  const updateWorkflow = async (user: AdminUser) => {
    const next = user.workflow_status === 'active' ? 'paused' : 'active'
    await adminApi.updateWorkflow(token, user.id, next)
    await load()
  }

  const saveRules = async (user: AdminUser, rules: { schedule: string; timezone: string; dailyLimit: number; minimumScore: number; locations: string }) => {
    await adminApi.updateRules(token, user.id, rules)
    setSelectedUser(null)
    await load()
  }
  const saveCandidateEmail = async (user: AdminUser, email: string) => { await adminApi.updateCandidateEmail(token, user.id, email); await load() }

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.full_name} and all of their CareerTide data? This cannot be undone.`)) return
    await adminApi.deleteUser(token, user.id)
    setSelectedUser(null)
    await load()
  }

  const togglePlatformMode = async (source: string, currentMode: 'api' | 'recruiter_email') => {
    const nextMode = currentMode === 'api' ? 'recruiter_email' : 'api'
    await adminApi.updatePlatformConfig(token, source, { mode: nextMode })
    await load()
  }
  const togglePlatformEnabled = async (source: string, enabled: boolean) => { await adminApi.updatePlatformConfig(token, source, { autoDispatch: enabled }); await load() }

  const updatePlatformKeys = async (source: string, api_key: string, api_secret: string, integration: { oauth_authorize_url?: string; oauth_token_url?: string; redirect_uri?: string; scopes?: string } = {}) => {
    await adminApi.updatePlatformConfig(token, source, { api_key, api_secret, ...integration })
    await load()
  }

  const updatePaymentGateway = async (name: string, payload: { enabled?: boolean; isDefault?: boolean; mode?: 'test' | 'live'; apiKey?: string; apiSecret?: string; webhookUrl?: string; webhookSecret?: string }) => {
    await adminApi.updatePaymentGateway(token, name, payload)
    await load()
  }
  const updateSchedule = async (id: number, payload: { cronExpression?: string; active?: boolean; timezone?: string }) => { await adminApi.updateJobRunSchedule(token, id, payload); await load() }

  if (!token) {
    return (
      <main className="admin-login">
        <section>
          <div className="admin-login-brand">
            <ShieldCheck /> <span>Career<span>Tide</span> Admin</span>
          </div>
          <small>CONTROL CENTER</small>
          <h1>Run your career platform with clarity.</h1>
          <p>Secure access to candidates, job runs, platform activity, payments, and operational controls.</p>
          <form onSubmit={login}>
            <label>
              Admin email
              <input value={email} type="email" onChange={(event) => setEmail(event.target.value)} placeholder="admin@careertide.com" required />
            </label>
            <label>
              Password
              <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
            </label>
            {error && <div className="admin-error">{error}</div>}
            <button disabled={loading}>{loading ? 'Checking access…' : 'Sign in to Admin'}</button>
          </form>
          <small className="admin-login-note">Credentials are configured through secure server environment variables.</small>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <aside className={menuOpen ? 'open' : ''}>
        <div className="admin-brand">
          <ShieldCheck />
          <strong>Career<span>Tide</span></strong>
          <small>ADMIN</small>
          <button className="admin-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close admin menu">
            <X />
          </button>
        </div>
        <nav>
          {nav.map(({ id, label, Icon }) => (
            <button className={section === id ? 'active' : ''} key={id} onClick={() => openSection(id)}>
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-user">
          <span>Platform administrator</span>
          <button onClick={() => void logout()}>
            <LogOut /> Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header>
          <button className="admin-menu" onClick={() => setMenuOpen(true)} aria-label="Open admin menu">
            <Menu />
          </button>
          <div>
            <small>ADMIN / {section.toUpperCase()}</small>
            <h1>{nav.find((item) => item.id === section)?.label}</h1>
          </div>
          <button className="admin-refresh" onClick={() => void load()}>
            <Activity /> {loading ? 'Refreshing' : 'Live data'}
          </button>
        </header>

        {error && <div className="admin-error">{error}</div>}
        {!overview && loading && <AdminSkeleton />}
        {overview && (
          <AdminContent
            token={token}
            section={section}
            candidateId={candidateId}
            overview={overview}
            users={users}
            candidateAnalytics={candidateAnalytics}
            jobSchedules={jobSchedules}
            platformConfigs={platformConfigs}
            paymentGateways={paymentGateways}
            onWorkflow={updateWorkflow}
            onManage={setSelectedUser}
            onViewAnalytics={(analytics) => navigate(`/admin/analytics/${analytics.id}`)}
            onTogglePlatform={togglePlatformMode}
            onTogglePlatformEnabled={togglePlatformEnabled}
            onUpdateKeys={updatePlatformKeys}
            onUpdatePaymentGateway={updatePaymentGateway}
            onUpdateSchedule={updateSchedule}
          />
        )}
      </div>

      <nav className="admin-mobile-shortcuts" aria-label="Admin shortcuts">
        {nav.slice(0, 4).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={section === id ? 'active' : ''}
            onClick={() => {
              openSection(id as Section)
            }}
            aria-label={label}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button onClick={() => setMenuOpen(true)}>
          <Menu />
          <span>More</span>
        </button>
      </nav>

      {selectedUser && (
        <CandidateManager user={selectedUser} onClose={() => setSelectedUser(null)} onSave={saveRules} onSaveEmail={saveCandidateEmail} onDelete={deleteUser} />
      )}
      {selectedAnalytics && <CandidateAnalyticsModal analytics={selectedAnalytics} onClose={() => setSelectedAnalytics(null)} />}
    </main>
  )
}

function AdminSkeleton() {
  return <section className="admin-skeleton" aria-label="Loading admin data" aria-busy="true">
    <div className="admin-skeleton-stats">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
    <i className="admin-skeleton-panel" />
    <i className="admin-skeleton-panel short" />
  </section>
}

function AdminContent({
  token,
  section,
  candidateId,
  overview,
  users,
  candidateAnalytics,
  jobSchedules,
  platformConfigs,
  paymentGateways,
  onWorkflow,
  onManage,
  onViewAnalytics,
  onTogglePlatform,
  onTogglePlatformEnabled,
  onUpdateKeys,
  onUpdatePaymentGateway,
  onUpdateSchedule,
}: {
  token: string
  section: Section
  candidateId?: string
  overview: AdminOverview
  users: AdminUser[]
  candidateAnalytics: CandidateAnalytics[]
  jobSchedules: JobRunSchedule[]
  platformConfigs: PlatformConfig[]
  paymentGateways: PaymentGateway[]
  onWorkflow: (user: AdminUser) => Promise<void>
  onManage: (user: AdminUser) => void
  onViewAnalytics: (analytics: CandidateAnalytics) => void
  onTogglePlatform: (source: string, currentMode: 'api' | 'recruiter_email') => Promise<void>
  onTogglePlatformEnabled: (source: string, enabled: boolean) => Promise<void>
  onUpdateKeys: (source: string, apiKey: string, apiSecret: string, integration?: { oauth_authorize_url?: string; oauth_token_url?: string; redirect_uri?: string; scopes?: string }) => Promise<void>
  onUpdatePaymentGateway: (name: string, payload: { enabled?: boolean; isDefault?: boolean; mode?: 'test' | 'live'; apiKey?: string; apiSecret?: string; webhookUrl?: string; webhookSecret?: string }) => Promise<void>
  onUpdateSchedule: (id: number, payload: { cronExpression?: string; active?: boolean; timezone?: string }) => Promise<void>
}) {
  if (section === 'users') {
    return (
      <section className="admin-content">
        <Panel title="Candidate directory" subtitle="Profiles, preferences, and workflow controls">
          <CandidateTable users={users} onWorkflow={onWorkflow} onManage={onManage} />
        </Panel>
      </section>
    )
  }

  if (section === 'analytics') {
    const detail = candidateId ? candidateAnalytics.find((item) => item.id === candidateId) : null
    const candidate = candidateId ? users.find((item) => item.id === candidateId) : null
    if (candidateId) return <section className="admin-content"><button className="workflow-control" onClick={() => window.history.back()}>← Back to analytics</button>{detail ? <Panel title={`${detail.full_name} — candidate dashboard`} subtitle={`${detail.email} · individual analytics and controls`}><div className="admin-user-actions" style={{ padding: '14px 18px' }}><button className="workflow-control" onClick={() => candidate && onManage(candidate)}><SlidersHorizontal /> Edit candidate settings</button></div><CandidateAnalyticsTable analytics={[detail]} onView={() => {}} /></Panel> : <AdminSkeleton />}</section>
    return <section className="admin-content"><Panel title="Candidate analytics" subtitle="Separate job-search, application, email, and workflow activity for every candidate."><CandidateAnalyticsTable analytics={candidateAnalytics} onView={onViewAnalytics} /></Panel></section>
  }

  if (section === 'platforms') {
    return (
      <section className="admin-content">
        <Panel
          title="Platform Gateways & Dispatch Modes"
          subtitle="Configure API Integration Mode (ON) vs Recruiter Direct Email Dispatch Mode (OFF) for each job platform"
        >
          <PlatformConfigManager configs={platformConfigs} onToggle={onTogglePlatform} onToggleEnabled={onTogglePlatformEnabled} onUpdateKeys={onUpdateKeys} />
        </Panel>
      </section>
    )
  }

  if (section === 'runs') {
    return (
      <section className="admin-content">
        <Panel title="Recent job runs" subtitle="Genuine PostgreSQL-backed job-search activity">
          <RunList runs={overview.recentRuns} />
        </Panel>
      </section>
    )
  }
  if (section === 'schedules') {
    return <section className="admin-content"><Panel title="Cron job schedules" subtitle="Configure the automated job-run pipeline. Cron format: minute hour day month weekday."><CronScheduleManager schedules={jobSchedules} onUpdate={onUpdateSchedule} /></Panel></section>
  }

  if (section === 'payments') {
    return (
      <section className="admin-content">
        <StatGrid overview={overview} />
        <Panel title="Payment gateway configuration" subtitle="Choose enabled providers, test/live mode, API credentials, and webhook URLs.">
          <PaymentGatewayManager gateways={paymentGateways} onUpdate={onUpdatePaymentGateway} />
        </Panel>
        <Panel title="Membership controls" subtitle="Control candidate subscription availability and included application limits."><MembershipControls token={token} /></Panel><Panel title="Candidate payment history" subtitle="Every candidate payment, advance month, gateway mode, and verification status."><PaymentHistory token={token} /></Panel>
      </section>
    )
  }

  if (section === 'notifications') {
    return (
      <section className="admin-content">
        <StatGrid overview={overview} />
        <Panel title="Admin activity" subtitle="Security and operational audit events">
          <AuditList audits={overview.audits} />
        </Panel>
      </section>
    )
  }

  if (section === 'settings') {
    return (
      <section className="admin-content">
        <Panel title="Platform settings" subtitle="Control candidate payments, branding, billing prices, and delivery preferences."><AdminSettingsForm token={token} /></Panel>
      </section>
    )
  }

  return (
    <section className="admin-content">
      <StatGrid overview={overview} />
      <div className="admin-layout">
        <Panel title="Candidate activity" subtitle="Latest onboarding and workflow status">
          <CandidateTable users={users.slice(0, 5)} onWorkflow={onWorkflow} onManage={onManage} />
        </Panel>
        <Panel title="Recent search runs" subtitle="Live database activity">
          <RunList runs={overview.recentRuns.slice(0, 5)} />
        </Panel>
      </div>
      <div className="admin-layout">
        <Panel title="Source adoption" subtitle="Selected and active source workflows">
          <SourceSignals sources={overview.sources} />
        </Panel>
        <Panel title="Candidate demand signals" subtitle="Most requested roles from candidate profiles">
          <TrendSignals trends={overview.trends} />
        </Panel>
      </div>
      <Panel title="Administrative audit trail" subtitle="Recent protected admin actions">
        <AuditList audits={overview.audits} />
      </Panel>
    </section>
  )
}

function PlatformConfigManager({
  configs,
  onToggle,
  onToggleEnabled,
  onUpdateKeys,
}: {
  configs: PlatformConfig[]
  onToggle: (source: string, currentMode: 'api' | 'recruiter_email') => Promise<void>
  onToggleEnabled: (source: string, enabled: boolean) => Promise<void>
  onUpdateKeys: (source: string, apiKey: string, apiSecret: string, integration?: { oauth_authorize_url?: string; oauth_token_url?: string; redirect_uri?: string; scopes?: string }) => Promise<void>
}) {
  const defaultPlatforms = [
        { source: 'Naukri', mode: 'recruiter_email', auto_dispatch: true, updated_at: '' },
        { source: 'LinkedIn', mode: 'recruiter_email', auto_dispatch: true, updated_at: '' },
        { source: 'Foundit', mode: 'recruiter_email', auto_dispatch: true, updated_at: '' },
        { source: 'Indeed', mode: 'recruiter_email', auto_dispatch: true, updated_at: '' },
        { source: 'Google Jobs', mode: 'recruiter_email', auto_dispatch: true, updated_at: '' },
        { source: 'Remotive', mode: 'api', auto_dispatch: true, updated_at: '' },
        { source: 'Arbeitnow', mode: 'api', auto_dispatch: true, updated_at: '' },
        { source: 'Jobicy', mode: 'api', auto_dispatch: true, updated_at: '' },
      ] as PlatformConfig[]
  const platforms = defaultPlatforms.map(fallback => configs.find(item => item.source.toLowerCase() === fallback.source.toLowerCase()) ?? fallback)
  configs.forEach(item => { if (!platforms.some(platform => platform.source.toLowerCase() === item.source.toLowerCase())) platforms.push(item) })

  return (
    <div className="admin-platform-grid">
      {platforms.map((config) => (
        <PlatformConfigCard key={config.source} config={config} onToggle={onToggle} onToggleEnabled={onToggleEnabled} onUpdateKeys={onUpdateKeys} />
      ))}
    </div>
  )
}

function PlatformConfigCard({ config, onToggle, onToggleEnabled, onUpdateKeys }: { config: PlatformConfig, onToggle: (source: string, currentMode: 'api' | 'recruiter_email') => Promise<void>, onToggleEnabled: (source: string, enabled: boolean) => Promise<void>, onUpdateKeys: (source: string, apiKey: string, apiSecret: string, integration?: { oauth_authorize_url?: string; oauth_token_url?: string; redirect_uri?: string; scopes?: string }) => Promise<void> }) {
  const [isBusy, setIsBusy] = useState(false)
  const [showIntegration, setShowIntegration] = useState(false)
  const [apiKey, setApiKey] = useState(config.api_key || '')
  const [apiSecret, setApiSecret] = useState(config.api_secret || '')
  const [authorizeUrl, setAuthorizeUrl] = useState(config.oauth_authorize_url || '')
  const [tokenUrl, setTokenUrl] = useState(config.oauth_token_url || '')
  const [redirectUri, setRedirectUri] = useState(config.redirect_uri || '')
  const [scopes, setScopes] = useState(config.scopes || '')
  const isApi = config.mode === 'api'

  const handleToggle = async () => {
    setIsBusy(true)
    try {
      await onToggle(config.source, config.mode as 'api' | 'recruiter_email')
    } finally {
      setIsBusy(false)
    }
  }

  const handleSaveKeys = async () => {
    setIsBusy(true)
    try {
      await onUpdateKeys(config.source, apiKey, apiSecret, { oauth_authorize_url: authorizeUrl, oauth_token_url: tokenUrl, redirect_uri: redirectUri, scopes })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className={`admin-platform-card ${isApi ? 'api-mode' : 'email-mode'}`}>
      <div className="platform-card-top">
        <div className="platform-card-title">
          <strong>{config.source}</strong>
          <span className={`mode-badge ${isApi ? 'api' : 'email'}`}>
            {isApi ? '⚡ API Integration ON' : '✉️ Recruiter Email Dispatch'}
          </span>
        </div>
        <button
          className="toggle-mode-btn"
          disabled={isBusy}
          onClick={() => void handleToggle()}
        >
          {isBusy ? 'Switching…' : isApi ? 'Switch to Email Dispatch' : 'Enable API Integration'}
        </button>
        <button className="toggle-mode-btn" disabled={isBusy} onClick={() => void onToggleEnabled(config.source, !config.auto_dispatch)}>{config.auto_dispatch ? 'Disable for candidates' : 'Enable for candidates'}</button>
        <button className="toggle-mode-btn" type="button" onClick={() => setShowIntegration(true)}>View integration</button>
      </div>
      <p className="platform-card-desc">
        {isApi ? (
          <>
            <strong>API Mode Active</strong>: Uses direct OAuth provider authorization and API gateways for job application submissions.
          </>
        ) : (
          <>
            <strong>Recruiter Email Mode Active</strong>: Automatically extracts recruiter/HR emails from Job Descriptions, dispatches candidate resume & pitch to recruiter email, and sends email notifications to Candidate & Admin.
          </>
        )}
      </p>
      <div className="platform-card-features">
        <span>{isApi ? '✓ Direct API Submission' : '✓ Recruiter Email Extraction'}</span>
        <span>{isApi ? '✓ OAuth Token Encrypted' : '✓ Candidate Email Confirmation'}</span>
        <span>✓ Admin Audit Copy</span>
      </div>
      {isApi && (
        <div className="platform-api-keys-form" style={{ marginTop: '12px', borderTop: '1px solid #d1d5db', paddingTop: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>
              API Key (Client ID)
              <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ width: '100%', marginTop: '4px', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', background: '#fff', color: '#000' }} placeholder="Enter API Key" />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>OAuth authorize URL<input type="text" value={authorizeUrl} onChange={e => setAuthorizeUrl(e.target.value)} placeholder="https://provider/authorize" style={{ width: '100%', marginTop: '4px', padding: '6px' }} /></label>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>OAuth token URL<input type="text" value={tokenUrl} onChange={e => setTokenUrl(e.target.value)} placeholder="https://provider/token" style={{ width: '100%', marginTop: '4px', padding: '6px' }} /></label>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Redirect URI<input type="text" value={redirectUri} onChange={e => setRedirectUri(e.target.value)} placeholder="https://your-app/callback" style={{ width: '100%', marginTop: '4px', padding: '6px' }} /></label>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>OAuth scopes<input type="text" value={scopes} onChange={e => setScopes(e.target.value)} placeholder="jobs.read jobs.apply" style={{ width: '100%', marginTop: '4px', padding: '6px' }} /></label>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>
              API Secret (Client Secret)
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} style={{ width: '100%', marginTop: '4px', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px', background: '#fff', color: '#000' }} placeholder="Enter API Secret" />
            </label>
            <button onClick={() => void handleSaveKeys()} disabled={isBusy} style={{ alignSelf: 'flex-start', padding: '6px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              {isBusy ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
      {showIntegration && <IntegrationInfoModal source={config.source} onClose={() => setShowIntegration(false)} />}
    </div>
  )
}

function IntegrationInfoModal({ source, onClose }: { source: string; onClose: () => void }) {
  const links: Record<string, string> = {
    LinkedIn: 'https://www.linkedin.com/developers/apps',
    Monster: 'https://developer.nxtdev.monster.io/',
    Naukri: 'https://enterprise.naukri.com/recruit/login',
    Foundit: 'https://recruiter.foundit.in/',
    Shine: 'https://www.shine.com/',
  }
  const restricted = ['Naukri', 'LinkedIn', 'Foundit', 'Monster', 'Shine'].includes(source)
  return <div className="admin-modal-backdrop" role="dialog" aria-modal="true"><div className="admin-modal" style={{ maxWidth: 560 }}><div className="admin-modal-header"><h3>{source} integration setup</h3><button type="button" onClick={onClose}>×</button></div><div className="admin-modal-body"><ol><li>Create or request an approved developer/partner application with {source}.</li><li>Register this callback URL: <code>{window.location.origin}/api/integrations/{source.toLowerCase()}/callback</code></li><li>Copy the client/partner ID and secret into the fields on this card.</li><li>Enter the provider OAuth URLs and only the scopes they approve, then save.</li><li>Enable API Integration and Enable for candidates after testing.</li></ol>{restricted && <p><strong>Approval required:</strong> job search and automatic application scopes are not public for this source. Candidate authorization is also required.</p>} {links[source] && <a href={links[source]} target="_blank" rel="noreferrer">Open official {source} developer/partner page ↗</a>}</div><div className="admin-modal-actions"><button type="button" onClick={onClose}>Close</button></div></div></div>
}

function PaymentGatewayManager({ gateways, onUpdate }: { gateways: PaymentGateway[]; onUpdate: (name: string, payload: { enabled?: boolean; isDefault?: boolean; mode?: 'test' | 'live'; apiKey?: string; apiSecret?: string; webhookUrl?: string; webhookSecret?: string }) => Promise<void> }) {
  const items = gateways.length ? gateways : ['razorpay', 'stripe', 'payu', 'cashfree', 'phonepe'].map((name) => ({ name, enabled: name === 'razorpay', is_default: name === 'razorpay', mode: 'test' as const, configured: false, config: { apiKey: '', webhookUrl: '' }, updated_at: '' }))
  return <div className="admin-gateway-grid">{items.map((gateway) => <PaymentGatewayCard key={gateway.name} gateway={gateway} onUpdate={onUpdate} />)}</div>
}

function AdminSettingsForm({ token }: { token: string }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { void adminApi.settings(token).then(({ settings }) => setValues(settings)).catch((error) => setMessage(error.message)) }, [token])
  const field = (key: string, label: string, type = 'text') => <label>{label}<input type={type} value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>
  const save = async () => { setSaving(true); try { await adminApi.updateSettings(token, values); setMessage('Settings saved successfully.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.') } finally { setSaving(false) } }
  return <div className="admin-settings-form">
    <section><h3>Brand & candidate experience</h3>{field('brand_name', 'Project name')}<label>Upload logo image<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { setMessage('Logo must be under 2 MB.'); return }; const reader = new FileReader(); reader.onload = () => { const dataUrl = String(reader.result); void adminApi.uploadLogo(token, dataUrl).then(({ logoUrl }) => { setValues((current) => ({ ...current, logo_url: logoUrl })); setMessage('Logo uploaded. Save all settings to keep other edits.'); }).catch((error) => setMessage(error.message)) }; reader.readAsDataURL(file) }} /></label>{values.logo_url && <img className="admin-logo-preview" src={values.logo_url} alt="Current site logo" />}<label className="admin-checkbox"><input type="checkbox" checked={values.candidate_payments_enabled !== 'false'} onChange={(event) => setValues((current) => ({ ...current, candidate_payments_enabled: String(event.target.checked) }))} /> Show payment options to candidates</label></section>
    <section><h3>Pricing controls</h3><p>Membership availability, plan amounts, included jobs, and source charges are managed from the Payments page.</p></section>
    <section><h3>Email delivery</h3>{field('smtp_host', 'SMTP host')}{field('smtp_port', 'SMTP port', 'number')}{field('smtp_from', 'From email address')}<small>SMTP passwords and payment secrets remain secured in environment variables.</small></section>
    <section><h3>Admin profile</h3><p>Admin login email and password are managed through server environment variables.</p><button className="admin-save" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save all settings'}</button>{message && <small>{message}</small>}</section>
    <AdminPasswordForm token={token} />
  </div>
}

function AdminPasswordForm({ token }: { token: string }) {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); setMessage(''); try { await adminApi.updatePassword(token, current, next); setCurrent(''); setNext(''); setMessage('Admin password changed successfully.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not change password.') } finally { setBusy(false) } }
  return <section><h3>Change admin password</h3><label>Current password<input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} /></label><label>New password<input type="password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="8+ chars, upper/lower/number/symbol" /></label><button className="admin-save" disabled={busy} onClick={() => void save()}>{busy ? 'Changing…' : 'Change password'}</button>{message && <small>{message}</small>}</section>
}

function MembershipControls({ token }: { token: string }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  useEffect(() => { void adminApi.settings(token).then(({ settings }) => setValues(settings)) }, [token])
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }))
  const save = async () => { await adminApi.updateSettings(token, values); setMessage('Membership controls saved.') }
  return <div className="admin-settings-form"><section><h3>Candidate membership</h3><label className="admin-checkbox"><input type="checkbox" checked={values.monthly_membership_enabled !== 'false'} onChange={(event) => set('monthly_membership_enabled', String(event.target.checked))} /> Enable monthly membership for candidates</label><label>Monthly price (₹)<input type="number" value={values.monthly_membership_amount ?? '1000'} onChange={(event) => set('monthly_membership_amount', event.target.value)} /></label><label>Included applications<input type="number" value={values.included_jobs ?? '100'} onChange={(event) => set('included_jobs', event.target.value)} /></label></section><section><h3>Advance plans & usage</h3><label>Quarterly price (₹)<input type="number" value={values.quarterly_membership_amount ?? '3000'} onChange={(event) => set('quarterly_membership_amount', event.target.value)} /></label><label>Yearly price (₹)<input type="number" value={values.yearly_membership_amount ?? '12000'} onChange={(event) => set('yearly_membership_amount', event.target.value)} /></label><label>Extra job price (₹)<input type="number" value={values.extra_job_amount ?? '10'} onChange={(event) => set('extra_job_amount', event.target.value)} /></label><button className="admin-save" onClick={() => void save()}>Save membership controls</button>{message && <small>{message}</small>}</section></div>
}
function PaymentHistory({ token }: { token: string }) {
  const [payments, setPayments] = useState<Array<{ id: number; payment_id: string; amount: number; mode: string; status: string; verified_at: string | null; created_at: string; full_name: string | null; email: string | null; months_covered: number }>>([])
  useEffect(() => { void adminApi.payments(token).then(({ payments: rows }) => setPayments(rows)).catch(() => {}) }, [token])
  return <div className="admin-table-wrap"><table><thead><tr><th>Candidate</th><th>Amount</th><th>Months</th><th>Gateway mode</th><th>Status</th><th>Paid date</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><strong>{payment.full_name || 'Unknown'}</strong><small>{payment.email || '—'}</small></td><td>₹{Number(payment.amount).toLocaleString('en-IN')}</td><td>{payment.months_covered}</td><td>{payment.mode}</td><td><span className={`admin-status ${payment.status}`}>{payment.status}</span></td><td>{new Date(payment.verified_at || payment.created_at).toLocaleString()}</td></tr>)}{!payments.length && <tr><td colSpan={6}>No candidate payments recorded yet.</td></tr>}</tbody></table></div>
}

function CronScheduleManager({ schedules, onUpdate }: { schedules: JobRunSchedule[]; onUpdate: (id: number, payload: { cronExpression?: string; active?: boolean; timezone?: string }) => Promise<void> }) {
  return <div className="admin-gateway-grid">{schedules.map((schedule) => <CronScheduleCard key={schedule.id} schedule={schedule} onUpdate={onUpdate} />)}{!schedules.length && <div className="admin-empty">Loading schedules or none have been configured.</div>}</div>
}
function CronScheduleCard({ schedule, onUpdate }: { schedule: JobRunSchedule; onUpdate: (id: number, payload: { cronExpression?: string; active?: boolean; timezone?: string }) => Promise<void> }) {
  const [expression, setExpression] = useState(schedule.cron_expression)
  const [timezone, setTimezone] = useState(schedule.timezone)
  const [active, setActive] = useState(schedule.active)
  const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); try { await onUpdate(schedule.id, { cronExpression: expression, timezone, active }) } finally { setBusy(false) } }
  return <article className="admin-gateway-card"><div className="platform-card-top"><strong>{schedule.name}</strong><span className={`mode-badge ${active ? 'api' : 'email'}`}>{active ? 'Running' : 'Stopped'}</span></div><label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Enable this pipeline</label><label>Cron expression<input value={expression} onChange={(event) => setExpression(event.target.value)} placeholder="0 2 * * *" /></label><label>Time zone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><small>Examples: <code>0 2 * * *</code> daily at 02:00 · <code>*/15 * * * *</code> every 15 minutes</small><button className="admin-save" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save schedule'}</button></article>
}

function PaymentGatewayCard({ gateway, onUpdate }: { gateway: PaymentGateway; onUpdate: (name: string, payload: { enabled?: boolean; isDefault?: boolean; mode?: 'test' | 'live'; apiKey?: string; apiSecret?: string; webhookUrl?: string; webhookSecret?: string }) => Promise<void> }) {
  const [enabled, setEnabled] = useState(gateway.enabled)
  const [isDefault, setIsDefault] = useState(gateway.is_default)
  const [mode, setMode] = useState<'test' | 'live'>(gateway.mode)
  const [apiKey, setApiKey] = useState(gateway.config.apiKey)
  const [apiSecret, setApiSecret] = useState('')
  const [webhookUrl, setWebhookUrl] = useState(gateway.config.webhookUrl)
  const [webhookSecret, setWebhookSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await onUpdate(gateway.name, { enabled, isDefault: isDefault && enabled, mode, apiKey, ...(apiSecret ? { apiSecret } : {}), ...(webhookSecret ? { webhookSecret } : {}), webhookUrl }) } finally { setBusy(false) }
  }
  return <article className="admin-gateway-card">
    <div className="platform-card-top"><strong>{gateway.name === 'payu' ? 'PayU' : gateway.name === 'phonepe' ? 'PhonePe' : gateway.name[0].toUpperCase() + gateway.name.slice(1)}</strong><span className={`mode-badge ${gateway.enabled ? 'api' : 'email'}`}>{gateway.enabled ? (gateway.is_default ? 'Default' : 'Enabled') : 'Disabled'}</span></div>
    <div className="admin-gateway-controls">
      <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Accept payments</label>
      <label><input type="checkbox" checked={isDefault} disabled={!enabled} onChange={(event) => setIsDefault(event.target.checked)} /> Default for candidates</label>
      <label>Environment<select value={mode} onChange={(event) => setMode(event.target.value as 'test' | 'live')}><option value="test">Test</option><option value="live">Live</option></select></label>
    </div>
    <label>API key / Client ID<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Provider API key" /></label>
    <label>API secret<input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} placeholder={gateway.configured ? 'Saved — enter to replace' : 'Provider API secret'} /></label>
    <label>Webhook URL<input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={`/api/payments/webhooks/${gateway.name}`} /></label>
    <label>Webhook signing secret<input type="password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder="Saved separately; enter to replace" /></label>
    <button className="admin-save" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save gateway'}</button>
  </article>
}

function StatGrid({ overview }: { overview: AdminOverview }) {
  const items = [
    { label: 'Registered candidates', value: num(overview.totals.users), note: `${num(overview.totals.profiles)} profiles ready`, Icon: Users },
    { label: 'Active workflows', value: num(overview.workflows.active), note: `${num(overview.workflows.paused)} paused`, Icon: Activity },
    { label: 'Verified payments', value: num(overview.payments.verified), note: `₹${num(overview.payments.amount)} recorded`, Icon: CreditCard },
    { label: 'Email delivery', value: num(overview.emails.sent), note: `${num(overview.emails.failed)} failed`, Icon: Bell },
  ]
  return (
    <div className="admin-stats">
      {items.map(({ label, value, note, Icon }) => (
        <article key={label}>
          <span><Icon /></span>
          <small>{label}</small>
          <strong>{value}</strong>
          <em>{note}</em>
        </article>
      ))}
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <article className="admin-panel">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <BarChart3 />
      </header>
      {children}
    </article>
  )
}

function CandidateTable({ users, onWorkflow, onManage }: { users: AdminUser[]; onWorkflow: (user: AdminUser) => Promise<void>; onManage: (user: AdminUser) => void }) {
  return (
    <div className="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Profile</th>
            <th>Matches</th>
            <th>Workflow</th>
            <th>Control</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <strong>{user.full_name}</strong>
                <small>{user.email}</small>
              </td>
              <td>
                {user.roles || 'Profile pending'}
                <small>{user.experience || '—'} · {user.locations || '—'}</small>
              </td>
              <td>{user.matches}</td>
              <td>
                <span className={`admin-status ${user.workflow_status}`}>{user.workflow_status}</span>
              </td>
              <td>
                <div className="admin-user-actions">
                  {['active', 'paused'].includes(user.workflow_status) && (
                    <button className="workflow-control" onClick={() => void onWorkflow(user)}>
                      {user.workflow_status === 'active' ? <><PauseCircle /> Pause</> : <><PlayCircle /> Activate</>}
                    </button>
                  )}
                  <button className="workflow-control" onClick={() => onManage(user)}>
                    <SlidersHorizontal /> Manage
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={5}>No candidates have completed profile setup yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function CandidateAnalyticsTable({ analytics, onView }: { analytics: CandidateAnalytics[]; onView: (analytics: CandidateAnalytics) => void }) {
  return <div className="admin-table-wrap"><table>
    <thead><tr><th>Candidate</th><th>Matches</th><th>Applications</th><th>Review queue</th><th>Runs</th><th>Emails</th><th>View</th></tr></thead>
    <tbody>{analytics.map((item) => <tr key={item.id}>
      <td><strong>{item.full_name}</strong><small>{item.email}</small></td><td>{item.matches}</td><td>{item.applications}</td><td>{item.awaiting_review}</td><td>{item.runs}<small>{item.last_run_at ? new Date(item.last_run_at).toLocaleDateString() : 'Not run'}</small></td><td>{item.emails_sent}<small>{item.emails_failed ? `${item.emails_failed} failed` : 'No failures'}</small></td>
      <td><button className="workflow-control" onClick={() => onView(item)}><BarChart3 /> Details</button></td>
    </tr>)}{!analytics.length && <tr><td colSpan={7}>No candidate analytics are available yet.</td></tr>}</tbody>
  </table></div>
}

function CandidateAnalyticsModal({ analytics, onClose }: { analytics: CandidateAnalytics; onClose: () => void }) {
  const metrics = [
    ['Job matches', analytics.matches], ['Applications', analytics.applications], ['Awaiting review', analytics.awaiting_review], ['Search runs', analytics.runs], ['Emails sent', analytics.emails_sent], ['Email failures', analytics.emails_failed],
  ]
  return <div className="admin-modal-backdrop" role="presentation"><section className="admin-manager admin-analytics-modal" role="dialog" aria-modal="true" aria-label={`${analytics.full_name} analytics`}>
    <header><div><small>CANDIDATE ANALYTICS</small><h2>{analytics.full_name}</h2><p>{analytics.email}</p></div><button onClick={onClose} aria-label="Close analytics"><X /></button></header>
    <div className="admin-analytics-metrics">{metrics.map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div>
    <div className="admin-analytics-last-run"><strong>Last search run</strong><span>{analytics.last_run_at ? new Date(analytics.last_run_at).toLocaleString() : 'This candidate has not run a search yet.'}</span></div>
  </section></div>
}

function RunList({ runs }: { runs: AdminOverview['recentRuns'] }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const visibleRuns = runs.filter((run) => {
    const date = run.started_at.slice(0, 10)
    return (!from || date >= from) && (!to || date <= to)
  })
  return (
    <>
      <div className="admin-run-filter">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      <div className="admin-run-list">
        {visibleRuns.map((run) => (
          <div key={run.id}>
            <span className={run.status}><Activity /></span>
            <div>
              <strong>{run.full_name}</strong>
              <small>{run.email} · {new Date(run.started_at).toLocaleString()} · {run.jobs_discovered} checked · {run.jobs_matched} matched</small>
            </div>
            <em>{run.status}</em>
          </div>
        ))}
        {!visibleRuns.length && <div className="admin-empty">No job runs found for this date range.</div>}
      </div>
    </>
  )
}

function AuditList({ audits }: { audits: AdminOverview['audits'] }) {
  return (
    <div className="admin-audit">
      {audits.map((audit, index) => (
        <div key={`${audit.created_at}-${index}`}>
          <i />
          <span>
            <strong>{audit.action.replaceAll('_', ' ')}</strong>
            <small>{audit.admin_email} · {new Date(audit.created_at).toLocaleString()}</small>
          </span>
        </div>
      ))}
      {!audits.length && <div className="admin-empty">No admin actions recorded yet.</div>}
    </div>
  )
}

function SourceSignals({ sources }: { sources: AdminOverview['sources'] }) {
  return (
    <div className="admin-signals">
      {sources.map((source) => (
        <div key={source.source}>
          <span>
            <strong>{source.source}</strong>
            <small>{num(source.candidates)} candidates · {num(source.active)} active</small>
          </span>
          <b>{num(source.candidates)}</b>
        </div>
      ))}
      {!sources.length && <div className="admin-empty">No job source has been selected yet.</div>}
    </div>
  )
}

function TrendSignals({ trends }: { trends: AdminOverview['trends'] }) {
  return (
    <div className="admin-signals">
      {trends.map((trend, index) => (
        <div key={trend.label}>
          <span>
            <strong>{index + 1}. {trend.label}</strong>
            <small>Requested by {num(trend.candidates)} candidate{Number(trend.candidates) === 1 ? '' : 's'}</small>
          </span>
          <b>{num(trend.candidates)}</b>
        </div>
      ))}
      {!trends.length && <div className="admin-empty">Role trend data appears after candidates save their profile.</div>}
    </div>
  )
}

function CandidateManager({ user, onClose, onSave, onSaveEmail, onDelete }: { user: AdminUser; onClose: () => void; onSave: (user: AdminUser, rules: { schedule: string; timezone: string; dailyLimit: number; minimumScore: number; locations: string }) => Promise<void>; onSaveEmail: (user: AdminUser, email: string) => Promise<void>; onDelete: (user: AdminUser) => Promise<void> }) {
  const [schedule, setSchedule] = useState(user.schedule ?? '09:00')
  const [timezone, setTimezone] = useState(user.timezone ?? 'Asia/Kolkata')
  const [dailyLimit, setDailyLimit] = useState(user.daily_limit ?? 10)
  const [minimumScore, setMinimumScore] = useState(user.minimum_score ?? 75)
  const [locations, setLocations] = useState(user.locations ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(user.email)

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      await onSave(user, { schedule, timezone, dailyLimit, minimumScore, locations })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update rules.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await onDelete(user)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete candidate.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-manager" role="dialog" aria-modal="true" aria-label={`Manage ${user.full_name}`}>
        <header>
          <div>
            <small>CANDIDATE CONTROLS</small>
            <h2>{user.full_name}</h2>
            <p>{user.email}</p>
          </div>
          <button onClick={onClose} aria-label="Close candidate controls">
            <X />
          </button>
        </header>

        <div className="admin-manage-grid"><label className="admin-full-width">Candidate email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="admin-save" disabled={saving || email === user.email} onClick={() => { setSaving(true); void onSaveEmail(user, email).then(() => setMessage('Candidate email updated.')).catch((error) => setMessage(error.message)).finally(() => setSaving(false)) }}>Save email</button></div>

        {user.workflow_status === 'not configured' ? (
          <div className="admin-error">This candidate has not completed setup, so there are no search rules to edit.</div>
        ) : (
          <div className="admin-manage-grid">
            <label>
              Daily start time
              <input type="time" value={schedule} onChange={(event) => setSchedule(event.target.value)} />
            </label>
            <label>
              Time zone
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </label>
            <label>
              Daily job limit
              <input type="number" min="1" max="100" value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} />
            </label>
            <label>
              Minimum match score
              <input type="number" min="50" max="100" value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} />
            </label>
            <label className="admin-full-width">
              Target locations
              <input value={locations} onChange={(event) => setLocations(event.target.value)} placeholder="e.g. Bengaluru, Remote" />
            </label>
          </div>
        )}

        {message && <div className="admin-error">{message}</div>}

        <footer>
          <button className="admin-danger" disabled={saving} onClick={() => void remove()}>
            <Trash2 /> Delete candidate
          </button>
          {user.workflow_status !== 'not configured' && (
            <button className="admin-save" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save search rules'}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
