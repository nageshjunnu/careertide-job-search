export type ResumeValidationResult = {
  valid: boolean
  score: number // 0 - 100
  filename: string
  extractedTextLength: number
  emailFound: string | null
  phoneFound: string | null
  sectionsFound: string[]
  skillsFound: string[]
  verdict: string
  issues: string[]
}

const COMMON_SKILLS = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'react', 'angular', 'vue', 'node', 'express',
  'spring', 'django', 'flask', 'sql', 'postgresql', 'mysql', 'mongodb', 'aws', 'azure', 'docker', 'kubernetes',
  'git', 'ci/cd', 'html', 'css', 'rest api', 'graphql', 'devops', 'machine learning', 'data science',
  'agile', 'scrum', 'testing', 'cypress', 'jest', 'selenium', 'linux', 'microservices', 'redis', 'kafka'
]

const SECTION_KEYWORDS: Record<string, string[]> = {
  'Experience & Work History': ['experience', 'work history', 'employment', 'career history', 'professional experience', 'projects'],
  'Skills & Technical Focus': ['skills', 'technical skills', 'core competencies', 'technologies', 'tools', 'expertise'],
  'Education & Qualifications': ['education', 'qualifications', 'degree', 'academic', 'university', 'college', 'bachelor', 'master'],
  'Summary / Objective': ['summary', 'objective', 'about me', 'profile', 'overview'],
}

export async function parseAndValidateResume(file: File): Promise<ResumeValidationResult> {
  const issues: string[] = []
  const filename = file.name

  // 1. Format check
  const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  const extensionValid = /\.(pdf|doc|docx)$/i.test(filename)
  if (!extensionValid || (file.type && !allowed.includes(file.type))) {
    return {
      valid: false,
      score: 0,
      filename,
      extractedTextLength: 0,
      emailFound: null,
      phoneFound: null,
      sectionsFound: [],
      skillsFound: [],
      verdict: 'Invalid Document Type',
      issues: ['Upload a PDF, DOC, or DOCX resume file.'],
    }
  }

  // 2. Size check
  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      score: 0,
      filename,
      extractedTextLength: 0,
      emailFound: null,
      phoneFound: null,
      sectionsFound: [],
      skillsFound: [],
      verdict: 'File Size Exceeded',
      issues: ['File size exceeds 10 MB limit.'],
    }
  }

  // 3. Text Content Extraction (Read file binary / text)
  let rawText = ''
  try {
    const arrayBuffer = await file.arrayBuffer()
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const textSample = decoder.decode(arrayBuffer)
    // Clean printable text
    rawText = textSample.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
  } catch {
    rawText = ''
  }

  const textLower = rawText.toLowerCase()
  const textLength = rawText.trim().length

  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const emailFound = emailMatch ? emailMatch[0] : null

  const phoneMatch = rawText.match(/\+?\d[\d\s-]{9,}\d/)
  const phoneFound = phoneMatch ? phoneMatch[0].trim() : null

  // 4. Section Detection
  const sectionsFound: string[] = []
  for (const [sectionName, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((kw) => textLower.includes(kw))) {
      sectionsFound.push(sectionName)
    }
  }

  // 5. Skills Detection
  const skillsFound: string[] = []
  for (const skill of COMMON_SKILLS) {
    if (textLower.includes(skill)) {
      skillsFound.push(skill.toUpperCase())
    }
  }

  // Calculate Resume Health Score
  let score = 35 // Base points for valid format
  if (textLength > 150) score += 20
  else if (textLength > 50) score += 10
  else issues.push('Low text content. Ensure file is an unencrypted PDF or Word document.')

  if (emailFound) score += 15
  else issues.push('No contact email detected in document text.')

  if (phoneFound) score += 10

  if (sectionsFound.includes('Experience & Work History')) score += 15
  else issues.push('Missing explicit Experience or Projects section.')

  if (sectionsFound.includes('Skills & Technical Focus')) score += 10
  else issues.push('Missing explicit Skills section.')

  if (sectionsFound.includes('Education & Qualifications')) score += 10

  score = Math.min(100, Math.max(20, score))

  const valid = score >= 50 && issues.length <= 2

  let verdict = '✓ Verified Professional Resume'
  if (score >= 85) verdict = '✓ Excellent Resume · Fully Parsed'
  else if (score >= 60) verdict = '✓ Valid Resume · Good Structure'
  else verdict = '⚠️ Low Confidence Document · Check File'

  return {
    valid,
    score,
    filename,
    extractedTextLength: textLength,
    emailFound,
    phoneFound,
    sectionsFound,
    skillsFound: Array.from(new Set(skillsFound)).slice(0, 8),
    verdict,
    issues,
  }
}

