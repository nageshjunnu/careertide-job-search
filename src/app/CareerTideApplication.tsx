import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer'
import { PageHero } from '../components/common/PageHero'
import { APP_CONFIG, PAGE_PATHS } from '../config/app.config'
import { SOURCE_SEARCH_LINKS, buildSourceUrl } from '../config/job-sources.config'
import { experienceLabel, getRemoteJobs } from '../services/api/jobs.api'
import type { Job, Page, SearchCriteria } from '../types/job'
import { SearchProvider } from '../context/SearchContext'
import { useSearch } from '../context/useSearch'
import { AutomationPage } from '../features/automation/pages/AutomationPage'
import { AdminPage } from '../features/admin/pages/AdminPage'
import '../App.css'

type WaveRipple = {
  id: number
  x: number
  y: number
  size: number
}

const sourceSearchLinks = SOURCE_SEARCH_LINKS

const marketReportUrl = 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/digest/'

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
    name: 'Daily Job Search Operating Routine',
    platform: 'n8n / Sheets / Email',
    description: 'A practical daily loop: discover jobs, review the shortlist, apply deliberately, and prepare tomorrow’s follow-ups.',
    json: {
      workflowName: 'careertide_daily_job_search_routine',
      schedule: 'weekdays at 08:00 and 17:30',
      safetyMode: 'manual_application_approval',
      dailyRoutine: [
        { time: '08:00', action: 'collect_new_jobs_from_allowed_sources_and_official_search_links' },
        { time: '08:10', action: 'deduplicate_and_rank_by_role_location_experience_and_salary' },
        { time: '08:20', action: 'send_top_10_jobs_to_review_queue' },
        { time: '12:00', action: 'user_reviews_and_opens_original_apply_pages' },
        { time: '17:30', action: 'update_applied_skipped_and_follow_up_statuses' },
        { time: '17:35', action: 'create_next_day_follow_up_reminders' },
      ],
      trackerFields: ['title', 'company', 'source', 'applyUrl', 'matchScore', 'status', 'nextActionDate'],
      output: 'daily_shortlist_and_follow_up_queue',
    },
  },
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

const alternativePlatformWorkflows = [
  {
    name: 'Daily Discovery Scenario',
    platform: 'Make',
    description: 'A Make scenario blueprint for scheduled discovery, scoring, and a concise daily email.',
    json: {
      scenarioName: 'careertide_daily_discovery',
      trigger: { module: 'Scheduler', frequency: 'daily', time: '08:00' },
      modules: [
        { app: 'HTTP', action: 'get', purpose: 'read_permitted_public_job_api_or_source_feed' },
        { app: 'Tools', action: 'deduplicate_and_score', fields: ['title', 'company', 'location', 'experience'] },
        { app: 'Google Sheets', action: 'add_or_update_row', sheet: 'Job Tracker' },
        { app: 'Gmail', action: 'send_email', template: 'daily_shortlist' },
      ],
      manualStep: 'Review source links before opening an application',
    },
  },
  {
    name: 'Approved Job Alert Zap',
    platform: 'Zapier',
    description: 'A Zapier blueprint that alerts you only when a saved job meets the score threshold.',
    json: {
      zapName: 'careertide_approved_job_alert',
      trigger: { app: 'Google Sheets', event: 'New or Updated Spreadsheet Row', sheet: 'Job Tracker' },
      filters: [
        { field: 'matchScore', condition: 'greater_than_or_equal_to', value: 75 },
        { field: 'status', condition: 'equals', value: 'saved' },
      ],
      actions: [
        { app: 'Slack', event: 'Send Channel Message', message: 'Review {{title}} at {{company}}: {{applyUrl}}' },
        { app: 'Google Sheets', event: 'Update Row', values: { status: 'review_notified' } },
      ],
      manualStep: 'Approve the job, then open the original application URL yourself',
    },
  },
  {
    name: 'Airtable Application Pipeline',
    platform: 'Airtable Automations',
    description: 'An Airtable automation blueprint for tracking applications, interviews, and follow-ups.',
    json: {
      automationName: 'careertide_follow_up_due',
      trigger: { type: 'record_matches_conditions', table: 'Applications', conditions: ['status = applied', 'nextFollowUpDate = today'] },
      actions: [
        { type: 'create_record', table: 'Tasks', fields: { task: 'Follow up with {{company}}', application: '{{recordId}}' } },
        { type: 'send_email', recipient: '{{userEmail}}', subject: 'Follow-up due: {{company}}' },
        { type: 'update_record', table: 'Applications', fields: { status: 'follow_up_due' } },
      ],
      fields: ['title', 'company', 'source', 'applyUrl', 'status', 'nextFollowUpDate'],
    },
  },
  {
    name: 'Spreadsheet Daily Summary Script',
    platform: 'Google Apps Script',
    description: 'A Google Apps Script configuration for a daily shortlist and overdue-follow-up summary.',
    json: {
      projectName: 'CareerTideDailySummary',
      trigger: { type: 'timeDriven', schedule: 'everyWeekday', time: '18:00' },
      spreadsheet: { name: 'Job Tracker', sheets: ['Jobs', 'Applications', 'Follow-ups'] },
      process: [
        'read_rows_with_status_saved_or_applied',
        'find_followUps_due_today',
        'group_jobs_by_source_and_matchScore',
        'email_daily_summary_to_user',
      ],
      manualStep: 'Use the summary to decide your next applications; do not submit applications automatically',
    },
  },
]

