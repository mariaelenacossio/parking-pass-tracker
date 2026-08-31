# Parking Pass Tracker

One QR code → one URL → a mobile- and desktop-friendly web app for checking
office parking passes in and out. Built for Associa British Columbia.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (admin dashboard; the public UI is self-contained CSS-in-JS)
- **Supabase** (PostgreSQL)
- **Resend** (transactional email)
- **Vercel** (hosting + hourly cron)

## How it works

- Employees open the URL and choose **Take a pass** or **Return a pass**.
- Taking: pick an available pass number, enter name + work email + how often
  they come in (Daily / Occasional). They get a confirmation email with a
  one-click return link; the admin gets a copy.
- Returning: pick a checked-out pass, confirm with the email used at checkout.
- **Occasional** holders who don't return within 24h get reminder emails,
  escalating every 24h for up to 3 reminders. After that only the admin is
  notified and the employee stops receiving mail.
- `/admin` (password protected) shows all 50 passes, lets the admin force-return
  a pass, and exports the full transaction log as CSV.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:

   | Variable | Where to get it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API (keep secret) |
   | `RESEND_API_KEY` | Resend dashboard → API Keys |
   | `EMAIL_FROM` | e.g. `Parking Passes <passes@yourdomain.com>` — leave blank to use the Resend sandbox sender |
   | `ADMIN_EMAIL` | Address that receives issue notifications + escalations |
   | `ADMIN_PASSWORD` | Password for `/admin` |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; the Vercel URL in production |
   | `CRON_SECRET` | Any long random string (Vercel sends it as a Bearer token) |

3. Run the database migration. In the Supabase dashboard → **SQL Editor**, paste
   and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   It creates both tables and seeds passes `001`–`050` as available.

4. Start the dev server:

   ```bash
   npm run dev
   ```

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/passes` | GET | All 50 passes + hours each has been out |
| `/api/issue` | POST | `{ passId, name, email, type }` — check a pass out |
| `/api/return` | POST | `{ passId, email }` — check a pass back in |
| `/api/cron/remind` | GET | Hourly reminder sweep (needs `Authorization: Bearer $CRON_SECRET`) |
| `/api/admin/login` | POST / DELETE | Set / clear the admin session cookie |
| `/api/admin/session` | GET | `{ authed: boolean }` |
| `/api/admin/force-return` | POST | `{ passId }` — admin-only force return |
| `/api/admin/export` | GET | Transaction log as CSV (admin-only) |

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Add every variable from `.env.example` in the Vercel project settings.
   Set `NEXT_PUBLIC_APP_URL` to the production URL.
3. `vercel.json` registers the hourly cron for `/api/cron/remind`. Vercel
   automatically attaches `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET`
   is set as an env var.
4. Every push to `main` auto-deploys. Point the reception QR code at the
   production URL.

## Testing the reminder cron locally

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/remind
```

To see it actually send, temporarily set a pass's `issued_at` to 25+ hours ago
and `holder_type` to `occasional` in Supabase.
