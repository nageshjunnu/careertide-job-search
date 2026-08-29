import 'dotenv/config'

const isVercelRuntime = Boolean(process.env.VERCEL)
const localDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/job-search-aggregator'

export const serverConfig = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  // Local development may use the bundled PostgreSQL default. A Vercel function
  // must receive DATABASE_URL from Vercel Environment Variables and must never
  // silently attempt to reach localhost.
  databaseUrl: process.env.DATABASE_URL ?? (isVercelRuntime ? '' : localDatabaseUrl),
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
