import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

type Page = 'home' | 'jobs' | 'companies' | 'sources' | 'workflows'

const pagePaths: Record<Page, string> = {
  home: '/',
  jobs: '/jobs',
  companies: '/companies',
  sources: '/sources',
  workflows: '/workflows',
}

type Job = {
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

type RemotiveJob = {
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

type WaveRipple = {
  id: number
  x: number
  y: number
  size: number
}

const sourceSearchLinks = [
  ['Naukri', 'https://www.naukri.com/{q}-jobs-in-{l}', 'India job board'],
  ['LinkedIn', 'https://www.linkedin.com/jobs/search/?keywords={query}&location={location}', 'Professional network'],
  ['Google Jobs', 'https://www.google.com/search?q={query}%20jobs%20in%20{location}&ibp=htl;jobs', 'Cross-platform search'],
  ['Indeed', 'https://www.indeed.com/jobs?q={query}&l={location}', 'Global aggregator'],
  ['Foundit', 'https://www.foundit.in/srp/results?query={query}&locations={location}', 'India/APAC jobs'],
  ['Instahyre', 'https://www.instahyre.com/search-jobs/?q={query}&location={location}', 'Startup hiring'],
  ['Wellfound', 'https://wellfound.com/jobs?keyword={query}&location={location}', 'Startup jobs'],
  ['Glassdoor', 'https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword={query}&locKeyword={location}', 'Reviews and salary signals'],
  ['Cutshort', 'https://cutshort.io/jobs/{q}-jobs-in-{l}', 'Tech hiring'],
  ['TimesJobs', 'https://www.timesjobs.com/candidate/job-search.html?searchType=personalizedSearch&txtKeywords={query}&txtLocation={location}', 'Indian job board'],
  ['Shine', 'https://www.shine.com/job-search/{q}-jobs-in-{l}', 'Broad Indian hiring'],
  ['Remote OK', 'https://remoteok.com/remote-{q}-jobs', 'Remote jobs board'],
  ['Remotive', 'https://remotive.com/remote-jobs/search?search={query}', 'Remote API source'],
]

const categories = [
  ['Software', 'Java, Python, .NET, Node, full-stack roles', '1856'],
  ['Cloud & DevOps', 'AWS, Azure, Docker, Kubernetes roles', '1248'],
  ['AI & Data', 'AI, data science, ML, analytics roles', '842'],
  ['Frontend', 'React, Angular, Vue, TypeScript jobs', '1240'],
  ['Cybersecurity', 'SOC, cloud security, IAM, analyst roles', '496'],
  ['Fresher', 'Entry-level and 0-3 year opportunities', '730'],
]

const quickSearches = [
  'Java Developer',
  'Python Developer',
  'AWS DevOps Engineer',
  'HR Recruiter',
  'Talent Acquisition',
  'Data Analyst',
  'Sales Executive',
  'Digital Marketing',
  'MERN Stack Developer',
  'Cybersecurity Analyst',
  'Fresher Software Developer',
]

const companyShortcuts = [
  'Google',
  'Microsoft',
  'Amazon',
  'TCS',
  'Infosys',
  'Accenture',
  'Deloitte',
  'Zoho',
]

const workflowTemplates = [
  {
    name: 'Daily Multi-Source Job Discovery',
    platform: 'n8n / Make / Zapier',
    description: 'Runs every morning, builds source search URLs, stores matches, and sends a summary.',
    json: {
      workflowName: 'careertide_daily_discovery',
      schedule: '0 8 * * *',
      inputs: {
        keywords: ['Java Developer', 'Python Developer', 'AWS DevOps Engineer'],
        location: 'Hyderabad',
        experience: '0-3',
        sources: ['Naukri', 'LinkedIn', 'Google Jobs', 'Indeed', 'Foundit', 'Instahyre', 'Wellfound'],
      },
      steps: [
        { id: 'build_source_links', action: 'generate_search_urls' },
        { id: 'fetch_public_feeds', action: 'call_allowed_public_apis', sources: ['Remotive'] },
        { id: 'dedupe', action: 'remove_duplicate_titles_and_companies' },
        { id: 'score', action: 'rank_by_keyword_location_experience' },
        { id: 'notify', action: 'send_email_or_slack_summary' },
      ],
      output: 'daily_job_shortlist',
    },
  },
  {
    name: 'One-Click Apply Queue',
    platform: 'n8n / Airtable / Google Sheets',
    description: 'Creates a review queue for up to 100 jobs. User approves before opening/applying.',
    json: {
      workflowName: 'careertide_apply_queue',
      safetyMode: 'manual_review_required',
      dailyLimit: 100,
      inputs: {
        resumeFile: 'resume.pdf',
        coverLetterTemplate: 'cover_letter.md',
        preferredSources: ['LinkedIn', 'Naukri', 'Indeed', 'Google Jobs'],
      },
      steps: [
        { id: 'collect_jobs', action: 'import_shortlisted_jobs' },
        { id: 'prepare_application', action: 'prefill_resume_cover_letter_notes' },
        { id: 'human_check', action: 'wait_for_user_approval' },
        { id: 'open_source', action: 'open_original_apply_url' },
        { id: 'track_status', action: 'save_status_applied_or_skipped' },
      ],
      output: 'application_tracker',
    },
  },
  {
    name: 'Recruiter Follow-Up Tracker',
    platform: 'n8n / CRM / Sheets',
    description: 'Tracks applied jobs, reminds follow-ups, and stores interview status.',
    json: {
      workflowName: 'careertide_followup_tracker',
      trigger: 'when_application_status_changes',
      fields: ['company', 'role', 'source', 'applyUrl', 'appliedDate', 'status', 'nextFollowUpDate'],
      steps: [
        { id: 'save_application', action: 'append_to_tracker' },
        { id: 'schedule_followup', action: 'create_calendar_reminder_after_5_days' },
        { id: 'email_draft', action: 'draft_followup_email' },
        { id: 'dashboard', action: 'update_application_pipeline' },
      ],
      statuses: ['saved', 'applied', 'followed_up', 'interview', 'offer', 'rejected'],
    },
  },
  {
    name: 'Resume Match & Tailor',
    platform: 'n8n / OpenAI / Google Docs',
    description: 'Compares a job description with your resume and creates improvement notes before applying.',
    json: {
      workflowName: 'careertide_resume_match_tailor',
      usefulness: 'Helps users improve resume relevance for each role before applying.',
      inputs: {
        resumeText: '{{resume_text}}',
        jobTitle: '{{job_title}}',
        jobDescription: '{{job_description}}',
      },
      steps: [
        { id: 'extract_skills', action: 'identify_required_skills_from_job_description' },
        { id: 'compare_resume', action: 'compare_resume_against_required_skills' },
        { id: 'gap_report', action: 'generate_missing_keywords_and_project_suggestions' },
        { id: 'draft_resume_notes', action: 'create_resume_tailoring_notes' },
        { id: 'save_output', action: 'save_to_google_docs_or_notion' },
      ],
      output: 'resume_match_report',
    },
  },
  {
    name: 'Instant Job Alert Router',
    platform: 'n8n / Slack / Email / Telegram',
    description: 'Sends alerts only when a job matches role, location, experience, and source preferences.',
    json: {
      workflowName: 'careertide_instant_job_alerts',
      usefulness: 'Prevents noisy alerts and sends only strong job matches.',
      inputs: {
        keywords: ['Java', 'Python', 'AWS', 'Data Analyst'],
        locations: ['Hyderabad', 'Bengaluru', 'Remote'],
        minimumScore: 75,
      },
      steps: [
        { id: 'receive_jobs', action: 'read_new_jobs_from_tracker_or_api' },
        { id: 'score_match', action: 'calculate_keyword_location_experience_score' },
        { id: 'filter_noise', action: 'keep_jobs_above_minimum_score' },
        { id: 'route_alert', action: 'send_to_email_slack_or_telegram' },
      ],
      output: 'high_quality_job_alert',
    },
  },
  {
    name: 'Duplicate Job Cleaner',
    platform: 'n8n / Sheets / Airtable',
    description: 'Removes repeated jobs coming from multiple sources before users review them.',
    json: {
      workflowName: 'careertide_duplicate_cleaner',
      usefulness: 'Keeps job lists clean when the same role appears on Naukri, LinkedIn, Indeed, and Google.',
      duplicateKeys: ['normalizedTitle', 'company', 'location'],
      steps: [
        { id: 'normalize', action: 'lowercase_trim_and_remove_source_words' },
        { id: 'group', action: 'group_by_title_company_location' },
        { id: 'choose_best', action: 'prefer_direct_company_or_most_complete_source_url' },
        { id: 'archive_duplicates', action: 'move_duplicates_to_archive_sheet' },
      ],
      output: 'clean_job_shortlist',
    },
  },
  {
    name: 'Interview Prep Generator',
    platform: 'n8n / OpenAI / Notion',
    description: 'Creates interview questions and preparation notes from each saved job.',
    json: {
      workflowName: 'careertide_interview_prep',
      usefulness: 'Turns saved job descriptions into targeted interview preparation material.',
      inputs: {
        jobTitle: '{{job_title}}',
        company: '{{company}}',
        skills: '{{skills}}',
      },
      steps: [
        { id: 'create_questions', action: 'generate_role_specific_interview_questions' },
        { id: 'create_study_plan', action: 'generate_3_day_preparation_plan' },
        { id: 'company_research', action: 'summarize_company_and_product_notes' },
        { id: 'save_prep', action: 'save_to_notion_or_google_doc' },
      ],
      output: 'interview_prep_pack',
    },
  },
  {
    name: 'Salary & Source Comparison',
    platform: 'n8n / Sheets / Dashboard',
    description: 'Compares salary visibility and source quality across job boards.',
    json: {
      workflowName: 'careertide_salary_source_comparison',
      usefulness: 'Helps users prioritize sources that show better salary, response, and quality signals.',
      metrics: ['salaryAvailable', 'source', 'company', 'roleMatchScore', 'applyUrl'],
      steps: [
        { id: 'collect_metrics', action: 'read_jobs_from_tracker' },
        { id: 'group_by_source', action: 'calculate_source_quality_summary' },
        { id: 'rank_sources', action: 'rank_sources_by_salary_visibility_and_match_score' },
        { id: 'update_dashboard', action: 'write_summary_to_dashboard' },
      ],
      output: 'source_quality_report',
    },
  },
  {
    name: 'Weekly Career Progress Report',
    platform: 'n8n / Email / Google Sheets',
    description: 'Sends a weekly summary of saved, applied, skipped, interview, and follow-up jobs.',
    json: {
      workflowName: 'careertide_weekly_progress_report',
      usefulness: 'Gives users a clear view of job-search progress and next actions.',
      schedule: '0 18 * * 5',
      steps: [
        { id: 'read_tracker', action: 'read_application_tracker' },
        { id: 'count_statuses', action: 'count_jobs_by_status' },
        { id: 'find_overdue', action: 'find_followups_due_or_overdue' },
        { id: 'write_summary', action: 'generate_weekly_email_summary' },
        { id: 'send_report', action: 'send_email_to_user' },
      ],
      output: 'weekly_progress_email',
    },
  },
]

const workflowProcess = [
  ['1', 'Choose search rules', 'Set role keywords, locations, experience, preferred sources, and daily limits.'],
  ['2', 'Collect source links', 'Generate safe source URLs and fetch allowed public APIs where available.'],
  ['3', 'Rank and deduplicate', 'Remove repeated jobs, score by keyword match, and keep the strongest opportunities.'],
  ['4', 'Review before apply', 'User approves jobs before opening apply links or saving application notes.'],
  ['5', 'Track follow-ups', 'Store status, reminders, recruiter contacts, and next follow-up date.'],
]

const beginnerWorkflowSteps = [
  ['Start simple', 'Create one workflow for daily discovery first. Do not automate applying until tracking works.'],
  ['Pick a storage tool', 'Use Google Sheets, Airtable, Notion, or a database table to store role, company, source, URL, and status.'],
  ['Use safe sources', 'Use public APIs where allowed and generate official source search URLs for restricted boards.'],
  ['Add manual approval', 'Before apply/open actions, add a review step so the user confirms each job.'],
  ['Track every action', 'Save applied/skipped/follow-up status so duplicate applications are avoided.'],
]

const workflowSourceLinks = [
  ['n8n workflow import', 'https://docs.n8n.io/workflows/export-import/'],
  ['n8n HTTP Request node', 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/'],
  ['n8n Schedule Trigger', 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/'],
  ['Make scenarios', 'https://www.make.com/en/help/scenarios'],
  ['Zapier Zaps', 'https://help.zapier.com/hc/en-us/articles/8496292046093-Create-Zaps'],
  ['Remotive public jobs API', 'https://remotive.com/remote-jobs/api'],
]

const workflowTutorials = [
  {
    title: 'Use JSON in n8n',
    duration: '2 min',
    steps: ['Copy JSON from a workflow card', 'Open n8n Workflows', 'Import or recreate nodes', 'Paste values into Schedule, HTTP, and Sheets nodes', 'Run once manually'],
  },
  {
    title: 'Adapt JSON for Make or Zapier',
    duration: '3 min',
    steps: ['Create a new scenario/Zap', 'Use the JSON as your blueprint', 'Create one module per step', 'Map fields like role, company, sourceUrl, status', 'Test with 2 jobs first'],
  },
  {
    title: 'Connect job source links',
    duration: '2 min',
    steps: ['Use official source search URLs', 'Avoid scraping restricted pages', 'Fetch public APIs only when allowed', 'Store sourceUrl for each result', 'Open apply pages after user review'],
  },
]

const encode = (value: string) => encodeURIComponent(value.trim())
const slug = (value: string) => encode(value).replaceAll('%20', '-').replaceAll('%2C', '')

const buildSourceUrl = (source: string, query: string, location: string) => {
  const template = sourceSearchLinks.find(([name]) => name === source)?.[1] ?? sourceSearchLinks[0][1]
  return template
    .replaceAll('{query}', encode(query))
    .replaceAll('{location}', encode(location))
    .replaceAll('{q}', slug(query))
    .replaceAll('{l}', slug(location))
}

const initials = (company: string) =>
  company
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

const relativeDate = (dateValue: string) => {
  const days = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 86_400_000))
  if (!Number.isFinite(days) || days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return `${Math.round(days / 30)} month ago`
}

const sourceRedirectJobs = (query: string, location: string): Job[] => {
  const cleanQuery = query.trim() || 'Software Developer'
  const lower = cleanQuery.toLowerCase()
  const isAi = lower.includes('llm') || lower.includes('ai') || lower.includes('machine')
  const isReact = lower.includes('react') || lower.includes('frontend') || lower.includes('front-end')
  const isCloud = lower.includes('aws') || lower.includes('azure') || lower.includes('devops') || lower.includes('cloud')
  const isData = lower.includes('data') || lower.includes('analyst') || lower.includes('sql') || lower.includes('power bi')
  const isSecurity = lower.includes('security') || lower.includes('cyber') || lower.includes('soc')
  const isBackend = lower.includes('java') || lower.includes('python') || lower.includes('node') || lower.includes('.net')
  const isRecruiting = lower.includes('hr') || lower.includes('recruiter') || lower.includes('talent acquisition') || lower.includes(' ta ') || lower === 'ta'
  const isSales = lower.includes('sales') || lower.includes('business development') || lower.includes('bdm')
  const isMarketing = lower.includes('marketing') || lower.includes('seo') || lower.includes('digital marketing') || lower.includes('content')
  const isFinance = lower.includes('finance') || lower.includes('account') || lower.includes('payroll')
  const isOperations = lower.includes('operation') || lower.includes('admin') || lower.includes('coordinator')
  const isSupport = lower.includes('support') || lower.includes('customer') || lower.includes('bpo') || lower.includes('voice')
  const isDesign = lower.includes('design') || lower.includes('ui') || lower.includes('ux') || lower.includes('figma')
  const isProduct = lower.includes('product manager') || lower.includes('project manager') || lower.includes('scrum')
  const baseTitle = isCloud
    ? 'Cloud & DevOps Engineer'
    : isData
      ? 'Data Analytics Specialist'
      : isSecurity
        ? 'Cybersecurity Analyst'
        : isRecruiting
          ? 'HR & Talent Acquisition Specialist'
          : isSales
            ? 'Sales & Business Development Executive'
            : isMarketing
              ? 'Marketing & Growth Specialist'
              : isFinance
                ? 'Finance & Accounts Executive'
                : isOperations
                  ? 'Operations Coordinator'
                  : isSupport
                    ? 'Customer Support Specialist'
                    : isDesign
                      ? 'UI/UX Designer'
                      : isProduct
                        ? 'Product / Project Manager'
                        : isAi
                          ? 'AI / Machine Learning Engineer'
                          : isReact
                            ? 'Frontend Application Developer'
                            : isBackend
                              ? 'Backend Software Engineer'
                              : `${cleanQuery} Professional`
  const companies = [
    'Naukri Search Results',
    'LinkedIn Hiring Network',
    'Google Jobs Index',
    'Indeed Job Feed',
    'Foundit India Careers',
    'Instahyre Startup Desk',
    'Wellfound Startup Network',
    'Glassdoor Career Insights',
    'Cutshort Tech Hiring',
    'TimesJobs Listings',
    'Shine Job Search',
    'Remote OK Board',
    'Remotive Remote Feed',
  ]

  return sourceSearchLinks.map(([source], index) => ({
    id: `source-${source}`,
    title: baseTitle,
    company: companies[index],
    companyLogo: '',
    location: source.includes('Remote') || source === 'Remote OK' ? 'Remote' : location || 'Hyderabad',
    experience: index < 2 ? '0 - 3 years' : index < 4 ? '1 - 4 years' : '3 - 6 years',
    salary: index % 2 === 0 ? '₹3L - ₹9L' : 'Not disclosed',
    posted: index < 3 ? 'Today' : `${index} days ago`,
    employmentType: source.includes('Remote') || source === 'Remote OK' ? 'Remote' : index % 2 === 0 ? 'Full Time' : 'Hybrid',
    source,
    sourceUrl: buildSourceUrl(source, cleanQuery, location || 'Hyderabad'),
    tags: cleanQuery
      .split(/[\s,]+/)
      .filter(Boolean)
      .concat(isCloud ? ['AWS', 'DevOps'] : [])
      .concat(isData ? ['SQL', 'Analytics'] : [])
      .concat(isSecurity ? ['Security', 'SOC'] : [])
      .concat(isRecruiting ? ['HR', 'Recruiting', 'Talent Acquisition'] : [])
      .concat(isSales ? ['Sales', 'BD'] : [])
      .concat(isMarketing ? ['Marketing', 'SEO'] : [])
      .concat(isFinance ? ['Finance', 'Accounts'] : [])
      .concat(isOperations ? ['Operations', 'Admin'] : [])
      .concat(isSupport ? ['Support', 'Customer Success'] : [])
      .concat(isDesign ? ['UI/UX', 'Design'] : [])
      .concat(isProduct ? ['Product', 'Project'] : [])
      .concat(isReact ? ['Frontend', 'TypeScript'] : [])
      .concat(isAi ? ['AI', 'Machine Learning'] : [])
      .concat(!isCloud && !isData && !isSecurity && !isRecruiting && !isSales && !isMarketing && !isFinance && !isOperations && !isSupport && !isDesign && !isProduct && !isReact && !isAi ? ['Jobs', 'Career'] : [])
      .slice(0, 5),
    remote: source.includes('Remote') || source === 'Remote OK',
  }))
}

function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  )
}

function RoutedApp() {
  const navigate = useNavigate()
  const [waves, setWaves] = useState<WaveRipple[]>([])
  const [query, setQuery] = useState('Java Python AWS')
  const [location, setLocation] = useState('Hyderabad Secunderabad')
  const [experience, setExperience] = useState('0-3')
  const [sourceFilter, setSourceFilter] = useState('All')
  const [jobType, setJobType] = useState('All')
  const [jobs, setJobs] = useState<Job[]>(sourceRedirectJobs('Java Python AWS', 'Hyderabad Secunderabad'))
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Showing source-matched fallback jobs. Search loads third-party remote jobs.')
  const [lastSearch, setLastSearch] = useState('Java Python AWS · Hyderabad Secunderabad · 0-3 years')
  const [searchCount, setSearchCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    const loadJobs = async () => {
      setLoading(true)
      try {
        const response = await fetch(`https://remotive.com/api/remote-jobs?search=${encode(query)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Remote jobs API unavailable')
        const data = (await response.json()) as { jobs?: RemotiveJob[] }
        const queryTokens = query
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((token) => token.length > 1)
        const remoteJobs = (data.jobs ?? [])
          .filter((job) => {
            if (!queryTokens.length) return true
            const searchable = `${job.title} ${job.company_name} ${(job.tags ?? []).join(' ')}`.toLowerCase()
            return queryTokens.some((token) => searchable.includes(token))
          })
          .slice(0, 16)
          .map((job): Job => ({
          id: `remotive-${job.id}`,
          title: job.title,
          company: job.company_name,
          companyLogo: job.company_logo ?? '',
          location: job.candidate_required_location || 'Remote',
          experience,
          salary: job.salary || 'Not disclosed',
          posted: relativeDate(job.publication_date),
          employmentType: job.job_type || 'Remote',
          source: 'Remotive',
          sourceUrl: job.url,
          tags: (job.tags ?? []).slice(0, 5),
          remote: true,
        }))
        setJobs([...sourceRedirectJobs(query, location), ...remoteJobs])
        setStatus(remoteJobs.length ? 'Showing all source redirects plus live third-party jobs from Remotive.' : 'Showing all source redirects for this search.')
      } catch {
        setJobs(sourceRedirectJobs(query, location))
        setStatus('Showing all source redirects. Third-party API could not be loaded.')
      } finally {
        setLoading(false)
      }
    }

    const timer = window.setTimeout(loadJobs, 350)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, location, experience])

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const sourceMatches = sourceFilter === 'All' || job.source === sourceFilter
        const typeMatches =
          jobType === 'All' ||
          job.employmentType.toLowerCase().includes(jobType.toLowerCase()) ||
          (jobType === 'Remote' && job.remote)
        return sourceMatches && typeMatches
      }),
    [jobs, sourceFilter, jobType],
  )

  const sourceOptions = ['All', ...Array.from(new Set(jobs.map((job) => job.source)))]
  const tags = Array.from(new Set(jobs.flatMap((job) => job.tags))).slice(0, 10)
  const runSearch = () => {
    setLastSearch(`${query || 'Any role'} · ${location || 'Any location'} · ${experience || 'Any experience'} years`)
    setSearchCount((count) => count + 1)
    setStatus('Search triggered. Refreshing matching jobs and source links...')
    navigate('/jobs')
  }

  const setPage = (page: Page) => navigate(pagePaths[page])
  const searchProps = { query, setQuery, location, setLocation, experience, setExperience, setPage, onSearch: runSearch, searchCount }

  const showWaveRipple = (event: PointerEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('button, a, [role="button"]')) return
    const createdAt = Date.now()
    const nextWaves = Array.from({ length: 3 }).map((_, index) => ({
      id: createdAt + index,
      x: event.clientX,
      y: event.clientY,
      size: 90 + index * 56,
    }))
    setWaves((current) => [...current, ...nextWaves])
    window.setTimeout(() => {
      setWaves((current) => current.filter((wave) => !nextWaves.some((nextWave) => nextWave.id === wave.id)))
    }, 1100)
  }

  return (
    <div className="app-frame" onPointerDown={showWaveRipple}>
      <div className="wave-layer" aria-hidden="true">
        {waves.map((wave) => (
          <span
            className="wave-ripple"
            key={wave.id}
            style={{
              left: wave.x,
              top: wave.y,
              ['--wave-size' as string]: `${wave.size}px`,
            }}
          />
        ))}
      </div>
      <header className="mini-top">
        <span>📍 Your Location: {location || 'Choose location'}</span>
        <span>🔔 One search. Multiple job sources.</span>
        <span>Candidate mode</span>
      </header>

      <nav className="navbar">
        <button className="brand" onClick={() => setPage('home')} type="button">
          <span className="brand-mark">CT</span>
          CareerTide
        </button>
        <div className="nav-links">
          {(['home', 'jobs', 'companies', 'sources', 'workflows'] as Page[]).map((item) => (
            <NavLink className={({ isActive }) => isActive ? 'active' : ''} end={item === 'home'} key={item} to={pagePaths[item]}>
              {item[0].toUpperCase() + item.slice(1)}
            </NavLink>
          ))}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<HomePage {...searchProps} jobs={jobs} filteredJobs={filteredJobs} loading={loading} status={status} lastSearch={lastSearch} />} />
        <Route path="/jobs" element={<JobsPage {...searchProps} filteredJobs={filteredJobs} jobs={jobs} loading={loading} status={status} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} sourceOptions={sourceOptions} jobType={jobType} setJobType={setJobType} tags={tags} lastSearch={lastSearch} searchCount={searchCount} />} />
        <Route path="/companies" element={<CompaniesPage jobs={jobs} />} />
        <Route path="/sources" element={<SourcesPage query={query} location={location} setQuery={setQuery} setPage={setPage} />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
      </Routes>

      <Footer />
    </div>
  )
}

function SearchBand({
  query,
  setQuery,
  location,
  setLocation,
  experience,
  setExperience,
  onSearch,
  searchCount,
}: {
  query: string
  setQuery: (value: string) => void
  location: string
  setLocation: (value: string) => void
  experience: string
  setExperience: (value: string) => void
  onSearch: () => void
  searchCount: number
}) {
  return (
    <section className="search-console">
      <div className="search-console-header">
        <span>⚡ Career Finder</span>
        <small>One search across trusted job platforms</small>
      </div>
      <div className="search-row">
        <label>
          <span>💼 Job / Skill</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Java, Python, AWS, Data Analyst, UI UX..." />
        </label>
        <label>
          <span>📍 Location</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Hyderabad, Bengaluru, Remote..." />
        </label>
        <label>
          <span>🎯 Experience</span>
          <select value={experience} onChange={(event) => setExperience(event.target.value)}>
            <option value="0-1">0 - 1 years</option>
            <option value="0-3">0 - 3 years</option>
            <option value="3-6">3 - 6 years</option>
            <option value="6+">More than 6 years</option>
          </select>
        </label>
        <button className="search-action" onClick={onSearch} type="button">
          <span>Explore Jobs</span>
          <em>→</em>
        </button>
      </div>
      <div className="search-proof" key={searchCount}>
        <span>✓ Ready to search all sources</span>
        {searchCount > 0 && <strong>Search #{searchCount} started</strong>}
      </div>
    </section>
  )
}

function HomePage(props: {
  query: string
  setQuery: (value: string) => void
  location: string
  setLocation: (value: string) => void
  experience: string
  setExperience: (value: string) => void
  setPage: (value: Page) => void
  onSearch: () => void
  searchCount: number
  jobs: Job[]
  filteredJobs: Job[]
  loading: boolean
  status: string
  lastSearch: string
}) {
  return (
    <main>
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Unified career discovery</p>
          <h1>Discover technology jobs across every trusted hiring platform</h1>
          <p>Search by skill, role, company, or location. Compare opportunities from multiple sources and continue applying on the original job board.</p>
          <SearchBand {...props} />
          <div className="popular">
            <strong>Popular Searches</strong>
            {quickSearches.map((item, index) => (
              <button type="button" key={item} onClick={() => props.setQuery(item)}>
                <span>{index === 0 ? 20 : 10 + index * 4}</span>
                {item}
              </button>
            ))}
          </div>
          <div className="source-chips">
            {sourceSearchLinks.slice(0, 8).map(([source]) => (
              <a href={buildSourceUrl(source, props.query, props.location)} target="_blank" rel="noreferrer" key={source}>
                {source}
              </a>
            ))}
          </div>
        </div>
        <div className="hero-card">
          <span>Top match</span>
          <h3>{props.filteredJobs[0]?.title ?? 'Search for jobs'}</h3>
          <p>{props.filteredJobs[0]?.company ?? 'Results appear here'} · {props.filteredJobs[0]?.source ?? 'Source'}</p>
          <button onClick={() => props.setPage('jobs')} type="button">View job list</button>
        </div>
      </section>

      <section className="page-shell">
        <div className="section-title centered">
          <strong>Browse by category</strong>
          <span>Choose a category and CareerTide will build relevant source searches</span>
        </div>
        <div className="category-grid">
          {categories.map(([name, text, count]) => (
            <button
              className="category-card"
              key={name}
              onClick={() => {
                props.setQuery(name === 'Software' ? 'React Developer' : name)
                props.setPage('jobs')
              }}
              type="button"
            >
              <span>{name.slice(0, 2).toUpperCase()}</span>
              <strong>{name}</strong>
              <em>{text}</em>
              <small>{count} jobs available</small>
            </button>
          ))}
        </div>

        <div className="section-title centered">
          <strong>Click company to search</strong>
          <span>Fast company shortcuts for users who already know where they want to apply</span>
        </div>
        <div className="company-shortcuts">
          {companyShortcuts.map((company) => (
            <button
              key={company}
              onClick={() => {
                props.setQuery(`${company} ${props.query}`)
                props.setPage('jobs')
              }}
              type="button"
            >
              <span>{initials(company)}</span>
              <strong>{company}</strong>
              <small>Search jobs</small>
            </button>
          ))}
        </div>

        <div className="section-title">
          <div>
            <strong>Jobs of the day</strong>
            <span>{props.loading ? 'Loading third-party jobs...' : props.status}</span>
          </div>
          <button onClick={() => props.setPage('jobs')} type="button">View all jobs</button>
        </div>
        <div className="home-jobs-grid">
          {props.filteredJobs.slice(0, 6).map((job) => <CompactJobCard job={job} key={job.id} />)}
        </div>

        <div className="cta-panel">
          <div>
            <h2>A faster way to explore career opportunities</h2>
            <p>CareerTide keeps discovery simple: unified search, clear source labels, relevant filters, and direct apply links.</p>
          </div>
          <button onClick={() => props.setPage('sources')} type="button">Explore sources</button>
        </div>
      </section>
    </main>
  )
}

function JobsPage(props: {
  query: string
  setQuery: (value: string) => void
  location: string
  setLocation: (value: string) => void
  experience: string
  setExperience: (value: string) => void
  setPage: (value: Page) => void
  onSearch: () => void
  searchCount: number
  filteredJobs: Job[]
  jobs: Job[]
  loading: boolean
  status: string
  sourceFilter: string
  setSourceFilter: (value: string) => void
  sourceOptions: string[]
  jobType: string
  setJobType: (value: string) => void
  tags: string[]
  lastSearch: string
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 6
  const totalPages = Math.max(1, Math.ceil(props.filteredJobs.length / pageSize))
  const visibleJobs = props.filteredJobs.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [props.filteredJobs.length, props.sourceFilter, props.jobType, props.searchCount])

  return (
    <>
      <PageHero title="Job List" crumb="Home › Jobs › Unified Search" />
      <main className="page-shell">
        <SearchBand {...props} />
        <section className="content">
          <div className="left">
            <div className="results-header">
              <div>
                <strong>{props.loading ? 'Loading jobs...' : `Showing ${props.filteredJobs.length} results`}</strong>
                <p>{props.status}</p>
                <p className="last-search">Last search: {props.lastSearch}</p>
              </div>
              <select>
                <option>Newest</option>
                <option>Relevant</option>
              </select>
            </div>
            <div className="job-list">
              {visibleJobs.map((job, index) => <JobCard job={job} index={index} key={job.id} />)}
            </div>
            <div className="pagination">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>«</button>
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  className={currentPage === index + 1 ? 'active' : ''}
                  key={`page-${index + 1}`}
                  onClick={() => setCurrentPage(index + 1)}
                >
                  {index + 1}
                </button>
              ))}
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>»</button>
            </div>
          </div>
          <aside className="sidebar">
            <FilterGroup title="Job source" options={props.sourceOptions} value={props.sourceFilter} onChange={props.setSourceFilter} />
            <FilterGroup title="Type of employment" options={['All', 'Full Time', 'Remote', 'Hybrid']} value={props.jobType} onChange={props.setJobType} />
            <div className="filter-box">
              <h3>Tags Cloud</h3>
              <div className="tag-cloud">
                {props.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </>
  )
}

function CompaniesPage({ jobs }: { jobs: Job[] }) {
  return (
    <>
      <PageHero title="Company List" crumb="Home › Companies › Hiring Sources" />
      <main className="page-shell">
        <div className="section-title">
          <strong>Companies from current results</strong>
          <span>Click a card to open the original job source</span>
        </div>
        <div className="company-grid">
          {jobs.slice(0, 9).map((job) => (
            <a className="company-card" href={job.sourceUrl} target="_blank" rel="noreferrer" key={`company-${job.id}`}>
              <div className="logo large">{job.companyLogo ? <img src={job.companyLogo} alt="" /> : initials(job.company)}</div>
              <strong>{job.company}</strong>
              <span>{job.location}</span>
              <em>{job.source}</em>
            </a>
          ))}
        </div>
      </main>
    </>
  )
}

function SourcesPage({ query, location, setQuery, setPage }: { query: string; location: string; setQuery: (value: string) => void; setPage: (page: Page) => void }) {
  return (
    <>
      <PageHero title="Source Hub" crumb="Home › Sources › Redirect Partners" />
      <main className="page-shell">
        <div className="section-title">
          <strong>Search all supported platforms</strong>
          <span>Each card opens the original job board for your current search</span>
        </div>
        <section className="source-grid">
          {sourceSearchLinks.map(([source, , description]) => (
            <a className="source-card" href={buildSourceUrl(source, query, location)} target="_blank" rel="noreferrer" key={source}>
              <span>{source.slice(0, 2).toUpperCase()}</span>
              <strong>{source}</strong>
              <p>{description}</p>
              <em>Open source search »</em>
            </a>
          ))}
        </section>
        <div className="cta-panel">
          <div>
            <h2>Try a specific search</h2>
            <p>Use a relevant keyword and jump straight to the job list.</p>
          </div>
          <button
            onClick={() => {
              setQuery('Java Python AWS')
              setPage('jobs')
            }}
            type="button"
          >
            Search high-demand tech
          </button>
        </div>
      </main>
    </>
  )
}

function WorkflowsPage() {
  const [copied, setCopied] = useState('')
  const [activeTutorial, setActiveTutorial] = useState(0)

  const copyWorkflow = async (name: string, json: object) => {
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2))
    setCopied(name)
    window.setTimeout(() => setCopied(''), 1800)
  }

  return (
    <>
      <PageHero title="Automation Workflows" crumb="Home › Workflows › Copy JSON" />
      <main className="page-shell">
        <div className="section-title">
          <div>
            <strong>Copy-ready workflow JSON</strong>
            <span>Use these templates in n8n, Make, Zapier, Airtable, Sheets, or your own backend.</span>
          </div>
        </div>
        <section className="workflow-process">
          {workflowProcess.map(([step, title, text]) => (
            <article key={step}>
              <span>{step}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className="beginner-workflow">
          <div>
            <h2>Beginner approach</h2>
            <p>Use this order if you are new to n8n or automation platforms. Build the workflow in small safe parts, test each part, then connect the next step.</p>
          </div>
          <ol>
            {beginnerWorkflowSteps.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="tutorial-zone">
          <div className="section-title">
            <div>
              <strong>See how to use the JSON</strong>
              <span>Short visual guides for beginners. Click any option to preview the process.</span>
            </div>
          </div>
          <div className="tutorial-layout">
            <div className="tutorial-player">
              <div className="play-orb">▶</div>
              <span>{workflowTutorials[activeTutorial].duration} guide</span>
              <h2>{workflowTutorials[activeTutorial].title}</h2>
              <div className="video-timeline">
                {workflowTutorials[activeTutorial].steps.map((step, index) => (
                  <div className="video-step" key={step}>
                    <em>{index + 1}</em>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="tutorial-options">
              {workflowTutorials.map((tutorial, index) => (
                <button
                  className={activeTutorial === index ? 'active' : ''}
                  key={tutorial.title}
                  onClick={() => setActiveTutorial(index)}
                  type="button"
                >
                  <strong>{tutorial.title}</strong>
                  <span>{tutorial.duration} preview</span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="usefulness-grid">
          <div className="section-title">
            <div>
              <strong>Which workflow is useful for what?</strong>
              <span>Pick based on your current job-search problem.</span>
            </div>
          </div>
          <div className="use-case-grid">
            {workflowTemplates.map((workflow) => (
              <article key={`use-${workflow.name}`}>
                <strong>{workflow.name}</strong>
                <p>{workflow.description}</p>
                {'usefulness' in workflow.json && <span>{String(workflow.json.usefulness)}</span>}
              </article>
            ))}
          </div>
        </section>
        <section className="workflow-links">
          <div className="section-title">
            <div>
              <strong>Helpful workflow source links</strong>
              <span>Open these docs to understand where to paste/import the JSON and how each platform works.</span>
            </div>
          </div>
          <div className="workflow-link-grid">
            {workflowSourceLinks.map(([label, url]) => (
              <a href={url} key={label} rel="noreferrer" target="_blank">
                <strong>{label}</strong>
                <span>Open guide →</span>
              </a>
            ))}
          </div>
        </section>
        <section className="workflow-grid">
          {workflowTemplates.map((workflow) => (
            <article className="workflow-card" key={workflow.name}>
              <div className="workflow-head">
                <div>
                  <span>{workflow.platform}</span>
                  <h2>{workflow.name}</h2>
                  <p>{workflow.description}</p>
                </div>
                <button className="copy-button" onClick={() => copyWorkflow(workflow.name, workflow.json)} type="button">
                  {copied === workflow.name ? 'Copied ✓' : 'Copy JSON'}
                </button>
              </div>
              <pre>{JSON.stringify(workflow.json, null, 2)}</pre>
            </article>
          ))}
        </section>
        <div className="workflow-note">
          <strong>Important:</strong> Use these workflows to discover, shortlist, track, and open source apply pages. Fully automated mass-applying can violate platform rules and reduce application quality, so this app keeps user approval in the flow.
        </div>
      </main>
    </>
  )
}

function PageHero({ title, crumb }: { title: string; crumb: string }) {
  return (
    <section className="page-hero">
      <h1>{title}</h1>
      <p>{crumb}</p>
    </section>
  )
}

function CompactJobCard({ job }: { job: Job }) {
  return (
    <article className="compact-job">
      <div className="logo">{job.companyLogo ? <img src={job.companyLogo} alt="" /> : initials(job.company)}</div>
      <p>{job.source} · {job.location}</p>
      <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.title}</a>
      <span>{job.employmentType} · {job.posted}</span>
      <div>{job.tags.slice(0, 3).map((tag) => <em key={`${job.id}-${tag}`}>{tag}</em>)}</div>
      <strong>{job.salary}</strong>
    </article>
  )
}

function JobCard({ job, index }: { job: Job; index: number }) {
  return (
    <article className="job-card">
      <div className="corner">{job.source.slice(0, 2).toUpperCase()}</div>
      <div className="job-body">
        <div className="logo">{job.companyLogo ? <img src={job.companyLogo} alt="" /> : initials(job.company)}</div>
        <div className="job-info">
          <span className="source-pill">{job.source}</span>
          <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="job-title">{job.title}</a>
          <p>{job.company}</p>
        </div>
        <div className="job-location">📍 {job.location}</div>
        <div className="job-time">🕒 {job.posted}</div>
        <div className="job-tags">
          <span>{job.employmentType}</span>
          {job.tags.slice(0, 2).map((tag) => <span key={`${job.id}-${tag}`}>{tag}</span>)}
        </div>
      </div>
      <div className="job-footer">
        <span>Experience : {job.experience}</span>
        <span>{job.salary}</span>
        <a href={job.sourceUrl} target="_blank" rel="noreferrer">Apply on {job.source} »</a>
      </div>
      {index % 3 === 0 && <span className="featured">Radar match</span>}
    </article>
  )
}

function FilterGroup({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="filter-box">
      <h3>{title}</h3>
      {options.map((option) => (
        <label className="radio-row" key={option}>
          <input checked={value === option} onChange={() => onChange(option)} type="radio" />
          {option}
        </label>
      ))}
    </div>
  )
}

function Footer() {
  return (
    <footer>
      <div>
        <h2>Get new job notifications</h2>
        <p>Save your search and apply from the original source.</p>
      </div>
      <form>
        <input placeholder="Enter your email" />
        <button type="button">Subscribe</button>
      </form>
    </footer>
  )
}

export default App
