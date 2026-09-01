import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import { database } from './database.js'
import { runGuidedSearch } from './career-runner.js'

export async function runScheduledSearches() {
  // Atomically claim due workflows so multiple API processes cannot run the same user twice.
  const due = await database.query<{ user_id: string }>(`UPDATE career_workflows SET last_run_at=NOW() WHERE user_id IN (SELECT user_id FROM career_workflows
      WHERE status IN ('configured','active')
      -- Run at the configured minute, or catch up later if the API was offline at that minute.
      AND to_char(NOW() AT TIME ZONE timezone,'HH24:MI')>=schedule
      AND (last_run_at IS NULL OR (last_run_at AT TIME ZONE timezone)::date < (NOW() AT TIME ZONE timezone)::date))
      AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '30 seconds') RETURNING user_id`)
  for (const workflow of due.rows) {
    try { await runGuidedSearch(workflow.user_id) } catch (error) {
      console.error('Scheduled guided search failed:', error)
    }
  }
  return { claimed: due.rows.length }
}

const scheduledTasks = new Map<number, ScheduledTask>()

export async function refreshJobSchedules() {
  const schedules = await database.query<{ id: number; cron_expression: string; active: boolean }>(`SELECT id,cron_expression,active FROM job_run_schedules`)
  const activeIds = new Set(schedules.rows.filter((item) => item.active).map((item) => item.id))
  for (const [id, task] of scheduledTasks) if (!activeIds.has(id)) { task.stop(); scheduledTasks.delete(id) }
  for (const schedule of schedules.rows) {
    if (!schedule.active || scheduledTasks.has(schedule.id) || !cron.validate(schedule.cron_expression)) continue
    scheduledTasks.set(schedule.id, cron.schedule(schedule.cron_expression, () => {
      void runScheduledSearches().catch((error) => console.error('Scheduled job run failed:', error))
    }))
  }
}

export function startCareerScheduler() {
  void refreshJobSchedules().catch((error) => console.error('Could not load cron schedules:', error))
}
