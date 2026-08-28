export type AutomationStatus = 'active' | 'paused' | 'setup'
export type ApplicationStatus = 'Review required' | 'Applied' | 'Interview' | 'Failed'

export type AutomationSettings = {
  schedule: string
  timezone: string
  dailyLimit: number
  minimumScore: number
  locations: string[]
  reviewRequired: boolean
}

export type TrackedApplication = {
  id: number
  company: string
  role: string
  score: number
  source: string
  sourceUrl: string
  status: ApplicationStatus
  contactEmail: string | null
  contactStatus: string | null
  updatedAt: string
}
