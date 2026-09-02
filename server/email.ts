import nodemailer from 'nodemailer'
import { database } from './database.js'
import { serverConfig } from './config.js'
import { createStepEmail } from './email-templates.js'

const transporter = serverConfig.smtp.host
  ? nodemailer.createTransport({ host: serverConfig.smtp.host, port: serverConfig.smtp.port, secure: serverConfig.smtp.secure, auth: { user: serverConfig.smtp.user, pass: serverConfig.smtp.pass } })
  : null

export async function sendStepEmail(userId: string | null, email: string, name: string, step: string, message: string) {
  let status = 'skipped_not_configured'
  let providerId: string | null = null
  let errorCode: string | null = null
  try {
    if (transporter) {
      const brandResult = await database.query<{ value: string }>(`SELECT value FROM site_settings WHERE key='brand_name'`)
      const content = createStepEmail(name, step, message, brandResult.rows[0]?.value || 'SkillBridge')
      const result = await transporter.sendMail({
        from: serverConfig.smtp.from,
        to: email,
        ...content,
      })
      status = 'sent'
      providerId = result.messageId
    }
  } catch (error) {
    status = 'failed'
    errorCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'EMAIL_DELIVERY_FAILED'
    console.error('Email delivery failed:', error)
  }
  await database.query('INSERT INTO email_logs (user_id, recipient, step, status, provider_id, error_code) VALUES ($1,$2,$3,$4,$5,$6)', [userId, email, step, status, providerId, errorCode])
  return { status, providerId, errorCode, message: status === 'failed' ? 'SMTP rejected the message. Check the API log and /api/email/status.' : undefined }
}

