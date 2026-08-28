export const AUTOMATION_STEPS = [
  { id: 'profile', label: 'Load profile', detail: 'Skills and preferences' },
  { id: 'discover', label: 'Find jobs', detail: 'Approved sources' },
  { id: 'dedupe', label: 'Remove duplicates', detail: 'Company + role + source' },
  { id: 'match', label: 'AI match', detail: 'Rules before AI scoring' },
  { id: 'review', label: 'Review queue', detail: 'User approval required' },
  { id: 'track', label: 'Track & notify', detail: 'Status and daily summary' },
] as const

export const RUN_LOGS = [
  ['08:00', 'Automation started', 'success'],
  ['08:01', 'Profile and preferences loaded', 'success'],
  ['08:02', '87 jobs found across approved sources', 'success'],
  ['08:03', '21 duplicate or previously applied jobs removed', 'success'],
  ['08:04', '43 jobs met the minimum match score', 'success'],
  ['08:05', '12 jobs added to your review queue', 'active'],
  ['08:06', 'Daily summary prepared', 'pending'],
] as const
