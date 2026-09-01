import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/common/Button'
import { ApplicationsTable } from '../components/ApplicationsTable'
import { MetricCard } from '../components/MetricCard'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { PlatformAuthModal } from '../components/PlatformAuthModal'
import { CandidateProfileEditModal } from '../components/CandidateProfileEditModal'
import { useAutomation } from '../context/useAutomation'
import { setupApi } from '../services/setup.api'
const platformIcons: Record<string, string> = {
  LinkedIn: '💼',
  Naukri: '⚡',
  Indeed: '🎯',
  'Google Jobs': '🔍',
  Remotive: '🌐',
  Arbeitnow: '🚀',
  Jobicy: '✨',
  Glassdoor: '🏢',
  Wellfound: '💡',
}

export function AutomationDashboard() {
  const {
    status,
    toggleStatus,
    statusChanging,
    depositVerified,
    verifyDeposit,
    settings,
    updateSettings,
    saveSettings,
    settingsSaving,
    applications,
    metrics,
    runs,
    runProgress,
    sourceWorkflows,
    lastRefreshed,
    refreshDashboard,
    markApplied,
    applyToMatch,
    batchApplyMatches,
    triggerSearchRun,
    serverUserId,
    userName,
    updateSourceStatus,
  } = useAutomation()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'pipeline' | 'applied' | 'activity'>('pipeline')
  const [authModalSource, setAuthModalSource] = useState<string | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [batchApplying, setBatchApplying] = useState(false)
  const [runningDiscovery, setRunningDiscovery] = useState(false)
  const [billing, setBilling] = useState<{ status: string; period_end: string | null; advance_months: number; included_jobs: number; used_jobs: number } | null>(null)
  const [billingMessage, setBillingMessage] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('Received a job offer')
  const [cancelNote, setCancelNote] = useState('')
  const [accountChangeSource, setAccountChangeSource] = useState<string | null>(null)
  const [accountOtp, setAccountOtp] = useState('')
  const [accountOtpSent, setAccountOtpSent] = useState(false)
  const [accountChangeMessage, setAccountChangeMessage] = useState('')
  const [accountChangeStep, setAccountChangeStep] = useState<'payment' | 'sending_otp' | 'otp' | 'verifying'>('payment')
  useEffect(() => { if (serverUserId) void setupApi.billingStatus(serverUserId).then(({ billing }) => setBilling(billing)).catch(() => {}) }, [serverUserId])

  const reviewMatches = applications.filter((app) => app.status === 'Review required')
  const appliedMatches = applications.filter((app) => app.status === 'Applied' || app.status === 'Interview' || app.status === 'Failed')

  const handleBatchApply = async () => {
    if (!reviewMatches.length) return
    setBatchApplying(true)
    try {
      await batchApplyMatches(reviewMatches.map((m) => m.id))
      await refreshDashboard()
    } finally {
      setBatchApplying(false)
    }
  }

  const handleTriggerDiscovery = async () => {
    setRunningDiscovery(true)
    try {
      await triggerSearchRun()
      await refreshDashboard()
    } finally {
      setRunningDiscovery(false)
    }
  }

  return <>
    {authModalSource && serverUserId && (
      <PlatformAuthModal
        source={authModalSource}
        userId={serverUserId}
        onClose={() => setAuthModalSource(null)}
        onSuccess={() => void refreshDashboard()}
      />
    )}
    {profileModalOpen && serverUserId && (
      <CandidateProfileEditModal
        userId={serverUserId}
        initialRoles="Software Engineer, Full Stack Developer"
        initialExperience="2-5 years"
        initialResumeName="Primary_Profile_Resume.pdf"
        onClose={() => setProfileModalOpen(false)}
        onSuccess={() => void refreshDashboard()}
      />
    )}
    <main className="automation-shell">
      <div className="inline-breadcrumb">
        <Link to="/">Home</Link> <span>›</span> <Link to="/automation">Career Assistant</Link> <span>›</span> <strong>Guided Job Search</strong>
      </div>
      <section className="automation-welcome">
        <div className="welcome-left">
          <div className="welcome-candidate-avatar">
            <span className="avatar-mark">CT</span>
            <i className="status-dot-pulse" title="Online & Matching" />
          </div>
          <div>
            <div className="welcome-kicker-row">
              <span className="automation-kicker">CAREER ASSISTANT CONTROL CENTER</span>
              <span className="kicker-status-pill">🟢 Active Matching Engine</span>
            </div>
            <h1>Welcome back, {userName} 👋</h1>
            <p className="welcome-subtitle">
              Automated multi-source search active across your <strong>{sourceWorkflows.length || 6} job channels</strong>. Apply in 1-Click or manage responses directly.
            </p>
            <div className="candidate-roles-pills">
              <span>🎯 {settings.locations.join(' · ') || 'Hyderabad, Bengaluru, Remote'}</span>
              <span>⚡ Match Threshold: {settings.minimumScore}%</span>
              <span>🚀 Limit: {settings.dailyLimit}/day</span>
              <button
                className="edit-profile-pill-btn"
                onClick={() => setProfileModalOpen(true)}
                type="button"
              >
                ✏️ Edit Profile (Job, Exp, Resume)
              </button>
            </div>
          </div>
        </div>
        <div className="automation-welcome-actions">
          <Button
            className="instant-discovery-btn"
            disabled={runningDiscovery}
            variant="secondary"
            onClick={() => void handleTriggerDiscovery()}
          >
            {runningDiscovery ? 'Running Discovery…' : '⚡ Run Instant Discovery'}
          </Button>
          <div className={`automation-live ${status}`}>
            <i />
            <span>
              <small>Job search status</small>
              <strong>{status === 'active' ? 'Active' : 'Paused'}</strong>
            </span>
            <Button
              disabled={statusChanging}
              variant={status === 'active' ? 'secondary' : 'primary'}
              onClick={() => void toggleStatus()}
            >
              {statusChanging ? 'Updating…' : status === 'active' ? 'Pause' : 'Resume'}
            </Button>
          </div>
        </div>
      </section>

      {runProgress && (
        <section className={`live-run-progress ${runProgress.running ? 'running' : 'complete'}`} role="status">
          <div>
            <span>{runProgress.running ? 'CAREER INTELLIGENCE RUN' : 'CAREER INTELLIGENCE COMPLETE'}</span>
            <strong>{runProgress.stage}</strong>
            <small>{runProgress.running ? 'Multi-source job feeds, match threshold, and platform connections are being processed.' : 'Your career opportunity pipeline is up to date.'}</small>
          </div>
          <b>{runProgress.percent}%</b>
          <i><em style={{ width: `${runProgress.percent}%` }} /></i>
        </section>
      )}

      <section className="automation-metrics">
        <MetricCard icon="⌕" label="Jobs checked" value={metrics.discovered} trend="Live multi-source feeds" />
        <MetricCard icon="◎" label="Strong matches" value={metrics.matched} trend={`${settings.minimumScore}% minimum score`} />
        <MetricCard icon="↗" label="Applications sent" value={metrics.applied} trend="Verified 1-Click & platform submissions" />
        <MetricCard icon="✦" label="Interviews" value={metrics.interviews} trend="Active recruitment pipeline" />
      </section>

      <section className="automation-grid">
        <article className="automation-panel workflow-panel">
          <header>
            <div>
              <span>LIVE WORKFLOW</span>
              <h2>Daily Guided Job Search</h2>
              <p>Automated multi-source search and smart 1-Click application pipeline.</p>
            </div>
            <Button variant="ghost" onClick={() => setSettingsOpen((open) => !open)}>
              {settingsOpen ? 'Close editor' : 'Edit AI job automation & apply settings'}
            </Button>
          </header>
          {settingsOpen && (
            <div className="automation-settings">
              <label>Daily run time<strong>{settings.schedule}</strong><input type="time" value={settings.schedule} onChange={(event) => updateSettings({ schedule: event.target.value })} /></label>
              <label>Time zone<strong>{settings.timezone}</strong><select value={settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })}><option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option><option value="Asia/Dubai">Asia/Dubai</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
              <label>Daily application limit<strong>{settings.dailyLimit}</strong><input type="range" min="5" max="50" step="5" value={settings.dailyLimit} onChange={(event) => updateSettings({ dailyLimit: Number(event.target.value) })} /></label>
              <label>Minimum match score<strong>{settings.minimumScore}%</strong><input type="range" min="60" max="95" step="5" value={settings.minimumScore} onChange={(event) => updateSettings({ minimumScore: Number(event.target.value) })} /></label>
              <label className="locations-editor">Preferred locations<strong>{settings.locations.length} selected</strong><input value={settings.locations.join(', ')} onChange={(event) => updateSettings({ locations: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Hyderabad, Bengaluru, Remote" /></label>
              <label className="review-toggle"><input checked={settings.reviewRequired} type="checkbox" onChange={(event) => updateSettings({ reviewRequired: event.target.checked })} /><span><strong>Manual review before applying</strong><small>Recommended for high-quality submissions</small></span></label>
              <Button disabled={settingsSaving} onClick={async () => { await saveSettings(); setSettingsOpen(false) }}>{settingsSaving ? 'Saving schedule…' : 'Save schedule and rules'}</Button>
            </div>
          )}
          <WorkflowCanvas />
        </article>

        <aside className="automation-side">
          <article className="automation-panel deposit-card">
            <div className="deposit-title"><span>₹</span><div><small>CareerTide membership</small><h2>₹1,000 / month</h2></div></div>
            <p>Your monthly plan enables guided discovery, matching, and workflow tools. Payments are verified through Razorpay.</p>
            <ul>
              <li>✓ Live multi-source job discovery</li>
              <li>✓ 1-Click apply & tracker enabled</li>
              <li>✓ Direct OAuth platform authorization</li>
            </ul>
            {depositVerified ? <><div className="verified-payment">✓ Monthly plan verified {billing?.period_end ? `· active until ${new Date(billing.period_end).toLocaleDateString()}` : ''}</div><small>{billing ? `${Math.max(0, billing.included_jobs - billing.used_jobs)} included applications remaining · ${billing.advance_months} paid month(s)` : ''}</small><Button variant="ghost" onClick={() => setCancelOpen(true)}>{billing?.status === 'cancel_at_period_end' ? 'Cancellation scheduled' : 'Cancel payment renewal'}</Button>{billingMessage && <small>{billingMessage}</small>}</> : <Button onClick={verifyDeposit}>Review membership</Button>}
          </article>
          <article className="automation-panel automation-rules">
            <header>
              <h2>Current rules</h2>
              <button
                className="mini-edit-profile-link"
                onClick={() => setProfileModalOpen(true)}
                type="button"
              >
                ✏️ Edit Profile
              </button>
            </header>
            <dl>
              <div><dt>Schedule</dt><dd>{settings.schedule} · {settings.timezone}</dd></div>
              <div><dt>Daily limit</dt><dd>{settings.dailyLimit} applications</dd></div>
              <div><dt>Minimum score</dt><dd>{settings.minimumScore}%</dd></div>
              <div><dt>Locations</dt><dd>{settings.locations.join(' · ')}</dd></div>
            </dl>
          </article>
        </aside>
      </section>

      <section className="automation-middle-section">
        <article className="automation-panel source-workflow-panel">
          <header className="source-panel-header">
            <div>
              <span>AUTHENTICATED CHANNELS</span>
              <h2>Platform Connections & Gateways</h2>
              <p>Authorize job platforms to enable live 1-Click applications and profile resume synchronization.</p>
            </div>
            <span className="source-count-badge">
              {sourceWorkflows.filter((w) => w.permissionStatus === 'connected' || w.status === 'ready').length} / {sourceWorkflows.length || 6} Connected
            </span>
          </header>
          <div className="source-panel-banner">
            <span className="banner-icon">💡</span>
            <p>Platform Gateways link your profile & resume to CareerTide for live job matching and instant 1-Click submissions across active job boards.</p>
          </div>
          {sourceWorkflows.length ? (
            <div className="platform-grid-hub">
              {sourceWorkflows.map((workflow) => {
                const isConnected = workflow.permissionStatus === 'connected' || workflow.status === 'ready'
                const icon = platformIcons[workflow.source] || '⚡'
                return (
                  <article
                    key={workflow.source}
                    className={`platform-hub-card ${isConnected ? 'connected-card' : ''}`}
                  >
                    <div className="platform-card-header">
                      <div className="platform-brand-badge">
                        <span className="platform-icon-circle">{icon}</span>
                        <div>
                          <strong>{workflow.source}</strong>
                          <span className="platform-scope-tag">1-Click Gateway</span>
                        </div>
                      </div>
                      {isConnected ? (
                        <span className="status-badge-connected">✓ Active ⚡</span>
                      ) : (
                        <span className="status-badge-pending">Setup Needed</span>
                      )}
                    </div>
                    <p className="platform-card-desc">{workflow.detail}</p>
                    <div className="platform-capabilities-list">
                      <small>✓ Resume Dispatch</small>
                      <small>✓ Automated Matching</small>
                    </div>
                    <div className="platform-card-footer">
                      {isConnected ? (
                        <div className="connected-footer-info">
                          <span className="connected-dot" />
                          <small>Gateway Verified & Active</small>
                        </div>
                      ) : (
                        <button
                          className="btn-connect-gateway"
                          onClick={() => setAuthModalSource(workflow.source)}
                          type="button"
                        >
                          Connect & Authorize ⚡
                        </button>
                      )}
                      <div className="platform-source-actions"><button className="workflow-control" onClick={() => void updateSourceStatus(workflow.source, workflow.status === 'paused')} type="button">{workflow.status === 'paused' ? 'Enable source' : 'Disable source'}</button>{isConnected && <button className="workflow-control" onClick={() => { setAccountChangeSource(workflow.source); setAccountOtpSent(false); setAccountChangeStep('payment'); setAccountChangeMessage('') }} type="button">Change account</button>}</div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="empty-sources-note">Source workflows appear after you save your search plan.</p>
          )}
        </article>
      </section>

      <section className="automation-panel pipeline-panel">
        <header className="pipeline-header">
          <div>
            <span>LIVE OPPORTUNITY PIPELINE</span>
            <h2>Your Job Applications & Activity</h2>
            <small>{lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString()}` : 'Loading latest results…'}</small>
          </div>
          <div className="pipeline-controls">
            {reviewMatches.length > 0 && activeTab === 'pipeline' && (
              <Button
                className="batch-apply-btn"
                disabled={batchApplying}
                onClick={() => void handleBatchApply()}
              >
                {batchApplying ? 'Submitting Batch…' : `🚀 Batch Apply All (${reviewMatches.length} Matches)`}
              </Button>
            )}
            <div className="automation-tabs">
              <button onClick={() => void refreshDashboard()}>↻ Refresh</button>
              <button className={activeTab === 'pipeline' ? 'active' : ''} onClick={() => setActiveTab('pipeline')}>Review queue ({applications.length})</button>
              <button className={activeTab === 'applied' ? 'active' : ''} onClick={() => setActiveTab('applied')}>Applied jobs ({appliedMatches.length})</button>
              <button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>Run activity ({runs.length})</button>
            </div>
          </div>
        </header>
        {activeTab === 'pipeline' ? (
          <ApplicationsTable
            applications={applications}
            onMarkApplied={markApplied}
            onApply={applyToMatch}
          />
        ) : activeTab === 'applied' ? (
          <ApplicationsTable applications={appliedMatches} onMarkApplied={markApplied} onApply={applyToMatch} />
        ) : (
          <div className="run-activity-cards">
            {runs.map((run) => (
              <article key={run.id} className={`run-activity-card ${run.status}`}>
                <div className="run-activity-heading"><span className={`run-activity-status ${run.status}`}>{run.status === 'completed' ? 'Completed' : run.status}</span><time>{new Date(run.startedAt).toLocaleString()}</time></div>
                <strong>Job search run #{run.id}</strong><small>Candidate: {run.email}</small>
                <dl><div><dt>Jobs checked</dt><dd>{run.discovered}</dd></div><div><dt>Strong matches</dt><dd>{run.matched}</dd></div></dl>
                {run.error && <p className="run-activity-error">{run.error}</p>}
              </article>
            ))}
            {!runs.length && <p>No genuine runs recorded yet.</p>}
          </div>
        )}
      </section>
      <p className="automation-safety">CareerTide connects to verified platforms and feeds. Apply with 1-Click or review directly on the hiring platform to track every application in your pipeline.</p>
    </main>
    {cancelOpen && <div className="admin-modal-backdrop"><section className="admin-manager"><h2>Stop membership renewal?</h2><p>Your AI job automation, source access, and applications remain active until your current paid period ends. From the next month, all plans will be disabled until you make a new payment.</p><label className="setup-field"><span>Why are you stopping?</span><select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option>Received a job offer</option><option>Not interested at this time</option><option>Found a job through another source</option><option>Price or budget reason</option><option>Other</option></select></label><label className="setup-field"><span>Message (optional)</span><input value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} placeholder="Tell us how we can improve" /></label><div className="admin-user-actions"><Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep my plan</Button><Button onClick={() => { if (!serverUserId) return; void setupApi.cancelBilling(serverUserId).then((result) => { setBillingMessage(`${result.message} Reason recorded: ${cancelReason}.`); setCancelOpen(false); return setupApi.billingStatus(serverUserId) }).then(({ billing }) => setBilling(billing)) }}>Stop after this period</Button></div></section></div>}
    {accountChangeSource && <div className="admin-modal-backdrop"><section className="admin-manager"><h2>Change {accountChangeSource} account</h2><div className="account-change-progress"><span className={accountChangeStep === 'payment' ? 'active' : 'done'}>1. Payment · ₹500</span><span className={accountChangeStep === 'otp' || accountChangeStep === 'verifying' ? 'active' : ''}>2. Email OTP</span><span>3. New account</span></div>{accountChangeStep === 'payment' && <><p>Pay ₹500 to request an account change. After verified payment, we will send an OTP to your registered email.</p><Button onClick={() => { setAccountChangeStep('sending_otp'); setAccountChangeMessage('Payment verification is required before the OTP can be sent.') }}>Continue to secure payment</Button></>}{accountChangeStep === 'sending_otp' && <><p className="setup-error">{accountChangeMessage}</p><Button onClick={() => { if (!serverUserId) return; void setupApi.requestAccountChangeOtp(serverUserId, accountChangeSource).then((result) => { setAccountOtpSent(true); setAccountChangeStep('otp'); setAccountChangeMessage(result.message) }).catch((error) => { setAccountChangeStep('payment'); setAccountChangeMessage(error.message) }) }}>Payment verified — send OTP</Button></>}{accountOtpSent && <><label className="setup-field"><span>Email verification OTP</span><input value={accountOtp} onChange={(event) => setAccountOtp(event.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" /></label><small>{accountChangeMessage}</small><Button disabled={accountChangeStep === 'verifying'} onClick={() => { if (!serverUserId) return; setAccountChangeStep('verifying'); void setupApi.verifyAccountChangeOtp(serverUserId, accountChangeSource, accountOtp).then(() => { setAuthModalSource(accountChangeSource); setAccountChangeSource(null) }).catch((error) => { setAccountChangeStep('otp'); setAccountChangeMessage(error.message) }) }}>{accountChangeStep === 'verifying' ? 'Verifying OTP…' : 'Verify OTP & continue'}</Button></>}<Button variant="ghost" onClick={() => setAccountChangeSource(null)}>Cancel</Button></section></div>}
  </>
}
