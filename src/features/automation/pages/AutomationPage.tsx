import { useEffect, useState } from 'react'
import { Button } from '../../../components/common/Button'
import { AutomationOnboarding } from '../components/AutomationOnboarding'
import { AutomationProvider } from '../context/AutomationContext'
import { clearOnboardingRecord, getOnboardingRecord } from '../services/automation.database'
import { AutomationDashboard } from './AutomationDashboard'
import '../styles/automation.css'

export function AutomationPage() {
  const [access, setAccess] = useState<'loading' | 'setup' | 'dashboard'>('loading')

  useEffect(() => {
    getOnboardingRecord()
      .then((record) => setAccess(record?.authenticated && record.completed ? 'dashboard' : 'setup'))
      .catch(() => setAccess('setup'))
  }, [])

  if (access === 'loading') return <div className="setup-loading full-page"><span /><p>Checking your Career Assistant access…</p></div>
  if (access === 'setup') return <AutomationOnboarding onComplete={() => setAccess('dashboard')} />

  return <AutomationProvider>
    <div className="authenticated-banner"><span>✓ Authenticated Career Assistant dashboard</span><Button variant="ghost" onClick={async () => { await clearOnboardingRecord(); setAccess('setup') }}>Sign out</Button></div>
    <AutomationDashboard />
  </AutomationProvider>
}
