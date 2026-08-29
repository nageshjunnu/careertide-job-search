import { useState } from 'react'
import { parseAndValidateResume, type ResumeValidationResult } from '../utils/resumeValidator'
import { setupApi } from '../services/setup.api'
import { getOnboardingRecord, saveOnboardingRecord } from '../services/automation.database'

interface CandidateProfileEditModalProps {
  userId: string
  initialRoles?: string
  initialExperience?: string
  initialResumeName?: string
  onClose: () => void
  onSuccess: (updated: { roles: string; experience: string; resumeName: string }) => void
}

export function CandidateProfileEditModal({
  userId,
  initialRoles = 'Software Engineer',
  initialExperience = '2-5 years',
  initialResumeName = 'Resume.pdf',
  onClose,
  onSuccess,
}: CandidateProfileEditModalProps) {
  const [roles, setRoles] = useState(initialRoles)
  const [experience, setExperience] = useState(initialExperience)
  const [resumeName, setResumeName] = useState(initialResumeName)
  const [resumeReport, setResumeReport] = useState<ResumeValidationResult | null>(null)
  const [parsingResume, setParsingResume] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleResumeFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setParsingResume(true)
    setError(null)
    setResumeName(file.name)
    try {
      const report = await parseAndValidateResume(file)
      setResumeReport(report)
    } catch {
      setError('Unable to parse resume document. Please upload a valid PDF or DOCX file.')
    } finally {
      setParsingResume(false)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roles.trim()) {
      setError('Please specify at least one target job title or role.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setupApi.updateCandidateProfile(userId, {
        roles: roles.trim(),
        experience: experience.trim(),
        resumeName,
      })

      // Sync to local database storage as well
      const record = await getOnboardingRecord()
      if (record) {
        const updatedData = {
          ...record.data,
          roles: roles.trim(),
          experience: experience.trim(),
          resumeName,
        }
        await saveOnboardingRecord({
          ...record,
          data: updatedData,
          updatedAt: new Date().toISOString(),
        })
      }

      setSuccessMsg('Candidate profile details (Job Roles, Experience, Resume) updated successfully!')
      onSuccess({ roles: roles.trim(), experience: experience.trim(), resumeName })
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update candidate profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="platform-modal-backdrop" onClick={onClose}>
      <div className="platform-modal profile-edit-modal" onClick={(e) => e.stopPropagation()}>
        <header className="platform-modal-header">
          <div className="platform-modal-title">
            <span className="platform-logo-mark">👤</span>
            <div>
              <h3>Candidate Profile Editor</h3>
              <small>Edit Target Job, Experience & Profile Resume</small>
            </div>
          </div>
          <button className="platform-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <form onSubmit={(e) => void handleSaveProfile(e)}>
          <div className="platform-modal-body">
            <div className="profile-edit-banner">
              <span className="banner-icon">🎯</span>
              <p>
                <strong>Candidate Profile Settings</strong>: Updating these details adjusts AI match scoring and ensures recruiters receive your latest resume.
              </p>
            </div>

            {error && <div className="platform-auth-error">{error}</div>}
            {successMsg && <div className="setup-success">{successMsg}</div>}

            {/* Field 1: Target Job Titles / Roles */}
            <div className="platform-field">
              <label htmlFor="edit-roles">
                Target Job Titles / Roles <span className="field-required">*</span>
              </label>
              <input
                id="edit-roles"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="e.g. Full Stack Developer, Software Engineer, Java Developer"
                required
              />
              <small>Separate multiple roles with commas. Used for AI job matching.</small>
            </div>

            {/* Field 2: Total Years of Experience */}
            <div className="platform-field">
              <label htmlFor="edit-exp">Years of Experience</label>
              <select
                id="edit-exp"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="edit-select-input"
              >
                <option value="0-2 years">0 - 2 years (Entry / Junior)</option>
                <option value="2-5 years">2 - 5 years (Mid-Level)</option>
                <option value="5-8 years">5 - 8 years (Senior)</option>
                <option value="8+ years">8+ years (Lead / Architect)</option>
              </select>
              <small>Calculates match quality against employer seniorities.</small>
            </div>

            {/* Field 3: Resume Document Upload & Verification */}
            <div className="platform-field">
              <label>Profile Resume Document</label>
              <div className="resume-upload-bar">
                <div className="resume-file-chip">
                  <span>📄</span>
                  <strong>{resumeName || 'No resume attached'}</strong>
                </div>
                <label className="resume-browse-btn">
                  {parsingResume ? 'Validating…' : '📁 Replace Resume'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => void handleResumeFileUpload(e)}
                    hidden
                  />
                </label>
              </div>
              <small>Upload PDF or DOCX file. Automatically verified for contact info & skills.</small>

              {/* Resume Validation Live Report Card */}
              {resumeReport && (
                <div className={`resume-report-box ${resumeReport.valid ? 'passed' : 'warning'}`}>
                  <div className="report-top">
                    <strong>Resume Validation Score</strong>
                    <span className="score-tag">{resumeReport.score}% Quality Score</span>
                  </div>
                  <div className="report-body">
                    <small>
                      {resumeReport.emailFound ? `📧 Email detected: ${resumeReport.emailFound}` : '⚠️ No contact email found'}
                    </small>
                    <small>
                      {resumeReport.skillsFound.length > 0
                        ? `⚡ Skills detected: ${resumeReport.skillsFound.slice(0, 5).join(', ')}`
                        : '⚠️ Add explicit technical skills to boost match score'}
                    </small>
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className="platform-modal-footer">
            <button className="mini-auth-btn" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="btn-connect-gateway" disabled={saving} type="submit">
              {saving ? 'Updating Profile…' : 'Save Profile Changes 💾'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

