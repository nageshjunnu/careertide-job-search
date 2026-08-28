export const SOURCE_SEARCH_LINKS = [
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
] as const

const encode = (value: string) => encodeURIComponent(value.trim())
const slug = (value: string) => encode(value).replaceAll('%20', '-').replaceAll('%2C', '')

export const buildSourceUrl = (source: string, query: string, location: string) => {
  const template = SOURCE_SEARCH_LINKS.find(([name]) => name === source)?.[1] ?? SOURCE_SEARCH_LINKS[0][1]
  return template
    .replaceAll('{query}', encode(query))
    .replaceAll('{location}', encode(location))
    .replaceAll('{q}', slug(query))
    .replaceAll('{l}', slug(location))
}
