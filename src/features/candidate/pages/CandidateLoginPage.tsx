import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '../../../components/common/Button'
import { setupApi } from '../../automation/services/setup.api'
import { saveOnboardingRecord } from '../../automation/services/automation.database'
import type { OnboardingRecord } from '../../automation/types/onboarding'
import '../../automation/styles/automation.css'

export function CandidateLoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const handleLoginSuccess = async (data: {
    token: string
    user: { id: string; email: string; fullName: string }
    onboardingRecord?: Record<string, unknown>
  }) => {
    localStorage.setItem('candidate_token', data.token)
    localStorage.setItem('candidate_user_id', data.user.id)
    localStorage.setItem('candidate_name', data.user.fullName)
    localStorage.setItem('candidate_email', data.user.email)

    if (data.onboardingRecord) {
      await saveOnboardingRecord(data.onboardingRecord as unknown as OnboardingRecord)
    }

    setSuccess(`Welcome back, ${data.user.fullName}! Redirecting to SkillBridge…`)
    window.dispatchEvent(new Event('candidate_auth_change'))
    setTimeout(() => {
      navigate('/automation')
    }, 600)
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!loginEmail.trim()) {
      setError('Please enter your email address.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const response = await setupApi.candidateLogin(loginEmail.trim(), loginPassword.trim() || undefined)
      await handleLoginSuccess(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please verify your email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="candidate-auth-shell">
      <div className="candidate-auth-card">
        <header className="candidate-auth-header">
          <span className="brand-mark">SB</span>
          <h1>Candidate Portal</h1>
          <p>Access your Career Assistant, automated job searches, and 1-Click application pipeline.</p>
        </header>

        <form className="candidate-form" onSubmit={handleLogin}>
          <label className="setup-field">
            <span>Candidate Email Address</span>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
          </label>

          <label className="setup-field">
            <span>Password</span>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
          </label>

          {error && <div className="setup-error" role="alert">{error}</div>}
          {success && <div className="setup-success">{success}</div>}

          <Button type="submit" disabled={loading}>
            {loading ? <><i className="button-spinner" /> Signing in…</> : 'Sign In to Career Assistant →'}
          </Button>
        </form>

        <footer className="candidate-auth-footer">
          <Link to="/">← Back to Job Search</Link>
          <span>•</span>
          <Link to="/admin">Recruiter / Admin Login →</Link>
        </footer>
      </div>
    </main>
  )
}
