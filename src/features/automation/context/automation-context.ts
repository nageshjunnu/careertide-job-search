import { createContext } from 'react'
import type { AutomationSettings, AutomationStatus } from '../types/automation'
import type { TrackedApplication } from '../types/automation'

export type AutomationContextValue = {
  status: AutomationStatus
  toggleStatus: () => Promise<void>
  statusChanging: boolean
  depositVerified: boolean
  verifyDeposit: () => void
  settings: AutomationSettings
  updateSettings: (settings: Partial<AutomationSettings>) => void
  saveSettings: () => Promise<void>
  settingsSaving: boolean
  applications: TrackedApplication[]
  metrics: { discovered: number; matched: number; applied: number; interviews: number }
  runs: Array<{ id: number; status: string; discovered: number; matched: number; error: string | null; startedAt: string }>
  runProgress: { running: boolean; status: string; stage: string; percent: number } | null
  sourceWorkflows: Array<{ source: string; status: string; detail: string; permissionStatus: string; requestedAt: string | null }>
  lastRefreshed: Date | null
  refreshDashboard: () => Promise<void>
  markApplied: (matchId: number) => Promise<void>
  applyToMatch: (matchId: number) => Promise<void>
  batchApplyMatches: (matchIds?: number[]) => Promise<void>
  triggerSearchRun: () => Promise<void>
  requestPlatformIntegration: (source: string) => Promise<void>
  authorizePlatformIntegration: (source: string, payload?: { scopes?: string[]; accountIdentifier?: string; accessToken?: string }) => Promise<void>
  serverUserId: string
  userName: string
}

export const AutomationContext = createContext<AutomationContextValue | null>(null)
