import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, Bell, CreditCard, LayoutDashboard, LogOut, Menu, PauseCircle, PlayCircle, Settings, ShieldCheck, Users, X } from 'lucide-react'
import { adminApi, type AdminOverview, type AdminUser } from '../services/admin.api'
import '../styles/admin.css'

const SESSION_KEY = 'careertide-admin-session'
type Section = 'overview' | 'users' | 'runs' | 'payments' | 'notifications' | 'settings'

const nav = [{ id: 'overview', label: 'Overview', Icon: LayoutDashboard }, { id: 'users', label: 'Candidates', Icon: Users }, { id: 'runs', label: 'Job runs', Icon: Activity }, { id: 'payments', label: 'Payments', Icon: CreditCard }, { id: 'notifications', label: 'Email logs', Icon: Bell }, { id: 'settings', label: 'Settings', Icon: Settings }] as const
const num = (value?: string) => Number(value ?? 0).toLocaleString('en-IN')

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [section, setSection] = useState<Section>('overview')
  const [menuOpen, setMenuOpen] = useState(false)

  const load = async () => {
    if (!token) return
    setLoading(true)
    try {
      const [overviewData, usersData] = await Promise.all([adminApi.overview(token), adminApi.users(token)])
      setOverview(overviewData); setUsers(usersData.users); setError('')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Could not load the admin dashboard.'
      setError(message)
      if (/session|sign-in|401/i.test(message)) { sessionStorage.removeItem(SESSION_KEY); setToken('') }
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token])
  const login = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); setError(''); try { const result = await adminApi.login(email, password); sessionStorage.setItem(SESSION_KEY, result.token); setToken(result.token); setPassword('') } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Sign-in failed.') } finally { setLoading(false) } }
  const logout = async () => { try { await adminApi.logout(token) } finally { sessionStorage.removeItem(SESSION_KEY); setToken(''); setOverview(null) } }
  const updateWorkflow = async (user: AdminUser) => { const next = user.workflow_status === 'active' ? 'paused' : 'active'; await adminApi.updateWorkflow(token, user.id, next); await load() }
  const selectedUsers = useMemo(() => users.slice(0, 8), [users])

  if (!token) return <main className="admin-login"><section><div className="admin-login-brand"><ShieldCheck /> <span>Career<span>Tide</span> Admin</span></div><small>CONTROL CENTER</small><h1>Run your career platform with clarity.</h1><p>Secure access to candidates, job runs, platform activity, payments, and operational controls.</p><form onSubmit={login}><label>Admin email<input value={email} type="email" onChange={(event) => setEmail(event.target.value)} placeholder="admin@careertide.com" required /></label><label>Password<input value={password} type="password" onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>{error && <div className="admin-error">{error}</div>}<button disabled={loading}>{loading ? 'Checking access…' : 'Sign in to Admin'}</button></form><small className="admin-login-note">Credentials are configured through secure server environment variables.</small></section></main>

  return <main className="admin-shell"><aside className={menuOpen ? 'open' : ''}><div className="admin-brand"><ShieldCheck /><strong>Career<span>Tide</span></strong><small>ADMIN</small></div><nav>{nav.map(({ id, label, Icon }) => <button className={section === id ? 'active' : ''} key={id} onClick={() => { setSection(id); setMenuOpen(false) }}><Icon />{label}</button>)}</nav><div className="admin-user"><span>Platform administrator</span><button onClick={() => void logout()}><LogOut /> Sign out</button></div></aside><div className="admin-main"><header><button className="admin-menu" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X /> : <Menu />}</button><div><small>ADMIN / {section.toUpperCase()}</small><h1>{nav.find((item) => item.id === section)?.label}</h1></div><button className="admin-refresh" onClick={() => void load()}><Activity /> {loading ? 'Refreshing' : 'Live data'}</button></header>{error && <div className="admin-error">{error}</div>}{overview && <AdminContent section={section} overview={overview} users={selectedUsers} onWorkflow={updateWorkflow} />}</div></main>
}

