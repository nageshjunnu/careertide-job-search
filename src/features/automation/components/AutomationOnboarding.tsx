import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../../components/common/Button'
import { ONBOARDING_PHASES } from '../config/onboarding.config'
import { useOnboardingRecord } from '../hooks/useOnboardingRecord'
import { OnboardingProgress } from './OnboardingProgress'
import { setupApi } from '../services/setup.api'

const sourceOptions = [
  { name: 'Remotive', access: 'No sign-in needed', detail: 'Permitted public job feed. You review the original listing before applying.', requiresProviderAccess: false },
  { name: 'LinkedIn', access: 'Provider access needed', detail: 'Requires an approved LinkedIn Talent/ATS connection before platform actions are allowed.', requiresProviderAccess: true },
  { name: 'Naukri', access: 'Provider access needed', detail: 'Requires Naukri partner access before platform actions are allowed.', requiresProviderAccess: true },
  { name: 'Google Jobs', access: 'Original site sign-in', detail: 'Google Jobs points to the employer’s application site; use the employer’s own sign-in.', requiresProviderAccess: true },
  { name: 'Glassdoor', access: 'Provider access needed', detail: 'Requires an approved Glassdoor connection before platform actions are allowed.', requiresProviderAccess: true },
  { name: 'Indeed', access: 'Provider access needed', detail: 'Requires an approved Indeed partner connection before platform actions are allowed.', requiresProviderAccess: true },
  { name: 'Wellfound', access: 'Original site sign-in', detail: 'Use the original Wellfound or employer application page until approved access is available.', requiresProviderAccess: true },
]

type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type RazorpayCheckout = { open: () => void; on: (event: string, handler: (response: { error: { description: string } }) => void) => void }
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout } }

