import { makeApiCall } from '../../../services/api/client'
import type { OnboardingData } from '../types/onboarding'
import type { TrackedApplication } from '../types/automation'

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')

type StepResponse = { userId?: string; completed?: boolean; email?: { status: string } }

const postStep = (path: string, body: object) => makeApiCall<StepResponse>(`${API_URL}/api/setup/${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body), timeoutMs: 30_000,
})

export const setupApi = {
  // Candidate Authentication
  candidateLogin: (email: string, password?: string) =>
    makeApiCall<{
      token: string
      user: { id: string; email: string; fullName: string }
      onboardingRecord?: Record<string, unknown>
      profile?: Record<string, unknown>
      workflow?: Record<string, unknown>
    }>(`${API_URL}/api/candidate/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      timeoutMs: 30_000,
    }),

  candidateRegister: (data: {
    fullName: string
    email: string
    password?: string
    phone?: string
    roles?: string
    skills?: string
    locations?: string
    experience?: string
    salaryExpectation?: string
    resumeName?: string
    sources?: string[]
  }) =>
    makeApiCall<{
      token: string
      user: { id: string; email: string; fullName: string }
      onboardingRecord?: Record<string, unknown>
      profile?: Record<string, unknown>
      workflow?: Record<string, unknown>
    }>(`${API_URL}/api/candidate/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeoutMs: 30_000,
    }),

  candidateMe: (token: string) =>
    makeApiCall<{
      user: { id: string; email: string; full_name: string; phone?: string }
      profile?: Record<string, unknown>
      workflow?: Record<string, unknown>
      onboardingRecord?: Record<string, unknown>
    }>(`${API_URL}/api/candidate/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 15_000,
    }),

  candidateLogout: (token: string) =>
    makeApiCall<{ loggedOut: boolean }>(`${API_URL}/api/candidate/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),

  getCandidateProfiles: () =>
    makeApiCall<{ profiles: Array<{ id: string; email: string; full_name: string; roles: string | null; experience: string | null; locations: string | null }> }>(
      `${API_URL}/api/candidate/profiles`
    ),

  saveUser: (data: OnboardingData, userId?: string) => postStep('user', { ...data, userId }),
  verifyPayment: (data: OnboardingData, userId: string) => postStep('payment', { userId, paymentId: data.paymentId, amount: 1000, mode: 'test' }),
  saveWorkflow: (data: OnboardingData, userId: string) => postStep('workflow', { userId, schedule: data.schedule, timezone: data.timezone, sources: data.sources, minimumScore: data.minimumScore, dailyLimit: data.dailyLimit }),
  saveApplicationRules: (data: OnboardingData, userId: string) => postStep('application-rules', { userId, reviewRequired: data.reviewRequired, retries: data.retries }),
  saveOperations: (data: OnboardingData, userId: string) => postStep('operations', { userId, emailNotifications: data.emailNotifications, dailySummary: data.dailySummary }),
  paymentStatus: () => makeApiCall<{ configured: boolean; mode: string; keyId: string | null; recurring: boolean; amount: number }>(`${API_URL}/api/payments/status`),
  createPaymentOrder: () => makeApiCall<{ orderId?: string | null; subscriptionId?: string | null; checkoutKey: string; amount: number; currency: string; keyId: string; mode: string }>(`${API_URL}/api/payments/order`, { method: 'POST', timeoutMs: 30_000 }),
  verifyRazorpayPayment: (payment: { razorpay_order_id?: string; razorpay_subscription_id?: string; razorpay_payment_id: string; razorpay_signature: string }) => makeApiCall<{ verified: boolean; paymentId: string }>(`${API_URL}/api/payments/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment), timeoutMs: 30_000 }),
  saveDashboardSettings: (userId: string, settings: { schedule: string; timezone: string; dailyLimit: number; minimumScore: number; locations: string[] }) => makeApiCall<{ updated: boolean }>(`${API_URL}/api/setup/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, ...settings }), timeoutMs: 30_000 }),
  runGuidedSearch: (userId: string) => makeApiCall<{ runId: number; discovered: number; matched: number; applicationsSubmitted: number; mode: string }>(`${API_URL}/api/career-runs/${userId}`, { method: 'POST', timeoutMs: 60_000 }),
  getDashboard: (userId: string) => makeApiCall<{ matches: Array<{ id: number; title: string; company: string; source: string; source_url: string; match_score: number; status: string; updated_at: string; contact_email: string | null; contact_status: string | null }>; latestRun: { status: string; jobs_discovered: number; jobs_matched: number; progress_stage: string | null; progress_percent: number; finished_at: string | null } | null; runs: Array<{ id: number; status: string; jobs_discovered: number; jobs_matched: number; progress_stage: string | null; progress_percent: number; error_message: string | null; started_at: string }>; sourceWorkflows: Array<{ source: string; status: string; detail: string; last_checked_at: string | null; permission_status: string; requested_at: string | null }>; workflowStatus: 'configured' | 'active' | 'paused'; applicationsSubmitted: number; interviews: number }>(`${API_URL}/api/career/dashboard/${userId}`),
  requestPlatformIntegration: (userId: string, source: string) => makeApiCall<{ requested: boolean }>(`${API_URL}/api/career/platform-integrations/${userId}/${encodeURIComponent(source)}/request`, { method: 'POST', timeoutMs: 30_000 }),
  authorizePlatformIntegration: (userId: string, source: string, payload?: { scopes?: string[]; accountIdentifier?: string; accessToken?: string }) =>
    makeApiCall<{ connected: boolean; source: string; permissionStatus: string; connectedAt: string; message: string }>(
      `${API_URL}/api/career/platform-integrations/${userId}/${encodeURIComponent(source)}/authorize`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}), timeoutMs: 30_000 }
    ),
  disconnectPlatformIntegration: (userId: string, source: string) =>
    makeApiCall<{ disconnected: boolean; source: string }>(
      `${API_URL}/api/career/platform-integrations/${userId}/${encodeURIComponent(source)}`,
      { method: 'DELETE', timeoutMs: 30_000 }
    ),
  applyToMatch: (userId: string, matchId: number) =>
    makeApiCall<{ applied: boolean; matchId: number; jobTitle: string; company: string; source: string; status: string; appliedAt: string }>(
      `${API_URL}/api/career/matches/${matchId}/apply`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }), timeoutMs: 30_000 }
    ),
  batchApplyMatches: (userId: string, matchIds?: number[]) =>
    makeApiCall<{ appliedCount: number; appliedIds?: number[]; message?: string }>(
      `${API_URL}/api/career/matches/batch-apply`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, matchIds }), timeoutMs: 30_000 }
    ),
  updateCandidateProfile: (userId: string, profile: { roles?: string; experience?: string; resumeName?: string }) =>
    makeApiCall<{ updated: boolean; roles?: string; experience?: string; resumeName?: string }>(
      `${API_URL}/api/setup/profile`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, ...profile }), timeoutMs: 30_000 }
    ),
  updateWorkflowStatus: (userId: string, status: 'active' | 'paused') => makeApiCall<{ updated: boolean; status: 'active' | 'paused'; changed: boolean }>(`${API_URL}/api/career/workflow/${userId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }), timeoutMs: 30_000 }),
  updateMatchStatus: (userId: string, matchId: number, status: 'applied' | 'review_required' | 'interview' | 'failed') => makeApiCall<{ updated: boolean }>(`${API_URL}/api/career/matches/${matchId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, status }), timeoutMs: 30_000 }),
}

export const mapDashboardApplication = (match: Awaited<ReturnType<typeof setupApi.getDashboard>>['matches'][number]): TrackedApplication => ({
  id: match.id, company: match.company, role: match.title, score: match.match_score,
  source: match.source, sourceUrl: match.source_url, status: match.status === 'review_required' ? 'Review required' : match.status === 'applied' ? 'Applied' : match.status === 'interview' ? 'Interview' : 'Failed',
  contactEmail: match.contact_email, contactStatus: match.contact_status,
  updatedAt: new Date(match.updated_at).toLocaleString(),
})
