import cron from 'node-cron'
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

export function startCareerScheduler() {
  return cron.schedule('* * * * *', () => {
    void runScheduledSearches().catch((error) => console.error('Scheduler tick failed:', error))
  })
}
