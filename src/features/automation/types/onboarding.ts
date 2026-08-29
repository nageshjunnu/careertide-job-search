export type OnboardingData = {
  email: string
  fullName: string
  phone: string
  resumeName: string
  roles: string
  skills: string
  locations: string
  experience: string
  salaryExpectation: string
  service: string
  paymentId: string
  schedule: string
  timezone: string
  sources: string[]
  minimumScore: number
  dailyLimit: number
  reviewRequired: boolean
  retries: number
  emailNotifications: boolean
  dailySummary: boolean
}

export type OnboardingRecord = {
  id: 'current-user'
  authenticated: boolean
  completed: boolean
  currentStep: number
  updatedAt: string
  serverUserId?: string
  syncedSteps?: Record<string, string>
  data: OnboardingData
}
