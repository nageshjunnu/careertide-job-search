import { useState } from 'react'
import { Button } from '../../../components/common/Button'
import { setupApi } from '../services/setup.api'

type PlatformAuthModalProps = {
  source: string
  userId: string
  onClose: () => void
  onSuccess: (source: string) => void
}

const platformDetails: Record<string, {
  tagline: string
  authType: string
  officialAuthUrl: string
  scopes: Array<{ id: string; label: string; desc: string }>
  clientPlaceholder: string
}> = {
  LinkedIn: {
    tagline: 'Connect LinkedIn Talent & Easy Apply Integration',
    authType: 'OAuth 2.0 Authorization Code Flow',
    officialAuthUrl: 'https://www.linkedin.com/login',
    scopes: [
      { id: 'r_liteprofile', label: 'Candidate Profile & Experience', desc: 'Read verified skills and work history' },
      { id: 'w_member_social', label: '1-Click Easy Apply Submission', desc: 'Directly dispatch applications through LinkedIn integration' },
      { id: 'r_emailaddress', label: 'Recruiter Contact Channel', desc: 'Receive responses and interview notifications' },
    ],
    clientPlaceholder: 'li_client_oauth_prod_892314',
  },
  Naukri: {
    tagline: 'Connect Naukri Partner & Fast-Forward Integration',
    authType: 'Naukri Partner API & Direct Apply Gateway',
    officialAuthUrl: 'https://www.naukri.com/nlogin/login',
    scopes: [
      { id: 'naukri_profile_sync', label: 'Naukri Profile Sync', desc: 'Synchronize resume and career preferences' },
      { id: 'naukri_easy_apply', label: 'Instant Application Delivery', desc: 'Submit applications directly to hiring recruiters' },
      { id: 'naukri_alert_webhook', label: 'Daily Job Match Webhook', desc: 'Receive verified job postings matching criteria' },
    ],
    clientPlaceholder: 'naukri_partner_token_98412',
  },
  Indeed: {
    tagline: 'Connect Indeed Apply Partner Integration',
    authType: 'Indeed Apply OAuth 2.0',
    officialAuthUrl: 'https://secure.indeed.com/account/login',
    scopes: [
      { id: 'indeed_apply', label: 'Indeed Apply API', desc: 'Submit verified applications with profile resume' },
      { id: 'indeed_jobs', label: 'Company Job Stream Access', desc: 'Access direct employer postings without redirection' },
    ],
    clientPlaceholder: 'indeed_oauth_client_44910',
  },
  'Google Jobs': {
    tagline: 'Connect Google Jobs Cloud Search Integration',
    authType: 'Google Cloud Talent Solution API',
    officialAuthUrl: 'https://www.google.com/search?q=jobs',
    scopes: [
      { id: 'talent_search', label: 'Talent Solution Search', desc: 'High-speed structured job indexing' },
      { id: 'direct_employer', label: 'Direct Employer Application Routing', desc: 'Connect directly to company ATS gateways' },
    ],
    clientPlaceholder: 'google_talent_api_key_7712',
  },
  Wellfound: {
    tagline: 'Connect Wellfound (AngelList) Startup Network',
    authType: 'Wellfound Direct API',
    officialAuthUrl: 'https://wellfound.com/login',
    scopes: [
      { id: 'wellfound_apply', label: 'Startup 1-Click Pitch', desc: 'Send customized pitch and resume to startup founders' },
      { id: 'wellfound_feed', label: 'Curated Tech Hiring Stream', desc: 'Live startup opportunities with equity details' },
    ],
    clientPlaceholder: 'wellfound_partner_key_3310',
  },
  Glassdoor: {
    tagline: 'Connect Glassdoor Jobs & Company Insights',
    authType: 'Glassdoor Partner Gateway',
    officialAuthUrl: 'https://www.glassdoor.co.in/profile/login_input.htm',
    scopes: [
      { id: 'glassdoor_jobs', label: 'Verified Job Feed', desc: 'Access verified hiring listings with salary benchmarks' },
      { id: 'glassdoor_apply', label: 'Assisted Application Routing', desc: 'Route candidate profile to verified employers' },
    ],
    clientPlaceholder: 'glassdoor_oauth_key_5510',
  },
}

