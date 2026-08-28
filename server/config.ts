import 'dotenv/config'

export const serverConfig = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/job-search-aggregator',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: (process.env.SMTP_USER ?? '').trim(),
    // Google displays App Passwords in four groups; SMTP expects the 16 characters without spaces.
    pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''),
    from: process.env.EMAIL_FROM ?? 'CareerTide <no-reply@careertide.local>',
  },
  razorpay: {
    keyId: (process.env.RAZORPAY_KEY_ID ?? '').trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET ?? '').trim(),
  },
}
