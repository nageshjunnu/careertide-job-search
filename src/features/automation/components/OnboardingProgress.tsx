import { ONBOARDING_PHASES } from '../config/onboarding.config'

export function OnboardingProgress({ currentStep, onSelect, busy = false }: { currentStep: number; onSelect: (step: number) => void; busy?: boolean }) {
  return <div className="onboarding-progress" aria-label="Automation setup progress">
    {ONBOARDING_PHASES.map((phase, index) => <button className={`${index === currentStep ? 'active' : ''} ${index < currentStep ? 'complete' : ''}`} disabled={busy || index > currentStep} key={phase.id} onClick={() => onSelect(index)} type="button">
      <span>{index < currentStep ? '✓' : phase.icon}</span><div><strong>{phase.title}</strong><small>{phase.items.join(' · ')}</small></div>
    </button>)}
  </div>
}
