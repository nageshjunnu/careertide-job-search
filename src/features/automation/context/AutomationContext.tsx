import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AutomationSettings, AutomationStatus } from '../types/automation'
import { AutomationContext } from './automation-context'
import { getOnboardingRecord, saveOnboardingRecord } from '../services/automation.database'
import { mapDashboardApplication, setupApi } from '../services/setup.api'
import type { TrackedApplication } from '../types/automation'

export function AutomationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AutomationStatus>('active')
  const [depositVerified, setDepositVerified] = useState(false)
  const [userName, setUserName] = useState('Job seeker')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [applications, setApplications] = useState<TrackedApplication[]>([])
  const [metrics, setMetrics] = useState({ discovered: 0, matched: 0, applied: 0, interviews: 0 })
  const [runs, setRuns] = useState<Array<{ id: number; status: string; discovered: number; matched: number; error: string | null; startedAt: string; email: string }>>([])
  const [runProgress, setRunProgress] = useState<{ running: boolean; status: string; stage: string; percent: number } | null>(null)
  const [sourceWorkflows, setSourceWorkflows] = useState<Array<{ source: string; status: string; detail: string; permissionStatus: string; requestedAt: string | null }>>([])
  const [serverUserId, setServerUserId] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [settings, setSettings] = useState<AutomationSettings>({
    schedule: '08:00', timezone: 'Asia/Kolkata', dailyLimit: 25, minimumScore: 80,
    locations: ['India', 'Remote'], reviewRequired: true,
  })
  useEffect(() => {
    getOnboardingRecord().then((record) => {
      if (!record?.completed) return
      setUserName(record.data.fullName || 'Job seeker')
      setDepositVerified(Boolean(record.data.paymentId))
      setSettings({
        schedule: record.data.schedule,
        timezone: record.data.timezone,
        dailyLimit: record.data.dailyLimit,
        minimumScore: record.data.minimumScore,
        locations: record.data.locations.split(',').map((item) => item.trim()).filter(Boolean),
        reviewRequired: record.data.reviewRequired,
      })
      if (record.serverUserId) setServerUserId(record.serverUserId)
    })
  }, [])
  const refreshDashboard = useCallback(async () => {
    if (!serverUserId) return
    const dashboard = await setupApi.getDashboard(serverUserId)
    setApplications(dashboard.matches.map(mapDashboardApplication))
    setMetrics({ discovered: dashboard.latestRun?.jobs_discovered ?? 0, matched: dashboard.latestRun?.jobs_matched ?? 0, applied: dashboard.applicationsSubmitted, interviews: dashboard.interviews })
    setRunProgress((current) => {
      if (dashboard.latestRun?.status === 'running') return { running: true, status: 'running', stage: dashboard.latestRun.progress_stage || 'Preparing your saved rules', percent: dashboard.latestRun.progress_percent }
      if (current?.running && dashboard.latestRun?.status === 'completed') return { running: false, status: 'completed', stage: dashboard.latestRun.progress_stage || 'Career intelligence pipeline updated', percent: 100 }
      if (dashboard.latestRun?.status === 'completed' && dashboard.latestRun.finished_at && Date.now() - new Date(dashboard.latestRun.finished_at).getTime() < 8_000) return { running: false, status: 'completed', stage: dashboard.latestRun.progress_stage || 'Career intelligence pipeline updated', percent: 100 }
      return null
    })
    setRuns(dashboard.runs.map((run) => ({ id: run.id, status: run.status, discovered: run.jobs_discovered, matched: run.jobs_matched, error: run.error_message, startedAt: run.started_at, email: run.email })))
    setSourceWorkflows(dashboard.sourceWorkflows.map((source) => ({ source: source.source, status: source.status, detail: source.detail, permissionStatus: source.permission_status, requestedAt: source.requested_at })))
    setStatus(dashboard.workflowStatus === 'paused' ? 'paused' : 'active')
    setLastRefreshed(new Date())
  }, [serverUserId])
  useEffect(() => {
    if (!serverUserId) return
    const initialTimer = window.setTimeout(() => void refreshDashboard(), 0)
    const timer = window.setInterval(() => void refreshDashboard(), 2_000)
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer) }
  }, [serverUserId, refreshDashboard])
  useEffect(() => {
    if (runProgress?.status !== 'completed') return
    const timer = window.setTimeout(() => setRunProgress(null), 2_500)
    return () => window.clearTimeout(timer)
  }, [runProgress])
  const toggleStatus = async () => {
    if (!serverUserId || statusChanging) return
    const nextStatus = status === 'active' ? 'paused' : 'active'
    setStatusChanging(true)
    try {
      const result = await setupApi.updateWorkflowStatus(serverUserId, nextStatus)
      setStatus(result.status)
      await refreshDashboard()
    } finally { setStatusChanging(false) }
  }
  const updateSettings = (next: Partial<AutomationSettings>) => setSettings((current) => ({ ...current, ...next }))
  const saveSettings = async () => {
    setSettingsSaving(true)
    try {
      const record = await getOnboardingRecord()
      if (!record?.serverUserId) throw new Error('Server user is missing')
      const data = { ...record.data, schedule: settings.schedule, timezone: settings.timezone, dailyLimit: settings.dailyLimit, minimumScore: settings.minimumScore, locations: settings.locations.join(', ') }
      await setupApi.saveDashboardSettings(record.serverUserId, { schedule: settings.schedule, timezone: settings.timezone, dailyLimit: settings.dailyLimit, minimumScore: settings.minimumScore, locations: settings.locations })
      await saveOnboardingRecord({ ...record, data, syncedSteps: { ...record.syncedSteps, automation: JSON.stringify({ schedule: data.schedule, timezone: data.timezone, sources: data.sources, minimumScore: data.minimumScore, dailyLimit: data.dailyLimit }) }, updatedAt: new Date().toISOString() })
    } finally { setSettingsSaving(false) }
  }
  const markApplied = async (matchId: number) => {
    if (!serverUserId) throw new Error('Server user is missing')
    await setupApi.updateMatchStatus(serverUserId, matchId, 'applied')
    await refreshDashboard()
  }
  const applyToMatch = async (matchId: number) => {
    if (!serverUserId) throw new Error('Server user is missing')
    await setupApi.applyToMatch(serverUserId, matchId)
    await refreshDashboard()
  }
  const batchApplyMatches = async (matchIds?: number[]) => {
    if (!serverUserId) throw new Error('Server user is missing')
    await setupApi.batchApplyMatches(serverUserId, matchIds)
    await refreshDashboard()
  }
  const triggerSearchRun = async () => {
    if (!serverUserId) throw new Error('Server user is missing')
    await setupApi.runGuidedSearch(serverUserId)
    await refreshDashboard()
  }
  const requestPlatformIntegration = async (source: string) => {
    if (!serverUserId) throw new Error('Server user is missing')
    await setupApi.requestPlatformIntegration(serverUserId, source)
    await refreshDashboard()
  }
  const authorizePlatformIntegration = async (source: string, payload?: { scopes?: string[]; accountIdentifier?: string; accessToken?: string }) => {
    if (!serverUserId) throw new Error('Server user is missing')
    await setupApi.authorizePlatformIntegration(serverUserId, source, payload)
    await refreshDashboard()
  }
  const updateSourceStatus = async (source: string, enabled: boolean) => { if (!serverUserId) throw new Error('Server user is missing'); await setupApi.updateSourceStatus(serverUserId, source, enabled); await refreshDashboard() }
  const value = {
    status,
    toggleStatus,
    statusChanging,
    depositVerified,
    verifyDeposit: () => setDepositVerified(true),
    settings,
    updateSettings,
    saveSettings,
    settingsSaving,
    applications,
    metrics,
    runs,
    runProgress,
    sourceWorkflows,
    lastRefreshed,
    refreshDashboard,
    markApplied,
    applyToMatch,
    batchApplyMatches,
    triggerSearchRun,
    requestPlatformIntegration,
    authorizePlatformIntegration,
    updateSourceStatus,
    serverUserId,
    userName,
  }
  return <AutomationContext.Provider value={value}>{children}</AutomationContext.Provider>
}