function AdminContent({ section, overview, users, onWorkflow }: { section: Section; overview: AdminOverview; users: AdminUser[]; onWorkflow: (user: AdminUser) => Promise<void> }) {
  if (section === 'users') return <section className="admin-content"><Panel title="Candidate directory" subtitle="Profiles, preferences, and workflow controls"><CandidateTable users={users} onWorkflow={onWorkflow} /></Panel></section>
  if (section === 'runs') return <section className="admin-content"><Panel title="Recent job runs" subtitle="Genuine PostgreSQL-backed job-search activity"><RunList runs={overview.recentRuns} /></Panel></section>
  if (section === 'payments') return <section className="admin-content"><StatGrid overview={overview} /><Panel title="Payment operations" subtitle="Verified activation deposits are recorded in PostgreSQL."><div className="admin-empty">₹{num(overview.payments.amount)} across {num(overview.payments.verified)} verified payment records.</div></Panel></section>
  if (section === 'notifications') return <section className="admin-content"><StatGrid overview={overview} /><Panel title="Admin activity" subtitle="Security and operational audit events"><AuditList audits={overview.audits} /></Panel></section>
  if (section === 'settings') return <section className="admin-content"><Panel title="Platform settings" subtitle="Secure values stay in server environment variables."><div className="admin-settings-grid"><div><ShieldCheck /><strong>Admin access</strong><span>Set ADMIN_EMAIL and ADMIN_PASSWORD in the server/Vercel environment.</span></div><div><Bell /><strong>Delivery</strong><span>Configure SMTP values for transactional notifications.</span></div><div><CreditCard /><strong>Payments</strong><span>Configure Razorpay Test or Live keys in server environment variables.</span></div></div></Panel></section>
  return <section className="admin-content"><StatGrid overview={overview} /><div className="admin-layout"><Panel title="Candidate activity" subtitle="Latest onboarding and workflow status"><CandidateTable users={users.slice(0, 5)} onWorkflow={onWorkflow} /></Panel><Panel title="Recent search runs" subtitle="Live database activity"><RunList runs={overview.recentRuns.slice(0, 5)} /></Panel></div><Panel title="Administrative audit trail" subtitle="Recent protected admin actions"><AuditList audits={overview.audits} /></Panel></section>
}

function StatGrid({ overview }: { overview: AdminOverview }) { const items = [{ label: 'Registered candidates', value: num(overview.totals.users), note: `${num(overview.totals.profiles)} profiles ready`, Icon: Users }, { label: 'Active workflows', value: num(overview.workflows.active), note: `${num(overview.workflows.paused)} paused`, Icon: Activity }, { label: 'Verified payments', value: num(overview.payments.verified), note: `₹${num(overview.payments.amount)} recorded`, Icon: CreditCard }, { label: 'Email delivery', value: num(overview.emails.sent), note: `${num(overview.emails.failed)} failed`, Icon: Bell }]; return <div className="admin-stats">{items.map(({ label, value, note, Icon }) => <article key={label}><span><Icon /></span><small>{label}</small><strong>{value}</strong><em>{note}</em></article>)}</div> }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <article className="admin-panel"><header><div><h2>{title}</h2><p>{subtitle}</p></div><BarChart3 /></header>{children}</article> }
function CandidateTable({ users, onWorkflow }: { users: AdminUser[]; onWorkflow: (user: AdminUser) => Promise<void> }) { return <div className="admin-table-wrap"><table><thead><tr><th>Candidate</th><th>Profile</th><th>Matches</th><th>Workflow</th><th>Control</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.full_name}</strong><small>{user.email}</small></td><td>{user.roles || 'Profile pending'}<small>{user.experience || '—'} · {user.locations || '—'}</small></td><td>{user.matches}</td><td><span className={`admin-status ${user.workflow_status}`}>{user.workflow_status}</span></td><td>{['active', 'paused'].includes(user.workflow_status) ? <button className="workflow-control" onClick={() => void onWorkflow(user)}>{user.workflow_status === 'active' ? <><PauseCircle /> Pause</> : <><PlayCircle /> Activate</>}</button> : '—'}</td></tr>)}{!users.length && <tr><td colSpan={5}>No candidates have completed profile setup yet.</td></tr>}</tbody></table></div> }
function RunList({ runs }: { runs: AdminOverview['recentRuns'] }) { return <div className="admin-run-list">{runs.map((run) => <div key={run.id}><span className={run.status}><Activity /></span><div><strong>{run.full_name}</strong><small>{new Date(run.started_at).toLocaleString()} · {run.jobs_discovered} checked · {run.jobs_matched} matched</small></div><em>{run.status}</em></div>)}{!runs.length && <div className="admin-empty">No job runs have been recorded yet.</div>}</div> }
function AuditList({ audits }: { audits: AdminOverview['audits'] }) { return <div className="admin-audit">{audits.map((audit, index) => <div key={`${audit.created_at}-${index}`}><i /><span><strong>{audit.action.replaceAll('_', ' ')}</strong><small>{audit.admin_email} · {new Date(audit.created_at).toLocaleString()}</small></span></div>)}{!audits.length && <div className="admin-empty">No admin actions recorded yet.</div>}</div> }
