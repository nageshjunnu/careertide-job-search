import nodemailer from 'nodemailer'
import { database } from './database.js'
import { serverConfig } from './config.js'
import { createStepEmail } from './email-templates.js'

const transporter = serverConfig.smtp.host
  ? nodemailer.createTransport({ host: serverConfig.smtp.host, port: serverConfig.smtp.port, secure: serverConfig.smtp.secure, auth: { user: serverConfig.smtp.user, pass: serverConfig.smtp.pass } })
  : null

export async function sendStepEmail(userId: string, email: string, name: string, step: string, message: string) {
  let status = 'skipped_not_configured'
  let providerId: string | null = null
  let errorCode: string | null = null
  try {
    if (transporter) {
      const content = createStepEmail(name, step, message)
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
    return { configured: true, verified: false, code: typeof error === 'object' && error && 'code' in error ? String(error.code) : 'SMTP_VERIFY_FAILED', message: 'SMTP authentication failed. For Gmail, use a Google App Password.' }
  }
}