export async function verifyEmailConfiguration() {
  if (!transporter) return { configured: false, verified: false, code: 'SMTP_NOT_CONFIGURED', message: 'SMTP variables are missing.' }
  try { await transporter.verify(); return { configured: true, verified: true, code: null, message: 'SMTP authentication succeeded.' } }
  catch (error) {
    return { configured: true, verified: false, code: typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'SMTP_VERIFY_FAILED', message: 'SMTP authentication failed. For Gmail, use a Google App Password.' }
  }
}

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export async function sendRecruiterApplicationEmail({
  userId,
  recruiterEmail,
  candidateName,
  candidateEmail,
  candidatePhone,
  candidateRoles,
  candidateSkills,
  candidateExperience,
  candidateResumeName,
  jobTitle,
  company,
  source,
  matchScore,
  sourceUrl,
}: {
  userId: string
  recruiterEmail: string
  candidateName: string
  candidateEmail: string
  candidatePhone?: string | null
  candidateRoles?: string | null
  candidateSkills?: string | null
  candidateExperience?: string | null
  candidateResumeName?: string | null
  jobTitle: string
  company: string
  source: string
  matchScore: number
  sourceUrl: string
}) {
  let status = 'skipped_not_configured'
  let providerId: string | null = null
  let errorCode: string | null = null

  const recruiterHtml = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 640px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
      <div style="background: #0f172a; padding: 24px; color: #f8fafc;">
        <h2 style="margin: 0; font-size: 20px;">Job Application: ${escapeHtml(jobTitle)}</h2>
        <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Candidate Submission via CareerTide Assistant</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 15px; line-height: 1.5;">Dear Hiring Manager / Talent Acquisition Team at <strong>${escapeHtml(company)}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #334155;">
          I am writing to express my strong interest in the <strong>${escapeHtml(jobTitle)}</strong> position posted on ${escapeHtml(source)}. Below is a summary of my candidate profile:
        </p>

        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr><td style="padding: 4px 0; color: #64748b; width: 140px;">Candidate Name:</td><td style="padding: 4px 0; font-weight: bold; color: #0f172a;">${escapeHtml(candidateName)}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b;">Primary Email:</td><td style="padding: 4px 0; font-weight: bold; color: #0284c7;">${escapeHtml(candidateEmail)}</td></tr>
            ${candidatePhone ? `<tr><td style="padding: 4px 0; color: #64748b;">Phone:</td><td style="padding: 4px 0; font-weight: bold;">${escapeHtml(candidatePhone)}</td></tr>` : ''}
            ${candidateRoles ? `<tr><td style="padding: 4px 0; color: #64748b;">Target Roles:</td><td style="padding: 4px 0;">${escapeHtml(candidateRoles)}</td></tr>` : ''}
            ${candidateExperience ? `<tr><td style="padding: 4px 0; color: #64748b;">Experience:</td><td style="padding: 4px 0;">${escapeHtml(candidateExperience)}</td></tr>` : ''}
            ${candidateSkills ? `<tr><td style="padding: 4px 0; color: #64748b;">Key Skills:</td><td style="padding: 4px 0;">${escapeHtml(candidateSkills)}</td></tr>` : ''}
            <tr><td style="padding: 4px 0; color: #64748b;">Attached Resume:</td><td style="padding: 4px 0; font-weight: bold; color: #0d9488;">${escapeHtml(candidateResumeName || 'Primary Profile Resume')}</td></tr>
          </table>
        </div>

        <p style="font-size: 13px; line-height: 1.6; color: #475569;">
          My background aligns closely with the job criteria (Match Score: <strong>${matchScore}%</strong>). I look forward to discussing how my experience can add value to ${escapeHtml(company)}.
        </p>

        <div style="margin-top: 20px;">
          <a href="${escapeHtml(sourceUrl)}" style="display: inline-block; padding: 10px 18px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: bold;">View Job Reference Listing →</a>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 14px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
        Submitted directly via Candidate Career Assistant · CareerTide Platform Integration
      </div>
    </div>
  `

  try {
    if (transporter) {
      // 1. Send Email to Recruiter
      const recruiterResult = await transporter.sendMail({
        from: serverConfig.smtp.from,
        to: recruiterEmail,
        replyTo: candidateEmail,
        subject: `[Application] ${candidateName} - ${jobTitle} (${company})`,
        html: recruiterHtml,
      })
      status = 'sent'
      providerId = recruiterResult.messageId

      // 2. Send Confirmation Email to Candidate
      const candidateMsg = `
        <strong>Status:</strong> Successfully Dispatched to Recruiter Email (${escapeHtml(recruiterEmail)})<br>
        <strong>Role:</strong> ${escapeHtml(jobTitle)}<br>
        <strong>Company:</strong> ${escapeHtml(company)}<br>
        <strong>Platform Source:</strong> ${escapeHtml(source)}<br>
        <strong>Match Score:</strong> ${matchScore}%<br>
        <strong>Resume Sent:</strong> ${escapeHtml(candidateResumeName || 'Primary Profile Resume')}<br><br>
        <a href="${escapeHtml(sourceUrl)}" style="display:inline-block;padding:8px 14px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600">View Job Listing on ${escapeHtml(source)} →</a><br><br>
        Your application email and resume have been dispatched directly to recruiter contact <strong>${escapeHtml(recruiterEmail)}</strong>.
      `
      void sendStepEmail(userId, candidateEmail, candidateName, `Application Dispatched via Recruiter Email: ${jobTitle} at ${company}`, candidateMsg)

      // 3. Send Admin Audit Notification
      const adminEmail = serverConfig.admin.email || serverConfig.smtp.user
      if (adminEmail) {
        const adminMsg = `
          <strong>Admin Audit Alert: Recruiter Application Dispatched</strong><br>
          <strong>Candidate:</strong> ${escapeHtml(candidateName)} (${escapeHtml(candidateEmail)})<br>
          <strong>Recruiter Contact:</strong> ${escapeHtml(recruiterEmail)}<br>
          <strong>Position:</strong> ${escapeHtml(jobTitle)} at ${escapeHtml(company)}<br>
          <strong>Platform Source:</strong> ${escapeHtml(source)} (Recruiter Email Dispatch Mode)<br>
          <strong>Match Score:</strong> ${matchScore}%<br>
          <strong>Dispatched At:</strong> ${new Date().toLocaleString('en-IN')}<br>
        `
        // Admin audit notifications do not belong to a candidate row; keep the FK nullable.
        void sendStepEmail(null, adminEmail, 'CareerTide Administrator', `[Admin Audit] Application Dispatched: ${candidateName} -> ${company}`, adminMsg)
      }
    }
  } catch (err: unknown) {
    status = 'failed'
    errorCode = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : 'EMAIL_DELIVERY_FAILED'
    console.error('Recruiter application email delivery failed:', err)
  }

  await database.query(
    'INSERT INTO email_logs (user_id, recipient, step, status, provider_id, error_code) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, recruiterEmail, `Recruiter Application: ${jobTitle}`, status, providerId, errorCode]
  )

  return { status, providerId, errorCode, recruiterEmail }
}
