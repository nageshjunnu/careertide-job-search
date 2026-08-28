import { useContext } from 'react'
import { AutomationContext } from './automation-context'

export function useAutomation() {
  const context = useContext(AutomationContext)
  if (!context) throw new Error('useAutomation must be used within AutomationProvider')
  return context
}
