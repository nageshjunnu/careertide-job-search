import { APP_CONFIG } from '../../config/app.config'
import type { Job, RemotiveJob, SearchCriteria } from '../../types/job'
import { makeApiCall } from './client'

type RemotiveResponse = { jobs?: RemotiveJob[] }

const relativeDate = (dateValue: string) => {
  const days = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 86_400_000))
  if (!Number.isFinite(days) || days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return `${Math.round(days / 30)} month ago`
}

export const experienceLabel = (experience: string) => ({
  '0-1': '0 - 1 years',
  '0-3': '0 - 3 years',
  '3-6': '3 - 6 years',
  '6+': '6+ years',
}[experience] ?? 'Any experience')

export async function getRemoteJobs(criteria: SearchCriteria, signal?: AbortSignal): Promise<Job[]> {
  const url = new URL(APP_CONFIG.api.remotiveBaseUrl)
  url.searchParams.set('search', criteria.query.trim())
  const data = await makeApiCall<RemotiveResponse>(url.toString(), {
    signal,
    timeoutMs: APP_CONFIG.api.timeoutMs,
  })
  const tokens = criteria.query.toLowerCase().split(/[\s,]+/).filter((token) => token.length > 1)

  return (data.jobs ?? [])
    .filter((job) => !tokens.length || tokens.some((token) =>
      `${job.title} ${job.company_name} ${(job.tags ?? []).join(' ')}`.toLowerCase().includes(token),
    ))
    .slice(0, APP_CONFIG.api.maxRemoteResults)
    .map((job) => ({
      id: `remotive-${job.id}`,
      title: job.title,
      company: job.company_name,
      companyLogo: job.company_logo ?? '',
      location: job.candidate_required_location || 'Remote',
      experience: experienceLabel(criteria.experience),
      salary: job.salary || 'Not disclosed',
      posted: relativeDate(job.publication_date),
      employmentType: job.job_type || 'Remote',
      source: 'Remotive',
      sourceUrl: job.url,
      tags: (job.tags ?? []).slice(0, 5),
      remote: true,
    }))
}
