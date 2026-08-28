# PostgreSQL and email setup

## 1. Create the environment file

Copy `.env.example` to `.env` and replace `YOUR_PASSWORD` with the password used by pgAdmin:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/job-search-aggregator
PORT=4000
CLIENT_URL=http://localhost:5173
VITE_API_URL=http://localhost:4000
```

If your PostgreSQL username is not `postgres`, change it in `DATABASE_URL`.

## 2. Configure email

For Gmail, enable 2-Step Verification and create a Google App Password. Do not use your normal Gmail password.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="nagesh.yalumala@gmail.com"
SMTP_PASS="Nagesh_2021"
EMAIL_FROM=CareerTide Nagesh.yalumala@careertide.com
```

Without SMTP values, setup still saves to PostgreSQL. Email attempts are recorded as `skipped_not_configured` in `email_logs`.

## 3. Create the tables

```bash
npm run db:migrate
```

## 4. Start the frontend and API

```bash
npm run dev:all
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

## 5. Verify in pgAdmin

Open `job-search-aggregator → Schemas → public → Tables`, then refresh. The application creates:

- `users`
- `career_profiles`
- `onboarding_progress`
- `payments`
- `career_workflows`
- `application_preferences`
- `notification_preferences`
- `setup_step_events`
- `email_logs`

Useful queries:

```sql
SELECT * FROM users ORDER BY created_at DESC;
SELECT * FROM onboarding_progress ORDER BY updated_at DESC;
SELECT * FROM setup_step_events ORDER BY created_at DESC;
SELECT * FROM email_logs ORDER BY created_at DESC;
```

## Setup APIs

Each Continue action calls a separate endpoint and sends a completion email:

```text
POST /api/setup/user
POST /api/setup/payment
POST /api/setup/workflow
POST /api/setup/application-rules
POST /api/setup/operations
```

The payment endpoint is test-mode only. A production payment must replace this simulation with a Razorpay checkout and server-verified webhook.
