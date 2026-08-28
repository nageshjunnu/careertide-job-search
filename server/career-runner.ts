import { database } from './database.js'
import { sendStepEmail } from './email.js'

type RemoteJob = { id: number; title: string; company_name: string; candidate_required_location: string; url: string; tags?: string[]; description?: string; publication_date: string }
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const emailFromDescription = (description?: string) => description?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null

export async function runGuidedSearch(userId: string) {
  const configuration = await database.query<{
    roles: string; skills: string; locations: string; minimum_score: number; daily_limit: number;
    sources: string[]; email: string; full_name: string; email_notifications: boolean;
  }>(`SELECT p.roles,p.skills,p.locations,w.minimum_score,w.daily_limit,w.sources,u.email,u.full_name,COALESCE(n.email_notifications,true) email_notifications
      FROM users u JOIN career_profiles p ON p.user_id=u.id JOIN career_workflows w ON w.user_id=u.id
      LEFT JOIN notification_preferences n ON n.user_id=u.id WHERE u.id=$1 AND w.status IN ('configured','active')`, [userId])
  const config = configuration.rows[0]
  if (!config) throw new Error('A completed profile and search workflow are required.')
  const query = config.roles.split(',')[0]?.trim() || config.skills.split(',')[0]?.trim() || 'developer'
  // Remotive is currently the only selected source with a permitted public discovery feed.
  // Other sources are retained as separate review workflows and never scraped or falsely marked applied.
  const payload = config.sources.includes('Remotive')
    ? await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`).then(async (response) => {
      if (!response.ok) throw new Error(`Remotive returned ${response.status}`)
      return response.json() as Promise<{ jobs?: RemoteJob[] }>
    })
    : { jobs: [] }
  const tokens = `${config.roles},${config.skills}`.toLowerCase().split(/[\s,]+/).filter((item) => item.length > 2)
  let matched = 0
  let discovered = 0
  for (const job of (payload.jobs ?? []).slice(0, 50)) {
    const searchable = `${job.title} ${job.company_name} ${(job.tags ?? []).join(' ')}`.toLowerCase()
    const hits = tokens.filter((token) => searchable.includes(token)).length
    const score = Math.min(98, Math.round(55 + (hits / Math.max(tokens.length, 1)) * 43))
    const inserted = await database.query<{ id: number }>(`INSERT INTO discovered_jobs (source,external_id,title,company,location,source_url,published_at,raw_data)
      VALUES ('Remotive',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source,external_id) DO UPDATE SET raw_data=$7 RETURNING id`,
      [String(job.id), job.title, job.company_name, job.candidate_required_location, job.url, job.publication_date, JSON.stringify(job)])
    discovered += 1
    if (score >= config.minimum_score) {
      await database.query(`INSERT INTO job_matches (user_id,job_id,match_score,status) VALUES ($1,$2,$3,'review_required') ON CONFLICT(user_id,job_id) DO UPDATE SET match_score=$3,updated_at=NOW()`, [userId, inserted.rows[0].id, score])
      const contactEmail = emailFromDescription(job.description)
      await database.query(`INSERT INTO job_contact_checks (user_id,job_id,contact_email,status,checked_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT(user_id,job_id) DO UPDATE SET contact_email=$3,status=$4,checked_at=NOW(),updated_at=NOW()`, [userId, inserted.rows[0].id, contactEmail, contactEmail ? 'email_found_requires_approval' : 'no_public_email_found'])
      matched += 1
      if (matched >= config.daily_limit) break
    }
  }
  const run = await database.query<{ id: number }>(`INSERT INTO career_runs (user_id,status,jobs_discovered,jobs_matched,finished_at) VALUES ($1,'completed',$2,$3,NOW()) RETURNING id`, [userId, discovered, matched])
  await database.query(`UPDATE career_workflows SET status='active',last_run_at=NOW() WHERE user_id=$1`, [userId])
  await database.query(`UPDATE source_workflows SET last_checked_at=NOW() WHERE user_id=$1 AND source = ANY($2::text[])`, [userId, config.sources])
  if (config.email_notifications) {
    const links = await database.query<{ title: string; company: string; source_url: string; match_score: number }>(`SELECT j.title,j.company,j.source_url,m.match_score FROM job_matches m JOIN discovered_jobs j ON j.id=m.job_id WHERE m.user_id=$1 AND m.status='review_required' ORDER BY m.updated_at DESC LIMIT $2`, [userId, Math.max(matched, 1)])
    const linkList = links.rows.length
      ? `<div style="margin-top:14px"><strong>Matches ready for your review:</strong>${links.rows.map((job) => `<div style="margin:10px 0;padding:10px;border:1px solid #dbe4ee;border-radius:8px"><strong>${escapeHtml(job.title)}</strong> · ${escapeHtml(job.company)} · ${job.match_score}%<br><a href="${escapeHtml(job.source_url)}" style="color:#0f766e">Review and apply on source →</a></div>`).join('')}</div>`
      : '<p>No jobs reached your match threshold in this run.</p>'
    const manualSources = config.sources.filter((source) => source !== 'Remotive')
    const sourceNote = manualSources.length ? `<br><br><strong>Separate source workflows:</strong> ${manualSources.map(escapeHtml).join(', ')} are saved as review-only workflows. No jobs are scraped and no application is submitted on these platforms without their authorised integration.` : ''
    await sendStepEmail(userId, config.email, config.full_name, 'Job search run', `<strong>Jobs checked:</strong> ${discovered}<br><strong>Matches saved:</strong> ${matched}<br><strong>Applications genuinely submitted:</strong> 0<br><br>No application was submitted automatically because the connected source provides discovery links, not an authorized submission API.${sourceNote}${linkList}`)
  }
  return { runId: run.rows[0].id, discovered, matched, applicationsSubmitted: 0, mode: 'discovery_and_human_review' }
}
