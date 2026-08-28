import type { Page } from '../types/job'

export const APP_CONFIG = {
  name: 'CareerTide',
  defaultSearch: {
    query: 'Java Python AWS',
    location: 'Hyderabad Secunderabad',
    experience: '0-3',
  },
  api: {
    remotiveBaseUrl: 'https://remotive.com/api/remote-jobs',
    timeoutMs: 12_000,
    maxRemoteResults: 16,
  },
  pagination: { jobsPerPage: 6 },
} as const

export const PAGE_PATHS: Record<Page, string> = {
  home: '/',
  jobs: '/jobs',
  automation: '/automation',
  companies: '/companies',
  sources: '/sources',
  workflows: '/workflows',
}
