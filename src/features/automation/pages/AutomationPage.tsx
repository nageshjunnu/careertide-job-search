import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/common/Button'
import { AutomationOnboarding } from '../components/AutomationOnboarding'
import { AutomationProvider } from '../context/AutomationContext'
import { clearOnboardingRecord, getOnboardingRecord, saveOnboardingRecord } from '../services/automation.database'
import { setupApi } from '../services/setup.api'
import type { OnboardingRecord } from '../types/onboarding'
import { AutomationDashboard } from './AutomationDashboard'
import '../styles/automation.css'

export function AutomationPage() {
  const navigate = useNavigate()
  const [access, setAccess] = useState<'loading' | 'setup' | 'dashboard'>('loading')

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const record = await getOnboardingRecord()
        if (record?.authenticated && record.completed) {
          setAccess('dashboard')
          return
        }

        // If local token exists, restore candidate session
        const token = localStorage.getItem('candidate_token')
        if (token) {
          try {
            const me = await setupApi.candidateMe(token)
            if (me.onboardingRecord) {
              await saveOnboardingRecord(me.onboardingRecord as unknown as OnboardingRecord)
              setAccess('dashboard')
              return
            }
          } catch {
            localStorage.removeItem('candidate_token')
          }
        }
        setAccess('setup')
      } catch {
        setAccess('setup')
      }
    }

    void checkAuth()
  }, [])

  const handleSignOut = useCallback(async () => {
    const token = localStorage.getItem('candidate_token')
    if (token) {
      void setupApi.candidateLogout(token).catch(() => {})
    }
    localStorage.removeItem('candidate_token')
    localStorage.removeItem('candidate_user_id')
    localStorage.removeItem('candidate_name')
    localStorage.removeItem('candidate_email')
    await clearOnboardingRecord()
    window.dispatchEvent(new Event('candidate_auth_change'))
    setAccess('setup')
  }, [])

  useEffect(() => {
    if (access !== 'dashboard') return
    const verifySession = async () => {
      const token = localStorage.getItem('candidate_token')
      if (!token) return void handleSignOut()
      try { await setupApi.candidateMe(token) } catch { await handleSignOut(); navigate('/candidate/login', { replace: true }) }
    }
    const interval = window.setInterval(() => { void verifySession() }, 5 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [access, handleSignOut, navigate])

  if (access === 'loading') return <div className="setup-loading full-page"><span /><p>Checking your Career Assistant access…</p></div>
  if (access === 'setup') return <AutomationOnboarding onComplete={() => setAccess('dashboard')} />

  return <AutomationProvider>
    <div className="authenticated-banner">
      <span>✓ Authenticated Career Assistant Portal</span>
      <Button variant="ghost" onClick={handleSignOut}>Sign out</Button>
    </div>
    <AutomationDashboard />
  </AutomationProvider>
}