const loadRazorpayCheckout = () => new Promise<void>((resolve, reject) => {
  if (window.Razorpay) { resolve(); return }
  const script = document.createElement('script')
  script.src = 'https://checkout.razorpay.com/v1/checkout.js'
  script.onload = () => resolve()
  script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'))
  document.head.appendChild(script)
})

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="setup-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function AutomationOnboarding({ onComplete }: { onComplete: () => void }) {
  const { record, loading, saving, updateData, saveProgress } = useOnboardingRecord()
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activationProgress, setActivationProgress] = useState<number | null>(null)
  const [runResult, setRunResult] = useState<{ discovered: number; matched: number; applicationsSubmitted: number } | null>(null)
  const [accessingSource, setAccessingSource] = useState('')
  const [sourceAccessMessage, setSourceAccessMessage] = useState('')
  const phase = ONBOARDING_PHASES[record.currentStep]
  const data = record.data

  if (loading) return <div className="setup-loading"><span /><p>Loading your secure setup…</p></div>

  const validate = () => {
    if (record.currentStep === 0 && (!data.email.includes('@') || !data.fullName.trim() || !data.resumeName)) return 'Complete your name, valid email, and resume before continuing.'
    if (record.currentStep === 1 && !data.paymentId) return 'Complete the test payment to verify activation.'
    if (record.currentStep === 2 && data.sources.length === 0) return 'Select at least one approved job source.'
    return ''
  }

  const next = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setError('')
    setSubmitting(true)
    try {
      const stepKey = ONBOARDING_PHASES[record.currentStep].id
      const stepPayloads = [
        { email: data.email, fullName: data.fullName, phone: data.phone, resumeName: data.resumeName, roles: data.roles, skills: data.skills, locations: data.locations, experience: data.experience, service: data.service },
        { paymentId: data.paymentId },
        { schedule: data.schedule, timezone: data.timezone, sources: data.sources, minimumScore: data.minimumScore, dailyLimit: data.dailyLimit },
        { reviewRequired: data.reviewRequired, retries: data.retries },
        { emailNotifications: data.emailNotifications, dailySummary: data.dailySummary },
      ]
      const stepSignature = JSON.stringify(stepPayloads[record.currentStep])
      const unchanged = record.syncedSteps?.[stepKey] === stepSignature
      if (record.currentStep === 0) {
        if (unchanged && record.serverUserId) { await saveProgress(1); return }
        const result = await setupApi.saveUser(data, record.serverUserId)
        if (!result.userId) throw new Error('The server did not return a user ID.')
        await saveProgress(1, { authenticated: true, serverUserId: result.userId, syncedSteps: { ...record.syncedSteps, [stepKey]: stepSignature } })
        return
      }
      if (!record.serverUserId) throw new Error('Your server session is missing. Return to the User step and save it again.')
      if (unchanged && record.currentStep < 4) { await saveProgress(record.currentStep + 1); return }
      if (record.currentStep === 1) await setupApi.verifyPayment(data, record.serverUserId)
      if (record.currentStep === 2) await setupApi.saveWorkflow(data, record.serverUserId)
      if (record.currentStep === 3) await setupApi.saveApplicationRules(data, record.serverUserId)
      if (record.currentStep === 4) {
        if (unchanged && record.completed) { onComplete(); return }
        setActivationProgress(15)
        await setupApi.saveOperations(data, record.serverUserId)
        setActivationProgress(40)
        const result = await setupApi.runGuidedSearch(record.serverUserId)
        setActivationProgress(90)
        await saveProgress(4, { authenticated: true, completed: true, syncedSteps: { ...record.syncedSteps, [stepKey]: stepSignature } })
        setRunResult(result)
        setActivationProgress(100)
        return
      }
      await saveProgress(record.currentStep + 1, { syncedSteps: { ...record.syncedSteps, [stepKey]: stepSignature } })
    } catch (requestError) {
      setActivationProgress(null)
      setError(requestError instanceof Error ? `${requestError.message} Make sure the API and PostgreSQL are running.` : 'Unable to save this step.')
    } finally {
      setSubmitting(false)
    }
  }

  const runTestPayment = async () => {
    setPaying(true)
    setError('')
    try {
      const paymentStatus = await setupApi.paymentStatus()
      if (!paymentStatus.configured) {
        window.setTimeout(() => { updateData({ paymentId: `LOCAL_TEST_${Date.now()}` }); setPaying(false) }, 900)
        return
      }
      await loadRazorpayCheckout()
      const order = await setupApi.createPaymentOrder()
      await new Promise<void>((resolve, reject) => {
        if (!window.Razorpay) { reject(new Error('Razorpay Checkout is unavailable.')); return }
        const checkout = new window.Razorpay({ key: order.keyId, amount: order.amount, currency: order.currency, name: 'CareerTide', description: '₹1,000 refundable activation deposit · Test Mode', order_id: order.orderId, prefill: { name: data.fullName, email: data.email, contact: data.phone }, theme: { color: '#2ed3b7' }, handler: async (result: RazorpayResult) => { try { const verified = await setupApi.verifyRazorpayPayment(result); updateData({ paymentId: verified.paymentId }); resolve() } catch (verificationError) { reject(verificationError) } }, modal: { ondismiss: () => reject(new Error('Test checkout was closed before payment.')) } })
        checkout.on('payment.failed', (response) => reject(new Error(response.error.description)))
        checkout.open()
      })
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Test payment failed.')
    } finally {
      setPaying(false)
    }
  }

  const requestSourceAccess = async (source: string) => {
    if (!record.serverUserId) { setError('Save your profile first, then request source access.'); return }
    setAccessingSource(source)
    setSourceAccessMessage('')
    try {
      // Save selected sources before creating the provider-access request.
      await setupApi.saveWorkflow(data, record.serverUserId)
      await setupApi.requestPlatformIntegration(record.serverUserId, source)
      setSourceAccessMessage(`${source} access setup was saved. Provider approval and official sign-in credentials are required before any authenticated platform action can be enabled.`)
    } catch (requestError) {
      setSourceAccessMessage(requestError instanceof Error ? requestError.message : 'Could not save the access request.')
    } finally { setAccessingSource('') }
  }

  if (activationProgress !== null) return <main className="activation-shell"><section className="activation-card intelligence-card"><div className="intelligence-orb"><i /><i /><i /><span>CT</span></div><small>PROFILE INTELLIGENCE ENGINE</small><h1>{activationProgress === 100 ? 'Your first search run is complete' : 'Building your opportunity map'}</h1><p>{activationProgress < 40 ? 'Securing your preferences and notification rules…' : activationProgress < 90 ? 'Connecting profile signals to the live job feed…' : activationProgress < 100 ? 'Ranking opportunities and forming your review queue…' : 'Your schedule is active and the first genuine discovery run has been recorded.'}</p><div className="intelligence-stages"><span className={activationProgress >= 15 ? 'done' : ''}>Profile</span><b>›</b><span className={activationProgress >= 40 ? 'done' : ''}>Discover</span><b>›</b><span className={activationProgress >= 90 ? 'done' : ''}>Rank</span><b>›</b><span className={activationProgress === 100 ? 'done' : ''}>Ready</span></div><div className="activation-bar"><i style={{ width: `${activationProgress}%` }} /></div><strong>{activationProgress}%</strong>{runResult && <div className="activation-results"><div><b>{runResult.discovered}</b><span>Jobs checked</span></div><div><b>{runResult.matched}</b><span>Matches saved</span></div><div><b>{runResult.applicationsSubmitted}</b><span>Submitted</span></div></div>}{runResult && <><div className="truth-note">No application was claimed as submitted. Matches are waiting for human review because Remotive provides discovery links, not an authorized submission API.</div><Button onClick={onComplete}>Open Career Assistant dashboard →</Button></>}</section></main>

  return <main className="onboarding-shell">
    <header className="setup-heading"><span>CAREERTIDE CAREER ASSISTANT</span><h1>Build your guided job search</h1><p>Complete five guided steps. Each step is saved to PostgreSQL and confirmed by email.</p></header>
    <OnboardingProgress busy={submitting || saving} currentStep={record.currentStep} onSelect={(step) => saveProgress(step)} />
    <form className="setup-card" onSubmit={next}>
      <div className="setup-card-title"><span>{phase.icon}</span><div><small>STEP {record.currentStep + 1} OF 5</small><h2>{phase.title} setup</h2><p>{phase.items.join(' • ')}</p></div></div>

      {record.currentStep === 0 && <div className="setup-grid phase-content" key="user">
        <div className="setup-section-title"><strong>Create your secure profile</strong><span>Authentication is required before dashboard access.</span></div>
        <Field label="Full name"><input required value={data.fullName} onChange={(event) => updateData({ fullName: event.target.value })} placeholder="Your full name" /></Field>
        <Field label="Email address"><input required type="email" value={data.email} onChange={(event) => updateData({ email: event.target.value })} placeholder="you@example.com" /></Field>
        <Field label="Phone"><input value={data.phone} onChange={(event) => updateData({ phone: event.target.value })} placeholder="+91 98765 43210" /></Field>
        <Field label="Experience"><select value={data.experience} onChange={(event) => updateData({ experience: event.target.value })}><option value="0-1">0–1 years</option><option value="0-3">0–3 years</option><option value="3-6">3–6 years</option><option value="6+">6+ years</option></select></Field>
        <Field label="Target roles"><input value={data.roles} onChange={(event) => updateData({ roles: event.target.value })} /></Field>
        <Field label="Skills"><input value={data.skills} onChange={(event) => updateData({ skills: event.target.value })} /></Field>
        <Field label="Preferred locations"><input value={data.locations} onChange={(event) => updateData({ locations: event.target.value })} /></Field>
        <Field label="Service"><select value={data.service} onChange={(event) => updateData({ service: event.target.value })}><option value="guided-automation">Guided job search</option><option value="discovery">Job discovery only</option><option value="matching">Matching and alerts</option></select></Field>
        <Field label="Resume" hint="Demo stores only the filename; production should use encrypted object storage."><label className="resume-drop"><input accept=".pdf,.doc,.docx" type="file" onChange={(event) => updateData({ resumeName: event.target.files?.[0]?.name ?? '' })} /><span>{data.resumeName ? `✓ ${data.resumeName}` : 'Upload PDF or DOCX'}</span></label></Field>
      </div>}

      {record.currentStep === 1 && <div className="payment-stage phase-content" key="payment"><div className="test-badge">RAZORPAY TEST MODE · NO REAL CHARGE</div><div className="payment-orb"><span>₹</span></div><h3>Refundable activation deposit</h3><strong>₹1,000</strong><p>Uses Razorpay Test Mode when test keys are configured. Otherwise it remains a clearly labeled local checkout simulation.</p><ul><li>Razorpay test order</li><li>Server signature verification</li><li>Refund eligibility tracking</li></ul>{data.paymentId ? <div className="payment-success">✓ Test payment verified <small>{data.paymentId}</small></div> : <Button className={paying ? 'paying' : ''} disabled={paying} onClick={runTestPayment}>{paying ? 'Opening secure test checkout…' : 'Pay ₹1,000 in test mode'}</Button>}</div>}

      {record.currentStep === 2 && <div className="setup-grid phase-content" key="automation">
        <Field label="Daily schedule"><input type="time" value={data.schedule} onChange={(event) => updateData({ schedule: event.target.value })} /></Field>
        <Field label="Time zone"><select value={data.timezone} onChange={(event) => updateData({ timezone: event.target.value })}><option value="Asia/Kolkata">India · Asia/Kolkata</option><option value="UTC">UTC</option><option value="Asia/Dubai">Dubai · Asia/Dubai</option><option value="Europe/London">London · Europe/London</option><option value="America/New_York">New York · America/New_York</option></select></Field>
        <Field label="Minimum match score"><div className="range-control"><input type="range" min="60" max="95" step="5" value={data.minimumScore} onChange={(event) => updateData({ minimumScore: Number(event.target.value) })} /><strong>{data.minimumScore}%</strong></div></Field>
        <Field label="Daily application limit"><div className="range-control"><input type="range" min="5" max="50" step="5" value={data.dailyLimit} onChange={(event) => updateData({ dailyLimit: Number(event.target.value) })} /><strong>{data.dailyLimit}</strong></div></Field>
        <fieldset className="source-picker source-access-picker"><legend>Choose your job sources</legend>{sourceOptions.map((source) => { const selected = data.sources.includes(source.name); return <div className={`source-access-card ${selected ? 'selected' : ''}`} key={source.name}><label><input checked={selected} type="checkbox" onChange={() => updateData({ sources: selected ? data.sources.filter((item) => item !== source.name) : [...data.sources, source.name] })} /><span><strong>{source.name}</strong><small>{source.detail}</small></span></label><div><em>{source.access}</em>{selected && source.requiresProviderAccess && <button type="button" disabled={accessingSource === source.name} onClick={() => void requestSourceAccess(source.name)}>{accessingSource === source.name ? 'Saving access…' : 'Set up provider access'}</button>}</div></div>})}</fieldset>
        {sourceAccessMessage && <p className="source-access-message">{sourceAccessMessage}</p>}
        <div className="source-access-explainer"><strong>How authenticated applications work</strong><span>1. Select a source</span><b>→</b><span>2. Provider approves access and signs in securely</span><b>→</b><span>3. CareerTide enables only permitted actions</span><b>→</b><span>4. Application status is saved</span></div>
        <p className="source-disclosure">Selecting a platform is not a login. CareerTide cannot use your password or claim an application was submitted. Provider authentication appears only after the platform grants approved OAuth/partner access.</p>
        <div className="dynamic-flow"><span>Run · {data.schedule} {data.timezone}</span><i>→</i><span>{data.sources.length} sources</span><i>→</i><span>Deduplicate</span><i>→</i><span>Match ≥ {data.minimumScore}%</span><i>→</i><span>Review {data.dailyLimit}</span></div>
      </div>}

      {record.currentStep === 3 && <div className="policy-stage phase-content" key="application"><div className="policy-card recommended"><span>Recommended</span><h3>Human review before applying</h3><p>Every selected source requires your confirmation unless its authorised submission integration is connected.</p><label className="switch-row"><input checked={data.reviewRequired} type="checkbox" onChange={(event) => updateData({ reviewRequired: event.target.checked })} /><i /><strong>{data.reviewRequired ? 'Review required' : 'Authorised integrations only'}</strong></label></div><div className="policy-card"><h3>Retry failed operations</h3><p>Retry temporary source or network failures. Eligibility failures are never retried.</p><select value={data.retries} onChange={(event) => updateData({ retries: Number(event.target.value) })}><option value="0">No retries</option><option value="1">1 retry</option><option value="2">2 retries</option><option value="3">3 retries</option></select></div><div className="eligibility-flow"><span>Eligibility rules</span><b>→</b><span>Duplicate check</span><b>→</b><span>{data.reviewRequired ? 'Your review' : 'Authorised connection gate'}</span><b>→</b><span>Track result</span></div></div>}

      {record.currentStep === 4 && <div className="operations-stage phase-content" key="operations"><div className="operations-guide"><span>WHAT HAPPENS AFTER YOU START</span><ol><li><b>1</b><div><strong>We find and rank jobs</strong><small>Your schedule, locations, roles, and score rules create your review queue.</small></div></li><li><b>2</b><div><strong>You stay in control of applications</strong><small>Open the original job link, sign in where needed, and submit only when ready.</small></div></li><li><b>3</b><div><strong>We keep your progress organised</strong><small>Mark your genuine submission, interview, or outcome so the dashboard and email updates stay accurate.</small></div></li></ol></div><div className="operation-options"><span className="operation-label">CHOOSE YOUR UPDATES</span><label><input checked={data.emailNotifications} type="checkbox" onChange={(event) => updateData({ emailNotifications: event.target.checked })} /><span><strong>Important status emails</strong><small>Payment, setup completion, pause/resume, and genuine application updates.</small></span></label><label><input checked={data.dailySummary} type="checkbox" onChange={(event) => updateData({ dailySummary: event.target.checked })} /><span><strong>Job-run summary</strong><small>See the jobs checked, strong matches, and review links after a completed run.</small></span></label></div><div className="launch-summary"><span>READY TO START</span><h3>Your career assistant is ready</h3><dl><div><dt>Your schedule</dt><dd>{data.schedule} daily</dd></div><div><dt>Selected sources</dt><dd>{data.sources.length}</dd></div><div><dt>Match quality</dt><dd>{data.minimumScore}% or higher</dd></div><div><dt>Applications</dt><dd>{data.reviewRequired ? 'You approve first' : 'Authorised access only'}</dd></div></dl><p>You can change your time, daily limit, locations, and source access from the dashboard at any time.</p></div></div>}

      {error && <div className="setup-error" role="alert">{error}</div>}
      <footer className="setup-actions"><Button disabled={record.currentStep === 0 || saving || submitting} onClick={() => saveProgress(record.currentStep - 1)} variant="secondary">Back</Button><span>{saving || submitting ? 'Waiting for API confirmation…' : 'Only changed steps call the API again'}</span><Button disabled={saving || submitting} type="submit">{submitting ? <><i className="button-spinner" /> Saving…</> : <>{record.currentStep === 4 ? 'Complete & open dashboard' : 'Save & continue'} →</>}</Button></footer>
    </form>
  </main>
}
