import { useCallback, useEffect, useState } from 'react'
import { createInitialRecord } from '../config/onboarding.config'
import { clearOnboardingRecord, getOnboardingRecord, saveOnboardingRecord } from '../services/automation.database'
import type { OnboardingData, OnboardingRecord } from '../types/onboarding'

export function useOnboardingRecord() {
  const [record, setRecord] = useState<OnboardingRecord>(createInitialRecord)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getOnboardingRecord().then((saved) => saved && setRecord(saved)).finally(() => setLoading(false))
  }, [])

  const persist = useCallback(async (next: OnboardingRecord) => {
    setSaving(true)
    setRecord(next)
    await saveOnboardingRecord(next)
    setSaving(false)
  }, [])

  const updateData = (data: Partial<OnboardingData>) => setRecord((current) => ({ ...current, data: { ...current.data, ...data } }))
  const saveProgress = (currentStep: number, changes: Partial<OnboardingRecord> = {}) => persist({ ...record, ...changes, currentStep, updatedAt: new Date().toISOString() })
  const reset = async () => { await clearOnboardingRecord(); setRecord(createInitialRecord()) }

  return { record, loading, saving, updateData, saveProgress, reset }
}
