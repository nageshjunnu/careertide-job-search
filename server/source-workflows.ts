export type SourceWorkflow = {
  source: string
  automationMode: 'public_feed_discovery' | 'manual_source_review'
  submissionMode: 'human_confirmation_required'
  status: 'ready' | 'requires_authorized_integration'
  detail: string
}

const definitions: Record<string, SourceWorkflow> = {
  Remotive: { source: 'Remotive', automationMode: 'public_feed_discovery', submissionMode: 'human_confirmation_required', status: 'ready', detail: 'Permitted public-feed discovery. Open the original listing and confirm any submission yourself.' },
  LinkedIn: { source: 'LinkedIn', automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'A source link and review workflow only. Automated submission needs an approved LinkedIn integration.' },
  Naukri: { source: 'Naukri', automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'A source link and review workflow only. Automated submission needs an approved Naukri partner integration.' },
  'Google Jobs': { source: 'Google Jobs', automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'Google Jobs points to third-party employers; review and submit on the original employer source.' },
  Glassdoor: { source: 'Glassdoor', automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'A source link and review workflow only. Automated submission needs an approved Glassdoor integration.' },
  Indeed: { source: 'Indeed', automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'A source link and review workflow only. Automated submission needs an approved Indeed integration.' },
  Wellfound: { source: 'Wellfound', automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'A source link and review workflow only. Automated submission needs an approved Wellfound integration.' },
}

export function sourceWorkflowFor(source: string): SourceWorkflow {
  return definitions[source] ?? { source, automationMode: 'manual_source_review', submissionMode: 'human_confirmation_required', status: 'requires_authorized_integration', detail: 'This source has no authorised integration configured. Review and submit on the original source.' }
}
