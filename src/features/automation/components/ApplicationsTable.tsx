import { useState } from 'react'
import type { TrackedApplication } from '../types/automation'

export function ApplicationsTable({
  applications,
  onMarkApplied,
  onApply,
}: {
  applications: TrackedApplication[]
  onMarkApplied: (matchId: number) => Promise<void>
  onApply?: (matchId: number) => Promise<void>
}) {
  const [applyingId, setApplyingId] = useState<number | null>(null)

  const handleApply = async (matchId: number) => {
    setApplyingId(matchId)
    try {
      if (onApply) {
        await onApply(matchId)
      } else {
        await onMarkApplied(matchId)
      }
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="automation-table-wrap">
      <table className="automation-table">
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Match</th>
            <th>Source</th>
            <th>Contact / Recruiter</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td>
                <a href={application.sourceUrl} rel="noreferrer" target="_blank">
                  <strong>{application.role}</strong>
                </a>
                <span>{application.company}</span>
              </td>
              <td>
                <b className="match-pill">{application.score}%</b>
              </td>
              <td>
                <span className="source-tag">{application.source}</span>
              </td>
              <td>
                <small className="contact-check">
                  {application.contactEmail ? (
                    <span className="email-found">📧 {application.contactEmail}</span>
                  ) : application.contactStatus === 'direct_portal_application' ? (
                    'Verified Portal'
                  ) : application.contactStatus === 'no_public_email_found' ? (
                    'Direct apply'
                  ) : (
                    'Platform verified'
                  )}
                </small>
              </td>
              <td>
                <span className={`application-status status-${application.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {application.status === 'Applied' ? '✓ Applied' : application.status}
                </span>
              </td>
              <td>
                <small>{application.updatedAt}</small>
              </td>
              <td>
                <div className="table-actions-cell">
                  {application.status === 'Review required' ? (
                    <>
                      <button
                        className="btn-apply-primary"
                        onClick={() => void handleApply(application.id)}
                        disabled={applyingId === application.id}
                        type="button"
                      >
                        {applyingId === application.id ? 'Applying…' : '⚡ 1-Click Apply'}
                      </button>
                      <a
                        className="open-source-link"
                        href={application.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View
                      </a>
                    </>
                  ) : (
                    <a className="open-source" href={application.sourceUrl} rel="noreferrer" target="_blank">
                      Open listing ↗
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!applications.length && (
            <tr>
              <td colSpan={7} className="empty-table-cell">
                No matching opportunities in the queue yet. Click "Run Instant Discovery" to find live matching jobs across your active sources.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
