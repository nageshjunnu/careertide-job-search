export type Job = {
  id: string
  title: string
  company: string
  companyLogo: string
  location: string
  experience: string
  salary: string
  posted: string
  employmentType: string
  source: string
  sourceUrl: string
  tags: string[]
  remote: boolean
}

export type RemotiveJob = {
  id: number
  title: string
  company_name: string
  company_logo?: string
  candidate_required_location: string
  publication_date: string
  job_type: string
  url: string
  tags?: string[]
  salary?: string
}

export type SearchCriteria = {
  query: string
  location: string
  experience: string
}

export type Page = 'home' | 'jobs' | 'automation' | 'companies' | 'sources' | 'workflows'
