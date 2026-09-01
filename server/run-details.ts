import { database } from './database.js'

export async function getRunDetails(runId: string) {
  const runRes = await database.query(`SELECT id, user_id, started_at, finished_at FROM career_runs WHERE id = $1`, [runId]);
  if (!runRes.rows.length) throw new Error('Run not found');
  const run = runRes.rows[0];

  const jobsRes = await database.query(`
    SELECT m.status as match_status, m.updated_at, j.title, j.company, j.source
    FROM job_matches m
    JOIN discovered_jobs j ON j.id = m.job_id
    WHERE m.user_id = $1 AND m.status IN ('applied', 'review_required', 'rejected')
    ORDER BY m.updated_at DESC
    LIMIT 50
  `, [run.user_id]);

  const emailsRes = await database.query(`
    SELECT status, count(*) as count
    FROM email_logs
    WHERE user_id = $1 AND step = 'recruiter_application_email'
    GROUP BY status
  `, [run.user_id]);

  return {
    runId: run.id,
    userId: run.user_id,
    jobs: jobsRes.rows,
    emails: emailsRes.rows
  };
}