const platformLearning = {
  n8n: {
    steps: ['Copy the JSON as a workflow blueprint.', 'Create a Schedule Trigger, then add one node for each listed action.', 'Connect your tracker and notification credentials, then test with two sample jobs.', 'Activate only after the user-review step works correctly.'],
    videoUrl: 'https://www.youtube.com/live/4cQWJViybAQ',
    videoLabel: 'Watch n8n quick-start video',
  },
  Make: {
    steps: ['Create a new scenario and add the listed apps as modules.', 'Map output fields such as title, company, source URL, and status between modules.', 'Run once with sample data, then schedule the scenario.', 'Keep the final application-opening step manual.'],
    videoUrl: 'https://www.youtube.com/results?search_query=Make+official+beginner+scenario+tutorial',
    videoLabel: 'Find Make beginner videos',
  },
  Zapier: {
    steps: ['Create a new Zap and choose the trigger shown in the JSON.', 'Add the filters before any notification or update action.', 'Map the job fields into Slack, email, or your tracker.', 'Test the Zap with a saved job before publishing it.'],
    videoUrl: 'https://www.youtube.com/results?search_query=Zapier+official+beginner+tutorial',
    videoLabel: 'Find Zapier beginner videos',
  },
  Airtable: {
    steps: ['Create the Applications and Tasks tables with the listed fields.', 'Build an Automation using the trigger conditions in the JSON.', 'Add each follow-up action and map record fields.', 'Test with one sample application before turning it on.'],
    videoUrl: 'https://www.youtube.com/results?search_query=Airtable+official+automation+tutorial',
    videoLabel: 'Find Airtable automation videos',
  },
  Google: {
    steps: ['Open Extensions → Apps Script from the job-tracker spreadsheet.', 'Create a time-driven trigger using the schedule in the JSON.', 'Use the process list as the order for reading, grouping, and emailing data.', 'Run once with sample rows and check the email output.'],
    videoUrl: 'https://www.youtube.com/results?search_query=Google+Apps+Script+beginner+tutorial+spreadsheet',
    videoLabel: 'Find Apps Script videos',
  },
}

const workflowProcess = [
  ['1', 'Choose search rules', 'Set role keywords, locations, experience, preferred sources, and daily limits.'],
  ['2', 'Collect source links', 'Generate safe source URLs and fetch allowed public APIs where available.'],
  ['3', 'Rank and deduplicate', 'Remove repeated jobs, score by keyword match, and keep the strongest opportunities.'],
  ['4', 'Review before apply', 'User approves jobs before opening apply links or saving application notes.'],
  ['5', 'Track follow-ups', 'Store status, reminders, recruiter contacts, and next follow-up date.'],
]

