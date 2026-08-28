# Vercel + Neon deployment

Production uses Vercel environment variables. Do not commit the Neon connection string or add it to the local `.env` file when local PostgreSQL is still required.

In **Vercel → Project → Settings → Environment Variables**, add these values for **Production** only:

- `DATABASE_URL` — Neon pooled PostgreSQL connection string, including `sslmode=require`.
- `CLIENT_URL` — your final HTTPS Vercel domain, for example `https://your-domain.vercel.app`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` — production email values if email delivery is required.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — Razorpay test or live keys, as appropriate.
- `CRON_SECRET` — a long random secret used only to protect the production scheduler endpoint.

Do not set `VITE_API_URL` in Production. The frontend uses same-domain `/api`, so browser requests go to the deployed Vercel API function rather than localhost.

Before the first production release, run the database migration once with `DATABASE_URL` temporarily pointed at Neon:

```bash
npm run db:migrate
```

## Scheduled searches in production

The local Node server runs its own minute scheduler. Vercel functions do not stay alive, so production needs a secure external scheduler (for example Vercel Cron on a suitable plan, GitHub Actions, or a worker service) that sends a `POST` request to:

```text
/api/internal/run-scheduled-searches
Authorization: Bearer <CRON_SECRET>
```

The endpoint atomically claims due workflows in Neon, so duplicate requests do not run the same user's search twice.
