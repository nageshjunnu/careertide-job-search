type WorkflowStep = {
  id: string
  stepNumber: number
  icon: string
  label: string
  subtitle: string
  detail: string
  badge: string
}

const VISUAL_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'profile',
    stepNumber: 1,
    icon: '👤',
    label: 'Profile & Resume Signals',
    subtitle: 'Extracts skills & resume content',
    detail: 'Target roles, experience, locations & verified resume keywords.',
    badge: 'Step 1',
  },
  {
    id: 'discover',
    stepNumber: 2,
    icon: '🌐',
    label: 'Multi-Source Discovery',
    subtitle: 'Scans live job feeds',
    detail: 'Fetches jobs across Naukri, LinkedIn, Indeed, Remotive, Arbeitnow & Jobicy.',
    badge: 'Step 2',
  },
  {
    id: 'dedupe',
    stepNumber: 3,
    icon: '⚡',
    label: 'Smart Deduplication',
    subtitle: 'Filters duplicate roles',
    detail: 'Removes duplicate company listings & previously applied jobs.',
    badge: 'Step 3',
  },
  {
    id: 'match',
    stepNumber: 4,
    icon: '🎯',
    label: 'Match Quality Scoring',
    subtitle: 'Filters by match score',
    detail: 'Ranks jobs using candidate skill fit & minimum match score rules.',
    badge: 'Step 4',
  },
  {
    id: 'apply',
    stepNumber: 5,
    icon: '🚀',
    label: '1-Click Apply Gateway',
    subtitle: 'Instant candidate dispatch',
    detail: 'Submits application with profile resume & customized pitch.',
    badge: 'Step 5',
  },
  {
    id: 'track',
    stepNumber: 6,
    icon: '📬',
    label: 'Track & Email Alerts',
    subtitle: 'Database & email confirmation',
    detail: 'Updates pipeline status and sends candidate email delivery receipt.',
    badge: 'Step 6',
  },
]

export function WorkflowCanvas() {
  return (
    <div className="workflow-canvas-container" aria-label="Daily guided job search process flow">
      <div className="workflow-flow-grid">
        {VISUAL_WORKFLOW_STEPS.map((step, index) => (
          <div className="workflow-card-wrap" key={step.id}>
            <article className={`workflow-step-card ${step.id === 'apply' ? 'featured-gateway' : ''}`}>
              <div className="step-card-top">
                <span className="step-icon-badge">{step.icon}</span>
                <span className="step-number-tag">{step.badge}</span>
              </div>
              <div className="step-card-content">
                <strong>{step.label}</strong>
                <small className="step-subtitle">{step.subtitle}</small>
                <p className="step-detail">{step.detail}</p>
              </div>
              <div className="step-card-status">
                <span className="status-indicator-dot" />
                <small>Active Pipeline Stage</small>
              </div>
            </article>
            {index < VISUAL_WORKFLOW_STEPS.length - 1 && (
              <div className="workflow-flow-arrow" aria-hidden="true">
                <span>⟶</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="workflow-canvas-footer">
        <div className="footer-explainer">
          <span className="explainer-icon">💡</span>
          <span>
            <strong>How Guided Search Runs:</strong> CareerTide automatically executes this 6-stage pipeline at your scheduled daily time ({' '}
            <code className="time-code">08:00 AM</code> ). Strong matches are saved to your Opportunity Pipeline for 1-Click submission.
          </span>
        </div>
      </div>
    </div>
  )
}