const thirdPartyWorkflowSteps = [
  ['Naukri', 'Official search link', ['Build a keyword, location, and experience search URL.', 'Open the results page for the user to review current listings.', 'Save approved roles and their original apply links in the tracker.'], 'Broad India-focused role discovery'],
  ['LinkedIn', 'Official search link', ['Generate a Jobs search URL with the selected role and location.', 'Let the user filter results and inspect the company and job details.', 'Save or open the original application only after user approval.'], 'Network-led roles and recruiter visibility'],
  ['Google Jobs', 'Search discovery', ['Run a Google Jobs search using the selected role and location.', 'Compare the source and company shown for each listing.', 'Prefer the direct company link when it is available, then track the choice.'], 'Finding listings repeated across boards'],
  ['Indeed', 'Official search link', ['Create an Indeed search URL from the search rules.', 'Review the listing, salary, and employer details with the user.', 'Store shortlisted jobs, then open the original apply flow manually.'], 'Global and local job coverage'],
  ['Foundit', 'Official search link', ['Build the Foundit role and location search URL.', 'Filter the results for experience and relevant skills.', 'Save approved roles with source, URL, and application status.'], 'India and APAC opportunities'],
  ['Instahyre', 'Official search link', ['Open the role-focused Instahyre search page.', 'Review matching startup roles and candidate requirements.', 'Add selected roles to the review queue before applying.'], 'Curated startup hiring'],
  ['Wellfound', 'Official search link', ['Generate the Wellfound startup jobs search URL.', 'Check company stage, remote policy, and role fit.', 'Track the selected job and open its application page after review.'], 'Startup and remote-friendly roles'],
  ['Glassdoor', 'Official search link', ['Open Glassdoor using the role and location search.', 'Review company ratings, salary signals, and job details.', 'Use the insight to prioritize a saved application or research task.'], 'Company research and salary context'],
  ['Cutshort', 'Official search link', ['Create a tech-role search link for Cutshort.', 'Check skills, location, and recruiter requirements.', 'Save suitable jobs to the tracker for a manual application.'], 'India tech and startup roles'],
  ['TimesJobs', 'Official search link', ['Open a personalized TimesJobs search from the chosen filters.', 'Review titles and employers against the user profile.', 'Record shortlisted jobs and their source URLs.'], 'Additional India job-board coverage'],
  ['Shine', 'Official search link', ['Generate the Shine role and location search link.', 'Review opportunities and screen out weak matches.', 'Send only approved jobs to the application queue.'], 'Broad India hiring coverage'],
  ['Remote OK', 'Official search link', ['Build a remote role search URL.', 'Verify timezone, location eligibility, and remote requirements.', 'Save strong matches and open the source application manually.'], 'Remote-only job discovery'],
  ['Remotive', 'Public API or official search', ['Use the permitted public API or official search page for matching remote roles.', 'Normalize the role, company, tags, and application URL.', 'Deduplicate, score, and notify the user about high-quality matches.'], 'Automated remote-job intake'],
] as const

const sourceShortcutGuides = thirdPartyWorkflowSteps.map(([source, method, steps, bestFor]) => ({
  source,
  method,
  steps,
  bestFor,
  duration: '45 sec',
}))

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

const roleFamilies = ['All', 'Technology', 'HR / Recruiting', 'Sales', 'Marketing', 'Finance', 'Operations', 'Support', 'Design', 'Product']
const experienceFilters = ['All', '0 - 1 years', '0 - 3 years', '1 - 4 years', '3 - 6 years', '6+ years']
const locationFilters = ['All', 'Current location', 'Remote']
const salaryFilters = ['All', 'Salary shown', 'Not disclosed']
const dateFilters = ['All', 'Today', 'This week']

const initials = (company: string) =>
  company
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