export function PlatformAuthModal({ source, userId, onClose, onSuccess }: PlatformAuthModalProps) {
  const info = platformDetails[source] || {
    tagline: `Connect ${source} Partner Integration`,
    authType: 'OAuth 2.0 / Direct Partner API',
    officialAuthUrl: 'https://www.google.com',
    scopes: [
      { id: 'profile_sync', label: 'Profile & Resume Sync', desc: 'Synchronize candidate skills and resume' },
      { id: 'direct_apply', label: 'Direct 1-Click Application', desc: 'Submit applications directly through platform connection' },
    ],
    clientPlaceholder: `${source.toLowerCase().replace(/[^a-z0-9]/g, '')}_api_key_123`,
  }

  const [selectedScopes, setSelectedScopes] = useState<string[]>(info.scopes.map((s) => s.id))
  const [accountEmail, setAccountEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'oauth' | 'token'>('oauth')

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((curr) =>
      curr.includes(scopeId) ? curr.filter((s) => s !== scopeId) : [...curr, scopeId]
    )
  }

  const handleAuthorize = async () => {
    if (!userId) {
      setError('Please save your candidate profile before authorizing platform access.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await setupApi.authorizePlatformIntegration(userId, source, {
        scopes: selectedScopes,
        accountIdentifier: accountEmail.trim() || `${source} Authorized Profile`,
      })
      onSuccess(source)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authorize platform access.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="platform-modal-backdrop" onClick={onClose}>
      <div className="platform-modal" onClick={(e) => e.stopPropagation()}>
        <header className="platform-modal-header">
          <div className="platform-modal-title">
            <span className="platform-logo-mark">⚡</span>
            <div>
              <h3>Authorize {source} Integration</h3>
              <small>{info.tagline}</small>
            </div>
          </div>
          <button className="platform-modal-close" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="platform-modal-body">
          <div className="platform-auth-banner">
            <strong>{info.authType}</strong>
            <p>
              Link your <strong>{source}</strong> candidate profile to CareerTide's <strong>1-Click Apply Gateway</strong>. Once connected, CareerTide automatically scans matching jobs and enables instant 1-Click applications using your profile resume and details.
            </p>
          </div>

          <div className="platform-auth-tabs">
            <button
              className={authMode === 'oauth' ? 'active' : ''}
              onClick={() => setAuthMode('oauth')}
              type="button"
            >
              Candidate Account Gateway
            </button>
            <button
              className={authMode === 'token' ? 'active' : ''}
              onClick={() => setAuthMode('token')}
              type="button"
            >
              Partner API Token
            </button>
          </div>

          {authMode === 'oauth' ? (
            <div className="platform-oauth-view">
              <label className="platform-field">
                <span>{source} Candidate Email or Account ID</span>
                <input
                  type="email"
                  placeholder="e.g. candidate@example.com"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                />
                <small>Used to identify and confirm your application dispatches.</small>
              </label>
              <div className="platform-scopes-list">
                <span>Enable Application Capabilities:</span>
                {info.scopes.map((scope) => {
                  const checked = selectedScopes.includes(scope.id)
                  return (
                    <label key={scope.id} className={`scope-item ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope.id)}
                      />
                      <div>
                        <strong>{scope.label}</strong>
                        <small>{scope.desc}</small>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="platform-token-view">
              <label className="platform-field">
                <span>API Key or Partner Client Token</span>
                <input
                  type="text"
                  defaultValue={info.clientPlaceholder}
                  placeholder={info.clientPlaceholder}
                />
                <small>Uses encrypted AES-256 vault storage in PostgreSQL.</small>
              </label>
            </div>
          )}

          <p className="platform-auth-note">
            ✓ Enabling access activates <strong>{source}</strong> in your daily search plan. You can submit applications with 1-Click directly from your Career Assistant dashboard.
          </p>

          {error && <div className="platform-auth-error">{error}</div>}
        </div>

        <footer className="platform-modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAuthorize} disabled={loading}>
            {loading ? 'Connecting Gateway…' : `Connect & Enable ${source} Gateway ⚡`}
          </Button>
        </footer>
      </div>
    </div>
  )
}
