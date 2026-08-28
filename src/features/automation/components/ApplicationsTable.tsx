import type { TrackedApplication } from '../types/automation'

export function ApplicationsTable({ applications, onMarkApplied }: { applications: TrackedApplication[]; onMarkApplied: (matchId: number) => Promise<void> }) {
  return <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>Opportunity</th><th>Match</th><th>Source</th><th>Contact check</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>
    {applications.map((application) => <tr key={application.id}><td><a href={application.sourceUrl} rel="noreferrer" target="_blank"><strong>{application.role}</strong></a><span>{application.company}</span></td><td><b>{application.score}%</b></td><td>{application.source}</td><td><small className="contact-check">{application.contactEmail ? `${application.contactEmail} · approval required` : application.contactStatus === 'no_public_email_found' ? 'No public email in JD' : 'Not checked yet'}</small></td><td><span className={`application-status status-${application.status.toLowerCase().replace(' ', '-')}`}>{application.status}</span></td><td>{application.updatedAt}</td><td>{application.status === 'Review required' ? <button className="mark-applied" onClick={() => void onMarkApplied(application.id)} type="button">I applied</button> : <a className="open-source" href={application.sourceUrl} rel="noreferrer" target="_blank">Open source</a>}</td></tr>)}
    {!applications.length && <tr><td colSpan={7}>No genuine matches are available yet. The next completed search run will appear here.</td></tr>}
  </tbody></table></div>
}
