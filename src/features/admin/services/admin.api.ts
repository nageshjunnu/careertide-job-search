import { makeApiCall } from '../../../services/api/client'

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

export type AdminOverview = {
  totals: { users: string; profiles: string; matches: string }
  workflows: { active: string; paused: string; configured: string }
  payments: { verified: string; amount: string }
  emails: { sent: string; failed: string }
  recentUsers: Array<{ id: string; full_name: string; email: string; created_at: string; workflow_status: string }>
  recentRuns: Array<{ id: number; status: string; jobs_discovered: number; jobs_matched: number; progress_percent: number; started_at: string; full_name: string }>
  audits: Array<{ admin_email: string; action: string; target_type: string | null; target_id: string | null; created_at: string }>
  sources: Array<{ source: string; candidates: string; active: string }>
  trends: Array<{ label: string; candidates: string }>
}

export type AdminUser = { id: string; full_name: string; email: string; phone: string | null; created_at: string; roles: string | null; experience: string | null; locations: string | null; workflow_status: string; schedule: string | null; timezone: string | null; daily_limit: number | null; minimum_score: number | null; matches: number }

export const adminApi = {
  login: (email: string, password: string) => makeApiCall<{ token: string; admin: { email: string } }>(`${API_URL}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }),
  logout: (token: string) => makeApiCall(`${API_URL}/api/admin/logout`, { method: 'POST', headers: authHeaders(token) }),
  overview: (token: string) => makeApiCall<AdminOverview>(`${API_URL}/api/admin/overview`, { headers: authHeaders(token) }),
  users: (token: string) => makeApiCall<{ users: AdminUser[] }>(`${API_URL}/api/admin/users`, { headers: authHeaders(token) }),
  updateWorkflow: (token: string, userId: string, status: 'active' | 'paused') => makeApiCall(`${API_URL}/api/admin/users/${userId}/workflow`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
  updateRules: (token: string, userId: string, rules: { schedule: string; timezone: string; dailyLimit: number; minimumScore: number; locations: string }) => makeApiCall(`${API_URL}/api/admin/users/${userId}/rules`, { method: 'PATCH', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(rules) }),
  deleteUser: (token: string, userId: string) => makeApiCall(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders(token) }),
}
