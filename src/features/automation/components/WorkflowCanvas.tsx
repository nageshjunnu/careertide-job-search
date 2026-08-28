import { AUTOMATION_STEPS } from '../config/automation.config'

export function WorkflowCanvas() {
  return <div className="workflow-canvas" aria-label="Daily job automation workflow">
    {AUTOMATION_STEPS.map((step, index) => <div className="workflow-node-wrap" key={step.id}>
      <article className={step.id === 'review' ? 'workflow-node review' : 'workflow-node'}><span>{index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div><em>✓</em></article>
      {index < AUTOMATION_STEPS.length - 1 && <i aria-hidden="true">↓</i>}
    </div>)}
  </div>
}
