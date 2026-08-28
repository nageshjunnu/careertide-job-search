import { useState } from 'react'
import { Button } from '../../../components/common/Button'
import { PageHero } from '../../../components/common/PageHero'
import { ApplicationsTable } from '../components/ApplicationsTable'
import { MetricCard } from '../components/MetricCard'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { useAutomation } from '../context/useAutomation'
import '../styles/automation.css'

export function AutomationDashboard() {
  const { status, toggleStatus, statusChanging, depositVerified, verifyDeposit, settings, updateSettings, saveSettings, settingsSaving, applications, metrics, runs, sourceWorkflows, lastRefreshed, refreshDashboard, markApplied, requestPlatformIntegration, userName } = useAutomation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'pipeline' | 'activity'>('pipeline')

  return <>
    <PageHero title="Career Assistant" crumb="Home › Career Assistant › Guided job search" />
    <main className="automation-shell">
      <section className="automation-welcome">
        <div><span className="automation-kicker">Career Assistant control center</span><h1>Good morning, {userName} 👋</h1><p>We find and organise relevant opportunities. You handle calls, interviews, and applications that need your approval.</p></div>
        <div className={`automation-live ${status}`}><i /><span><small>Job search status</small><strong>{status === 'active' ? 'Active' : 'Paused'}</strong></span><Button disabled={statusChanging} variant={status === 'active' ? 'secondary' : 'primary'} onClick={() => void toggleStatus()}>{statusChanging ? 'Updating…' : status === 'active' ? 'Pause' : 'Resume'}</Button></div>
      </section>

      <section className="automation-metrics">
        <MetricCard icon="⌕" label="Jobs checked" value={metrics.discovered} trend="Latest genuine source run" />
        <MetricCard icon="◎" label="Strong matches" value={metrics.matched} trend={`${settings.minimumScore}% minimum score`} />
        <MetricCard icon="↗" label="Applications sent" value={metrics.applied} trend="Only verified submissions count" />
        <MetricCard icon="✦" label="Interviews" value={metrics.interviews} trend="No inferred interview statuses" />
      </section>

      <section className="automation-grid">
        <article className="automation-panel workflow-panel">
          <header><div><span>LIVE WORKFLOW</span><h2>Daily Guided Job Search</h2><p>We discover and match; you review source links and handle calls when shortlisted.</p></div><Button variant="ghost" onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? 'Close editor' : 'Edit search plan'}</Button></header>
          {settingsOpen && <div className="automation-settings">
            <label>Daily run time<strong>{settings.schedule}</strong><input type="time" value={settings.schedule} onChange={(event) => updateSettings({ schedule: event.target.value })} /></label>
            <label>Time zone<strong>{settings.timezone}</strong><select value={settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })}><option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option><option value="Asia/Dubai">Asia/Dubai</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
            <label>Daily application limit<strong>{settings.dailyLimit}</strong><input type="range" min="5" max="50" step="5" value={settings.dailyLimit} onChange={(event) => updateSettings({ dailyLimit: Number(event.target.value) })} /></label>
            <label>Minimum match score<strong>{settings.minimumScore}%</strong><input type="range" min="60" max="95" step="5" value={settings.minimumScore} onChange={(event) => updateSettings({ minimumScore: Number(event.target.value) })} /></label>
            <label className="locations-editor">Preferred locations<strong>{settings.locations.length} selected</strong><input value={settings.locations.join(', ')} onChange={(event) => updateSettings({ locations: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Hyderabad, Bengaluru, Remote" /></label>
            <label className="review-toggle"><input checked={settings.reviewRequired} type="checkbox" onChange={(event) => updateSettings({ reviewRequired: event.target.checked })} /><span><strong>Manual review required</strong><small>Recommended for safe, high-quality applications</small></span></label>
            <Button disabled={settingsSaving} onClick={async () => { await saveSettings(); setSettingsOpen(false) }}>{settingsSaving ? 'Saving schedule…' : 'Save schedule and rules'}</Button>
          </div>}
          <WorkflowCanvas />
        </article>

        <aside className="automation-side">
          <article className="automation-panel deposit-card"><div className="deposit-title"><span>₹</span><div><small>Activation deposit</small><h2>₹1,000</h2></div></div><p>Refundable according to your service terms. Automation activates only after verified payment.</p><ul><li>✓ Activity transparently tracked</li><li>✓ Eligibility visible in dashboard</li><li>✓ Secure webhook verification</li></ul>{depositVerified ? <div className="verified-payment">✓ Payment verified</div> : <Button onClick={verifyDeposit}>Review & verify deposit</Button>}</article>
          <article className="automation-panel automation-rules"><header><h2>Current rules</h2><span>{settings.reviewRequired ? 'Human review on' : 'Auto review'}</span></header><dl><div><dt>Schedule</dt><dd>{settings.schedule} · {settings.timezone}</dd></div><div><dt>Daily limit</dt><dd>{settings.dailyLimit} applications</dd></div><div><dt>Minimum score</dt><dd>{settings.minimumScore}%</dd></div><div><dt>Locations</dt><dd>{settings.locations.join(' · ')}</dd></div></dl></article>
          <article className="automation-panel source-workflow-panel"><header><div><span>SOURCE WORKFLOWS</span><h2>Platform connections</h2></div></header>{sourceWorkflows.length ? <ul>{sourceWorkflows.map((workflow) => <li key={workflow.source}><div><strong>{workflow.source}</strong><small>{workflow.detail}</small>{workflow.permissionStatus === 'permission_requested' && <small className="permission-date">Provider access setup requested {workflow.requestedAt ? new Date(workflow.requestedAt).toLocaleDateString() : ''}</small>}</div>{workflow.status === 'ready' ? <em className="ready">Discovery ready</em> : workflow.permissionStatus === 'permission_requested' ? <em>Provider setup pending</em> : <button className="integration-request" onClick={() => void requestPlatformIntegration(workflow.source)}>Set up provider access</button>}</li>)}</ul> : <p>Source workflows appear after you save your search plan.</p>}</article>
        </aside>
      </section>

      <section className="automation-panel pipeline-panel">
        <header className="pipeline-header"><div><span>GENUINE POSTGRESQL DATA</span><h2>Your opportunity pipeline</h2><small>{lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString()}` : 'Loading latest results…'}</small></div><div className="automation-tabs"><button onClick={() => void refreshDashboard()}>↻ Refresh</button><button className={activeTab === 'pipeline' ? 'active' : ''} onClick={() => setActiveTab('pipeline')}>Review queue</button><button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>Run activity</button></div></header>
        {activeTab === 'pipeline' ? <ApplicationsTable applications={applications} onMarkApplied={markApplied} /> : <div className="run-log">{runs.map((run) => <div key={run.id}><time>{new Date(run.startedAt).toLocaleTimeString()}</time><i className={run.status === 'completed' ? 'success' : 'pending'} /><span>Run #{run.id}: {run.status} · {run.discovered} checked · {run.matched} matched{run.error ? ` · ${run.error}` : ''}</span></div>)}{!runs.length && <p>No genuine runs recorded yet.</p>}</div>}
      </section>
      <p className="automation-safety">CareerTide uses approved feeds and source links to build your queue. Keep control of calls, interviews, and original-site submissions; update a job to “I applied” only after you submit it.</p>
    </main>
  </>
}
