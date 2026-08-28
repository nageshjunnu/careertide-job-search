import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PAGE_PATHS } from '../../config/app.config'
import type { Page } from '../../types/job'

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
  const currentLocation = useLocation()
  const closeMobileMenu = () => setMobileMenuOpen(false)
  const moreIsActive = morePages.some((page) => currentLocation.pathname === PAGE_PATHS[page])

  return <>
    <header className="mini-top">
      <span>📍 Your Location: {location || 'Choose location'}</span>
      <span>🔔 One search. Multiple job sources.</span>
      <span>Candidate mode</span>
    </header>
    <nav className="navbar">
      <button className="brand" onClick={() => { closeMobileMenu(); onNavigate('home') }} type="button"><span className="brand-mark">CT</span>CareerTide</button>
      <div className="nav-links">
        {pages.map((page) => <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={page === 'home'} key={page} to={PAGE_PATHS[page]}>{pageLabels[page]}</NavLink>)}
      </div>
    </nav>
    {mobileMenuOpen && <nav id="mobile-app-menu" className="mobile-app-menu" aria-label="App menu">
      <span>MORE FROM CAREERTIDE</span>
      <div>{morePages.map((page) => <NavLink onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''} end={page === 'home'} key={page} to={PAGE_PATHS[page]}>{pageLabels[page]}</NavLink>)}</div>
    </nav>}
    <nav className="mobile-bottom-nav" aria-label="Primary app navigation">
      {primaryMobilePages.map(({ page, icon, label }) => <NavLink key={page} onClick={closeMobileMenu} className={({ isActive }) => isActive ? 'active' : ''} end={page === 'home'} to={PAGE_PATHS[page]}><i aria-hidden="true">{icon}</i><span>{label}</span></NavLink>)}
      <button type="button" className={moreIsActive || mobileMenuOpen ? 'active' : ''} aria-expanded={mobileMenuOpen} aria-controls="mobile-app-menu" onClick={() => setMobileMenuOpen((open) => !open)}><i aria-hidden="true">•••</i><span>More</span></button>
    </nav>
  </>
}
