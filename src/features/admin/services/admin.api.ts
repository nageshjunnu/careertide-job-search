import { makeApiCall } from '../../../services/api/client'

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

export type AdminOverview = {
  totals: { users: string; profiles: string; matches: string }
  workflows: { active: string; paused: string; configured: string }
  payments: { verified: string; amount: string }
  emails: { sent: string; failed: string }
  recentUsers: Array<{ id: string; full_name: string; email: string; created_at: string; workflow_status: string }>
  recentRuns: Array<{ id: number; status: string; jobs_discovered: number; jobs_matched: number; progress_percent: number; started_at: string; full_name: string; email: string; user_id: string }>
  audits: Array<{ admin_email: string; action: string; target_type: string | null; target_id: string | null; created_at: string }>
  sources: Array<{ source: string; candidates: string; active: string }>
  trends: Array<{ label: string; candidates: string }>
}

export type AdminUser = { id: string; full_name: string; email: string; phone: string | null; created_at: string; roles: string | null; experience: string | null; locations: string | null; workflow_status: string; schedule: string | null; timezone: string | null; daily_limit: number | null; minimum_score: number | null; matches: number }
export type CandidateAnalytics = { id: string; full_name: string; email: string; matches: number; applications: number; awaiting_review: number; runs: number; last_run_at: string | null; emails_sent: number; emails_failed: number }
export type JobRunSchedule = { id: number; name: string; cron_expression: string; active: boolean; timezone: string; updated_at: string }

export type PlatformConfig = {
  source: string
  mode: 'api' | 'recruiter_email'
  auto_dispatch: boolean
  api_key?: string | null
  api_secret?: string | null
  updated_at: string
}

export type PaymentGateway = {
  name: string
  enabled: boolean
  is_default: boolean
  mode: 'test' | 'live'
  configured: boolean
  config: { apiKey: string; webhookUrl: string }
  updated_at: string
}

export const adminApi = {
  login: (email: string, password: string) => makeApiCall<{ token: string; admin: { email: string } }>(`${API_URL}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }),
  logout: (token: string) => makeApiCall(`${API_URL}/api/admin/logout`, { method: 'POST', headers: authHeaders(token) }),
  overview: (token: string) => makeApiCall<AdminOverview>(`${API_URL}/api/admin/overview`, { headers: authHeaders(token) }),
  users: (token: string) => makeApiCall<{ users: AdminUser[] }>(`${API_URL}/api/admin/users`, { headers: authHeaders(token) }),
  candidateAnalytics: (token: string) => makeApiCall<{ analytics: CandidateAnalytics[] }>(`${API_URL}/api/admin/candidate-analytics`, { headers: authHeaders(token) }),
  jobRunSchedules: (token: string) => makeApiCall<{ schedules: JobRunSchedule[] }>(`${API_URL}/api/admin/job-run-schedules`, { headers: authHeaders(token) }),
  updateJobRunSchedule: (token: string, id: number, payload: { cronExpression?: string; active?: boolean; timezone?: string }) => makeApiCall(`${API_URL}/api/admin/job-run-schedules/${id}`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  pricing: (token: string) => makeApiCall<{ pricing: { monthlyMembershipAmount: number; includedJobs: number; extraJobAmount: number; firstConnectionAmount: number; accountChangeAmount: number } }>(`${API_URL}/api/admin/pricing`, { headers: authHeaders(token) }),
  updatePricing: (token: string, pricing: Record<string, number>) => makeApiCall(`${API_URL}/api/admin/pricing`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(pricing) }),
  settings: (token: string) => makeApiCall<{ settings: Record<string, string> }>(`${API_URL}/api/admin/settings`, { headers: authHeaders(token) }),
  updateSettings: (token: string, settings: Record<string, string>) => makeApiCall(`${API_URL}/api/admin/settings`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }),
  uploadLogo: (token: string, dataUrl: string) => makeApiCall<{ uploaded: boolean; logoUrl: string }>(`${API_URL}/api/admin/settings/logo`, { method: 'POST', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) }),
  platformConfigs: (token: string) => makeApiCall<{ configs: PlatformConfig[] }>(`${API_URL}/api/admin/platform-configs`, { headers: authHeaders(token) }),
  paymentGateways: (token: string) => makeApiCall<{ gateways: PaymentGateway[] }>(`${API_URL}/api/admin/payment-gateways`, { headers: authHeaders(token) }),
  updatePlatformConfig: (token: string, source: string, payload: { mode?: 'api' | 'recruiter_email'; autoDispatch?: boolean; api_key?: string; api_secret?: string }) =>
    makeApiCall<{ updated: boolean; config: PlatformConfig }>(
      `${API_URL}/api/admin/platform-configs/${encodeURIComponent(source)}`,
      { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    ),
  updatePaymentGateway: (token: string, name: string, payload: { enabled?: boolean; isDefault?: boolean; mode?: 'test' | 'live'; apiKey?: string; apiSecret?: string; webhookUrl?: string; webhookSecret?: string }) =>
    makeApiCall<{ updated: boolean; gateway: PaymentGateway }>(`${API_URL}/api/admin/payment-gateways/${encodeURIComponent(name)}`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  getRunDetails: (token: string, runId: number) =>
    makeApiCall<{ jobsApplied: Array<{ match_status: string; updated_at: string; title: string; company: string; source: string }>; emailsSent: number; emailsFailed: number }>(
      `${API_URL}/api/admin/runs/${runId}/details`,
      { headers: authHeaders(token) }
    ),
  updateWorkflow: (token: string, userId: string, status: 'active' | 'paused') => makeApiCall(`${API_URL}/api/admin/users/${userId}/workflow`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
  updateRules: (token: string, userId: string, rules: { schedule: string; timezone: string; dailyLimit: number; minimumScore: number; locations: string }) => makeApiCall(`${API_URL}/api/admin/users/${userId}/rules`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(rules) }),
  deleteUser: (token: string, userId: string) => makeApiCall(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders(token) }),
}
