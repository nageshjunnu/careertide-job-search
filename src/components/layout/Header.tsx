import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import { PAGE_PATHS } from '../../config/app.config'
import type { Page } from '../../types/job'
import { clearOnboardingRecord } from '../../features/automation/services/automation.database'

const pages = Object.keys(PAGE_PATHS) as Page[]
const pageLabels: Record<Page, string> = { home: 'Home', jobs: 'Jobs', automation: 'Career Assistant', companies: 'Companies', sources: 'Sources', workflows: 'Workflows' }
const primaryMobilePages: Array<{ page: Page; icon: string; label: string }> = [
  { page: 'home', icon: '⌂', label: 'Home' },
  { page: 'jobs', icon: '⌕', label: 'Jobs' },
  { page: 'automation', icon: '✦', label: 'Assistant' },
  { page: 'sources', icon: '◉', label: 'Sources' },
]
const morePages: Page[] = ['companies', 'workflows']

export function Header({ location, onNavigate }: { location: string; onNavigate: (page: Page) => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [candidateName, setCandidateName] = useState<string | null>(localStorage.getItem('candidate_name'))
  const currentLocation = useLocation()
  const navigate = useNavigate()
  const closeMobileMenu = () => setMobileMenuOpen(false)
  const moreIsActive = morePages.some((page) => currentLocation.pathname === PAGE_PATHS[page])

  useEffect(() => {
    const checkAuth = () => {
      setCandidateName(localStorage.getItem('candidate_name'))
    }
    window.addEventListener('candidate_auth_change', checkAuth)
    window.addEventListener('storage', checkAuth)
    return () => {
      window.removeEventListener('candidate_auth_change', checkAuth)
      window.removeEventListener('storage', checkAuth)
    }
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem('candidate_token')
    localStorage.removeItem('candidate_user_id')
    localStorage.removeItem('candidate_name')
    localStorage.removeItem('candidate_email')
    await clearOnboardingRecord()
    setCandidateName(null)
    window.dispatchEvent(new Event('candidate_auth_change'))
    navigate('/')
  }

  return <>
    <header className="mini-top">
      <span>📍 Your Location: {location || 'Choose location'}</span>
      <span>🔔 One search. Multiple job sources.</span>
      <div className="mini-top-auth">
        {candidateName ? (
          <span className="candidate-badge-header">
            👤 Candidate: <strong>{candidateName}</strong>
            <button type="button" onClick={handleLogout} className="mini-auth-btn">Sign out</button>
          </span>
        ) : (
          <Link to="/login" className="mini-auth-link">Candidate Login</Link>
        )}
      </div>
    </header>
    <nav className="navbar">
      <button className="brand" onClick={() => { closeMobileMenu(); onNavigate('home') }} type="button"><span className="brand-mark">SB</span>SkillBridge</button>
      <div className="nav-links">
        {pages.map((page) => <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={page === 'home'} key={page} to={PAGE_PATHS[page]}>{pageLabels[page]}</NavLink>)}
        {candidateName ? (
          <NavLink to="/automation" className="nav-cta-btn">
            ✦ Assistant Dashboard
          </NavLink>
        ) : (
          <NavLink to="/login" className="nav-cta-btn">
            Candidate Login
          </NavLink>
        )}
      </div>
    </nav>
    {mobileMenuOpen && <nav id="mobile-app-menu" className="mobile-app-menu" aria-label="App menu">
      <span>MORE FROM CAREERTIDE</span>
      <div>{morePages.map((page) => <NavLink onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''} end={page === 'home'} key={page} to={PAGE_PATHS[page]}>{pageLabels[page]}</NavLink>)}</div>
      <div className="mobile-menu-auth">
        {candidateName ? (
          <button type="button" onClick={handleLogout}>Sign out ({candidateName})</button>
        ) : (
          <Link to="/login" onClick={closeMobileMenu}>Candidate Login</Link>
        )}
      </div>
    </nav>}
    <nav className="mobile-bottom-nav" aria-label="Primary app navigation">
      {primaryMobilePages.map(({ page, icon, label }) => <NavLink key={page} onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''} end={page === 'home'} to={PAGE_PATHS[page]}><i aria-hidden="true">{icon}</i><span>{label}</span></NavLink>)}
      <button type="button" className={moreIsActive || mobileMenuOpen ? 'active' : ''} aria-expanded={mobileMenuOpen} aria-controls="mobile-app-menu" onClick={() => setMobileMenuOpen((open) => !open)}><i aria-hidden="true">•••</i><span>More</span></button>
    </nav>
  </>
}