const sourceRedirectJobs = (query: string, location: string, experience = '0-3'): Job[] => {
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
  const roleWord = isCloud
    ? 'Engineer'
    : isData
      ? 'Specialist'
      : isSecurity
        ? 'Analyst'
        : isRecruiting
          ? 'Specialist'
          : isSales
            ? 'Executive'
            : isMarketing
              ? 'Specialist'
              : isFinance
                ? 'Executive'
                : isOperations
                  ? 'Coordinator'
                  : isSupport
                    ? 'Specialist'
                    : isDesign
                      ? 'Designer'
                      : isProduct
                        ? 'Manager'
                        : isAi
                          ? 'Engineer'
                          : isReact || isBackend
                            ? 'Developer'
                            : 'Professional'
  const baseTitle = /developer|engineer|analyst|specialist|manager|designer|executive|coordinator/i.test(cleanQuery)
    ? cleanQuery
    : `${cleanQuery} ${roleWord}`
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
    experience: experienceLabel(experience),
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
      <SearchProvider><RoutedApp /></SearchProvider>
    </BrowserRouter>
  )
}

function RoutedApp() {
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const isAdminRoute = routeLocation.pathname === '/admin'
  const [waves, setWaves] = useState<WaveRipple[]>([])
  const { query, setQuery, location, setLocation, experience, setExperience } = useSearch()
  const [sourceFilter, setSourceFilter] = useState('All')
  const [jobType, setJobType] = useState('All')
  const [roleFamily, setRoleFamily] = useState('All')
  const [experienceFilter, setExperienceFilter] = useState('All')
  const [locationFilter, setLocationFilter] = useState('All')
  const [salaryFilter, setSalaryFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('All')
  const [submittedSearch, setSubmittedSearch] = useState<SearchCriteria>({ ...APP_CONFIG.defaultSearch })
  const [jobs, setJobs] = useState<Job[]>(sourceRedirectJobs(APP_CONFIG.defaultSearch.query, APP_CONFIG.defaultSearch.location, APP_CONFIG.defaultSearch.experience))
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Showing source-matched fallback jobs. Search loads third-party remote jobs.')
  const [lastSearch, setLastSearch] = useState('Java Python AWS · Hyderabad Secunderabad · 0-3 years')
  const [searchCount, setSearchCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    const loadJobs = async () => {
      setLoading(true)
      try {
        const remoteJobs = await getRemoteJobs(submittedSearch, controller.signal)
        setJobs([...sourceRedirectJobs(submittedSearch.query, submittedSearch.location, submittedSearch.experience), ...remoteJobs])
        setStatus(remoteJobs.length ? 'Showing all source redirects plus live third-party jobs from Remotive.' : 'Showing all source redirects for this search.')
      } catch {
        setJobs(sourceRedirectJobs(submittedSearch.query, submittedSearch.location, submittedSearch.experience))
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
  }, [submittedSearch])

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const searchable = `${job.title} ${job.company} ${job.tags.join(' ')} ${job.source}`.toLowerCase()
        const sourceMatches = sourceFilter === 'All' || job.source === sourceFilter
        const typeMatches =
          jobType === 'All' ||
          job.employmentType.toLowerCase().includes(jobType.toLowerCase()) ||
          (jobType === 'Remote' && job.remote)
        const roleMatches =
          roleFamily === 'All' ||
          (roleFamily === 'Technology' && /software|engineer|developer|cloud|devops|data|ai|frontend|backend|security|technology|java|python|aws/.test(searchable)) ||
          (roleFamily === 'HR / Recruiting' && /hr|recruit|talent acquisition|ta\b|hiring/.test(searchable)) ||
          (roleFamily === 'Sales' && /sales|business development|bd/.test(searchable)) ||
          (roleFamily === 'Marketing' && /marketing|seo|growth|content/.test(searchable)) ||
          (roleFamily === 'Finance' && /finance|account|payroll/.test(searchable)) ||
          (roleFamily === 'Operations' && /operation|admin|coordinator/.test(searchable)) ||
          (roleFamily === 'Support' && /support|customer|bpo|voice|success/.test(searchable)) ||
          (roleFamily === 'Design' && /design|ui|ux|figma/.test(searchable)) ||
          (roleFamily === 'Product' && /product|project|scrum/.test(searchable))
        const experienceMatches = experienceFilter === 'All' || job.experience === experienceFilter || (experienceFilter === '6+ years' && job.experience.includes('6'))
        const locationMatches =
          locationFilter === 'All' ||
          (locationFilter === 'Remote' && job.remote) ||
          (locationFilter === 'Current location' && job.location.toLowerCase().includes(submittedSearch.location.split(' ')[0].toLowerCase()))
        const salaryMatches =
          salaryFilter === 'All' ||
          (salaryFilter === 'Salary shown' && job.salary !== 'Not disclosed') ||
          (salaryFilter === 'Not disclosed' && job.salary === 'Not disclosed')
        const dateMatches = dateFilter === 'All' || (dateFilter === 'Today' && job.posted === 'Today') || (dateFilter === 'This week' && (job.posted === 'Today' || /[1-7] days ago/.test(job.posted)))
        return sourceMatches && typeMatches && roleMatches && experienceMatches && locationMatches && salaryMatches && dateMatches
      }),
    [jobs, sourceFilter, jobType, roleFamily, experienceFilter, locationFilter, salaryFilter, dateFilter, submittedSearch.location],
  )

  const sourceOptions = ['All', ...Array.from(new Set(jobs.map((job) => job.source)))]
  const tags = Array.from(new Set(jobs.flatMap((job) => job.tags))).slice(0, 10)
  const runSearch = () => {
    setSubmittedSearch({ query, location, experience })
    setExperienceFilter(experienceLabel(experience))
    setLastSearch(`${query || 'Any role'} · ${location || 'Any location'} · ${experienceLabel(experience)}`)
    setSearchCount((count) => count + 1)
    setStatus('Search triggered. Refreshing matching jobs and source links...')
    navigate('/jobs#results')
  }

  const setPage = (page: Page) => navigate(PAGE_PATHS[page])
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
      {!isAdminRoute && <Header location={location} onNavigate={setPage} />}

      <Routes>
        <Route path="/" element={<HomePage {...searchProps} jobs={jobs} filteredJobs={filteredJobs} loading={loading} status={status} lastSearch={lastSearch} />} />
        <Route path="/jobs" element={<JobsPage {...searchProps} filteredJobs={filteredJobs} jobs={jobs} loading={loading} status={status} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} sourceOptions={sourceOptions} jobType={jobType} setJobType={setJobType} roleFamily={roleFamily} setRoleFamily={setRoleFamily} experienceFilter={experienceFilter} setExperienceFilter={setExperienceFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} salaryFilter={salaryFilter} setSalaryFilter={setSalaryFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} tags={tags} lastSearch={lastSearch} searchCount={searchCount} />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/companies" element={<CompaniesPage jobs={jobs} />} />
        <Route path="/sources" element={<SourcesPage query={query} location={location} setQuery={setQuery} setPage={setPage} />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
      </Routes>

      {!isAdminRoute && <Footer />}
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
        <div className="finder-title">
          <span className="finder-mark">CT</span>
          <div>
            <strong>CareerTide Finder</strong>
            <small>Search role, location, and experience across trusted platforms</small>
          </div>
        </div>
        <span className="finder-status">13 sources connected</span>
      </div>
      <div className="search-row">
        <label>
          <span>Job / skill / company</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Java, Python, AWS, Data Analyst, UI UX..." />
        </label>
        <label>
          <span>Preferred location</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Hyderabad, Bengaluru, Remote..." />
        </label>
        <label>
          <span>Experience level</span>
          <CustomSelect
            icon="target"
            options={[
              ['0-1', '0 - 1 years'],
              ['0-3', '0 - 3 years'],
              ['3-6', '3 - 6 years'],
              ['6+', 'More than 6 years'],
            ]}
            value={experience}
            onChange={setExperience}
          />
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
        <section className="market-pulse">
          <div>
            <span>Career market pulse</span>
            <h2>AI is changing how work gets done—not removing the need for strong people.</h2>
            <p>AI, data, cloud, and cybersecurity skills are growing in importance, while problem-solving, communication, and domain knowledge remain essential.</p>
          </div>
          <a href={marketReportUrl} rel="noreferrer" target="_blank">Read the global skills outlook →</a>
        </section>
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
  roleFamily: string
  setRoleFamily: (value: string) => void
  experienceFilter: string
  setExperienceFilter: (value: string) => void
  locationFilter: string
  setLocationFilter: (value: string) => void
  salaryFilter: string
  setSalaryFilter: (value: string) => void
  dateFilter: string
  setDateFilter: (value: string) => void
  tags: string[]
  lastSearch: string
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState('newest')
  const pageSize = APP_CONFIG.pagination.jobsPerPage
  const sortedJobs = useMemo(() => {
    const nextJobs = [...props.filteredJobs]
    if (sortBy === 'source') return nextJobs.sort((a, b) => a.source.localeCompare(b.source))
    if (sortBy === 'salary') return nextJobs.sort((a, b) => (a.salary === 'Not disclosed' ? 1 : 0) - (b.salary === 'Not disclosed' ? 1 : 0))
    return nextJobs
  }, [props.filteredJobs, sortBy])
  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / pageSize))
  const activePage = Math.min(currentPage, totalPages)
  const visibleJobs = sortedJobs.slice((activePage - 1) * pageSize, activePage * pageSize)

  useEffect(() => {
    if (window.location.hash !== '#results') return
    window.requestAnimationFrame(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [props.searchCount])

  return (
    <>
      <PageHero title="Job List" crumb="Home › Jobs › Unified Search" />
      <main className="page-shell">
        <SearchBand {...props} />
        <section className="content">
          <div className="left">
            <div className="results-header" id="results">
              <div>
                <strong>{props.loading ? 'Finding jobs for you...' : `${props.filteredJobs.length} jobs found for you`}</strong>
                <p>{props.status}</p>
                <p className="last-search">Last search: {props.lastSearch}</p>
              </div>
              <CustomSelect
                icon="sort"
                options={[
                  ['newest', 'Newest first'],
                  ['source', 'Group by source'],
                  ['salary', 'Salary shown first'],
                ]}
                value={sortBy}
                onChange={setSortBy}
              />
            </div>
            <div className="results-help">
              <span>What to do next</span>
              <p>Read the role details, check the market guidance, then use <b>Apply on source</b> to open the original job board. Save only the jobs you want to apply for.</p>
            </div>
            <div className="job-list">
              {visibleJobs.map((job, index) => <JobCard job={job} index={index} key={job.id} />)}
            </div>
            <div className="pagination">
              <button disabled={activePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>«</button>
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  className={activePage === index + 1 ? 'active' : ''}
                  key={`page-${index + 1}`}
                  onClick={() => setCurrentPage(index + 1)}
                >
                  {index + 1}
                </button>
              ))}
              <button disabled={activePage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>»</button>
            </div>
          </div>
          <aside className="sidebar">
            <div className="filter-summary">
              <strong>Smart filters</strong>
              <span>{props.filteredJobs.length} matched from {props.jobs.length} results</span>
            </div>
            <FilterGroup title="Role family" options={roleFamilies} value={props.roleFamily} onChange={props.setRoleFamily} />
            <FilterGroup title="Job source" options={props.sourceOptions} value={props.sourceFilter} onChange={props.setSourceFilter} />
            <FilterGroup title="Type of employment" options={['All', 'Full Time', 'Remote', 'Hybrid']} value={props.jobType} onChange={props.setJobType} />
            <FilterGroup title="Experience" options={experienceFilters} value={props.experienceFilter} onChange={props.setExperienceFilter} />
            <FilterGroup title="Location" options={locationFilters} value={props.locationFilter} onChange={props.setLocationFilter} />
            <FilterGroup title="Salary" options={salaryFilters} value={props.salaryFilter} onChange={props.setSalaryFilter} />
            <FilterGroup title="Date posted" options={dateFilters} value={props.dateFilter} onChange={props.setDateFilter} />
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
  const [activeSourceGuide, setActiveSourceGuide] = useState(0)

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
        <section className="source-workflow-guide">
          <div className="section-title">
            <div>
              <strong>How each job source fits into the workflow</strong>
              <span>Use official search links for job boards; only connect public APIs where the source explicitly permits it. Every application remains user-approved.</span>
            </div>
          </div>
          <div className="source-workflow-grid">
            {thirdPartyWorkflowSteps.map(([source, method, steps, bestFor]) => (
              <article key={source}>
                <div>
                  <strong>{source}</strong>
                  <span>{method}</span>
                </div>
                <ol>
                  {steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <p><b>Best for:</b> {bestFor}</p>
              </article>
            ))}
          </div>
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
        <section className="source-shortcut-tutorial">
          <div className="section-title">
            <div>
              <strong>Shortcut walkthrough for every source</strong>
              <span>Select a source for a short visual guide: generate the official shortcut, review the result, then save only approved jobs.</span>
            </div>
          </div>
          <div className="source-shortcut-layout">
            <div className="tutorial-player source-shortcut-player">
              <div className="play-orb">▶</div>
              <span>{sourceShortcutGuides[activeSourceGuide].duration} visual walkthrough</span>
              <h2>{sourceShortcutGuides[activeSourceGuide].source} shortcut workflow</h2>
              <p><b>Use:</b> {sourceShortcutGuides[activeSourceGuide].method} · <b>Best for:</b> {sourceShortcutGuides[activeSourceGuide].bestFor}</p>
              <div className="video-timeline">
                {sourceShortcutGuides[activeSourceGuide].steps.map((step, index) => (
                  <div className="video-step" key={step}>
                    <em>{index + 1}</em>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="source-shortcut-options">
              {sourceShortcutGuides.map((guide, index) => (
                <button
                  className={activeSourceGuide === index ? 'active' : ''}
                  key={guide.source}
                  onClick={() => setActiveSourceGuide(index)}
                  type="button"
                >
                  <strong>{guide.source}</strong>
                  <span>{guide.duration} guide</span>
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
              <WorkflowHowToUse platform={workflow.platform} />
            </article>
          ))}
        </section>
        <section className="alternative-workflows">
          <div className="section-title">
            <div>
              <strong>Other automation-platform JSON blueprints</strong>
              <span>Use the workflow matching your tool. These are platform-specific setup blueprints—not n8n-only templates.</span>
            </div>
          </div>
          <div className="workflow-grid">
            {alternativePlatformWorkflows.map((workflow) => (
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
                <WorkflowHowToUse platform={workflow.platform} />
              </article>
            ))}
          </div>
        </section>
        <div className="workflow-note">
          <strong>Important:</strong> Use these workflows to discover, shortlist, track, and open source apply pages. Fully automated mass-applying can violate platform rules and reduce application quality, so this app keeps user approval in the flow.
        </div>
      </main>
    </>
  )
}

function WorkflowHowToUse({ platform }: { platform: string }) {
  const learning = platform.includes('Make')
    ? platformLearning.Make
    : platform.includes('Zapier')
      ? platformLearning.Zapier
      : platform.includes('Airtable')
        ? platformLearning.Airtable
        : platform.includes('Google Apps Script')
          ? platformLearning.Google
          : platformLearning.n8n

  return (
    <div className="workflow-how-to-use">
      <div>
        <strong>How to use this JSON</strong>
        <a href={learning.videoUrl} rel="noreferrer" target="_blank">▶ {learning.videoLabel}</a>
      </div>
      <ol>
        {learning.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </div>
  )
}

function CompactJobCard({ job }: { job: Job }) {
  const insight = getMarketInsight(job)
  return (
    <article className="compact-job">
      <div className="logo">{job.companyLogo ? <img src={job.companyLogo} alt="" /> : initials(job.company)}</div>
      <p>{job.source} · {job.location}</p>
      <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.title}</a>
      <span>{job.employmentType} · {job.posted}</span>
      <div>{job.tags.slice(0, 3).map((tag) => <em key={`${job.id}-${tag}`}>{tag}</em>)}</div>
      <strong>{job.salary}</strong>
      <p className="compact-market-signal"><b>{insight.demand}</b> · {insight.aiShort}</p>
    </article>
  )
}

function JobCard({ job, index }: { job: Job; index: number }) {
  const insight = getMarketInsight(job)
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
      </div>
      <div className="job-details" aria-label="Job details">
        <div className="job-location"><span className="mini-icon location-icon" />{job.location}</div>
        <div className="job-time"><span className="mini-icon time-icon" />{job.posted}</div>
        <div className="job-tags">
          <span>{job.employmentType}</span>
          {job.tags.slice(0, 2).map((tag) => <span key={`${job.id}-${tag}`}>{tag}</span>)}
        </div>
      </div>
      <div className="job-footer">
        <div className="job-footer-meta">
          <span><b>Experience</b>{job.experience}</span>
          <span><b>Salary</b>{job.salary}</span>
        </div>
        <a href={job.sourceUrl} target="_blank" rel="noreferrer">Apply on {job.source} »</a>
      </div>
      <div className="job-market-insight">
        <div>
          <span>Market situation</span>
          <strong>{insight.demand}</strong>
          <p>{insight.market}</p>
        </div>
        <div>
          <span>With AI</span>
          <p>{insight.withAi}</p>
        </div>
        <div>
          <span>Without AI</span>
          <p>{insight.withoutAi}</p>
        </div>
        <small>Role-based guidance, not live local hiring data.</small>
      </div>
      {index % 3 === 0 && <span className="featured">Radar match</span>}
    </article>
  )
}

function getMarketInsight(job: Job) {
  const role = `${job.title} ${job.tags.join(' ')}`.toLowerCase()
  if (/ai|machine learning|data scientist|data analyst|analytics/.test(role)) {
    return { demand: 'Strong demand signal', market: 'Data and AI skills are widely requested, but employers still look for real business impact.', withAi: 'AI helps you analyse faster; show that you can check results and explain decisions.', withoutAi: 'Build SQL, statistics, dashboards, and domain knowledge to stand out.', aiShort: 'AI plus data judgement is valuable' }
  }
  if (/cloud|devops|aws|azure|kubernetes|security|cyber/.test(role)) {
    return { demand: 'Steady-to-strong demand signal', market: 'Teams continue to need reliable systems, security, and automation skills.', withAi: 'AI can speed up troubleshooting; employers still need safe reviews and production ownership.', withoutAi: 'Strong fundamentals in infrastructure, monitoring, security, and incident handling matter.', aiShort: 'AI speeds work; ownership still matters' }
  }
  if (/frontend|react|angular|vue|full.?stack|software|developer|engineer/.test(role)) {
    return { demand: 'Selective demand signal', market: 'Openings remain active, with more focus on practical projects and end-to-end delivery.', withAi: 'Use AI to prototype and test faster, then prove code quality and product judgement.', withoutAi: 'A strong portfolio, core coding skills, debugging, and collaboration remain important.', aiShort: 'AI-assisted delivery is becoming expected' }
  }
  if (/recruit|talent|hr/.test(role)) {
    return { demand: 'Changing demand signal', market: 'Hiring teams value people who combine relationship skills with efficient tools and data.', withAi: 'AI can reduce repetitive screening; human judgement, fairness, and candidate trust remain key.', withoutAi: 'Develop sourcing, interviewing, stakeholder, and process-management strengths.', aiShort: 'AI helps screening; people skills lead' }
  }
  return { demand: 'Role-dependent demand signal', market: 'Demand changes by location, company, and your skills—compare several sources before deciding.', withAi: 'AI can speed up routine work; show where you add judgement, quality, and customer value.', withoutAi: 'Clear role fundamentals, communication, and measurable outcomes remain your advantage.', aiShort: 'AI literacy can strengthen your profile' }
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

function CustomSelect({
  icon,
  options,
  value,
  onChange,
}: {
  icon: 'target' | 'sort'
  options: Array<[string, string]>
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? value

  return (
    <div className={`custom-select ${open ? 'open' : ''}`}>
      <Icon name={icon} />
      <button className="select-trigger" onClick={() => setOpen((current) => !current)} type="button">
        <span>{selectedLabel}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="select-menu">
          {options.map(([optionValue, label]) => (
            <button
              className={optionValue === value ? 'selected' : ''}
              key={optionValue}
              onClick={() => {
                onChange(optionValue)
                setOpen(false)
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Icon({ name }: { name: 'target' | 'sort' | 'chevron' }) {
  if (name === 'target') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M12 12h.01" />
      </svg>
    )
  }
  if (name === 'sort') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 6h10M10 12h7M13 18h4" />
        <path d="m6 16-2 2 2 2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  )
}

export default App
