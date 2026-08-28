import type { OnboardingData, OnboardingRecord } from '../types/onboarding'

export const ONBOARDING_PHASES = [
  { id: 'user', title: 'User', icon: '01', items: ['Sign up', 'Profile', 'Resume', 'Preferences', 'Service'] },
  { id: 'payment', title: 'Payment', icon: '02', items: ['₹1,000 test deposit', 'Checkout', 'Verification', 'Activation'] },
  { id: 'automation', title: 'Search Plan', icon: '03', items: ['Schedule', 'Job sources', 'Deduplication', 'Match/rank', 'Queue'] },
  { id: 'application', title: 'Application', icon: '04', items: ['Eligibility', 'Apply/review', 'Retry', 'Track result'] },
  { id: 'operations', title: 'Operations', icon: '05', items: ['Email', 'Audit logs', 'Refund status', 'Dashboard'] },
] as const

export const DEFAULT_ONBOARDING_DATA: OnboardingData = {
  email: '', fullName: '', phone: '', resumeName: '', roles: 'Frontend Developer', skills: 'React, TypeScript',
  locations: 'Hyderabad, Remote', experience: '3-6', service: 'guided-automation', paymentId: '',
  schedule: '08:00', timezone: 'Asia/Kolkata', sources: ['Remotive', 'LinkedIn', 'Naukri'], minimumScore: 80, dailyLimit: 25,
  reviewRequired: true, retries: 2, emailNotifications: true, dailySummary: true,
}

export const createInitialRecord = (): OnboardingRecord => ({
  id: 'current-user', authenticated: false, completed: false, currentStep: 0,
  updatedAt: new Date().toISOString(), data: { ...DEFAULT_ONBOARDING_DATA },
})
