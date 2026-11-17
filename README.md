# BUILDEX

BUILDEX is a Next.js website builder with a visual editor, template marketplace, designer profiles, subscriptions, and an admin command center.

## Requirements

- Node.js 20.9 or newer
- PostgreSQL 14 or newer (Supabase PostgreSQL is supported)
- A Catbox account for managed public image uploads, plus Supabase Storage for private ZIP quarantine

## Install

```bash
npm install
cp .env.example .env.local
```

Set every required value in `.env.local` for local development, or in the deployment provider's environment settings for production. Never commit `.env.local` or a service-role key.

Required values:

- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SESSION_SECRET` (at least 32 random characters; use 64 or more)
- `OWNER_EMAIL`
- `OWNER_PASSWORD` (at least 16 characters and includes letters and numbers)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CATBOX_USERHASH` (required in production for managed image uploads and deletion)
- `CRON_SECRET` (at least 32 random characters)
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (optional but strongly recommended for shared cache, distributed rate limits, and analytics deduplication)

## Database setup

For a fresh database, generate and apply the Drizzle schema with:

```bash
npm run db:push
```

Then run `db/migrations/0002_security_profiles_and_rate_limits.sql` and `db/migrations/0003_supabase_load_reduction.sql` in the Supabase SQL Editor. For an existing BUILDEX database, run both SQL migrations, then run `npm run db:push` to reconcile the complete Drizzle schema.

The SQL migration adds designer privacy fields and shared rate-limit storage, updates only BUILDEX-owned legacy JPG asset paths, and creates the private `buildex-quarantine` bucket. The server uses the Supabase service role only on the server. Do not expose it through a `NEXT_PUBLIC_` variable.

## First owner account

The first owner is created from `OWNER_EMAIL` and `OWNER_PASSWORD` by the seed process. No public demo passwords or seeded reviewer/support logins are included. On upgrade, the legacy demo staff accounts (`owner@buildex.app`, `reviewer@buildex.app`, and `support@buildex.app`) are suspended and their sessions revoked. Configure the owner environment variables before first use. If the database has already completed seeding, adding the owner variables later will bootstrap the owner on the next request.

Create additional staff accounts through the admin user-management screen after the owner signs in.

## Manual payments

BUILDEX does not mark a paid order as successful from the customer browser. A paid plan or paid template creates a pending order. The customer is sent to a checkout page that displays the WhatsApp number configured by an owner/admin in **Command Center → Settings**.

1. Set the phone number in international format, including the country code (for Egypt, for example, `+20...`).
2. Add optional transfer instructions.
3. The customer opens the WhatsApp payment desk, sends the order reference, and attaches the transfer receipt.
4. Staff verify the transfer outside the platform, then open **Command Center → Payments** and approve or reject the pending order.
5. Only approval activates the subscription or records a template purchase.

A free order activates automatically. Customer-side confirmation and payment webhooks are not exposed in this manual-contact build.

## Password reset email

Password reset emails are sent through Resend when both `RESEND_API_KEY` and `EMAIL_FROM` are configured. Without those values, the API returns a generic response and never exposes a reset token or URL.

## Scheduled maintenance

`vercel.json` schedules `/api/cron/maintenance` daily at 03:00 UTC. Configure `CRON_SECRET` in Vercel. The route accepts only `Authorization: Bearer <CRON_SECRET>`.

For a non-Vercel host, configure an equivalent daily HTTP GET cron request with that authorization header.

## Storage

- Public user images are uploaded server-side to Catbox through `https://catbox.moe/user/api.php` using the `fileupload` request type. The API returns a public `https://files.catbox.moe/...` URL, which is saved in PostgreSQL.
- Set `CATBOX_USERHASH` in Vercel Environment Variables. It is kept server-side and is never exposed to the browser. Catbox supports anonymous uploads, but a user hash is required to delete files, so production uploads require the hash to avoid unmanaged files.
- The image endpoint accepts JPEG, PNG, WEBP, and GIF files up to 4MB. Files are signature-checked before they are sent to Catbox.
- Uploaded ZIP archives remain in the private `buildex-quarantine` Supabase Storage bucket and are never executed or published.
- Existing media records stored in Supabase or local development paths remain supported for deletion during migration.
- Catbox-hosted images are public to anyone who has their URL. Do not upload private or sensitive images.

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run db:generate
npm run db:push
```

## Deployment

1. Push the project to GitHub.
2. Import it into Vercel.
3. Add the required environment variables to Production, Preview, and Development as appropriate.
4. Apply the database schema using `npm run db:push` from an environment that can connect to the database.
5. Ensure the `buildex-quarantine` bucket exists and remains private, and set `CATBOX_USERHASH` in Vercel.
6. For production traffic, create an Upstash Redis database and add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel. The app continues to work without Redis, but rate limits then use PostgreSQL and distributed caching is unavailable.
7. Deploy and verify `/api/health`, sign-up, owner sign-in, Catbox media upload/deletion, manual checkout, and admin payment approval.

## Security notes

- Admin credentials are never embedded in the login UI or fixed in source code.
- Sessions are stored as hashes and use HTTP-only cookies.
- When Upstash Redis is configured, distributed rate limits and short-lived read caches use Redis instead of writing a PostgreSQL row for every limited request. Without Redis, the application safely falls back to PostgreSQL rate limits.
- Public page-view analytics is deduplicated per visitor, page, event type, and day. Redis prevents repeat database writes when configured; a unique event key also protects the database when Redis is unavailable.
- Public website reads, template lists, and session lookups use short TTL caches. Cache entries are never used as the source of truth for payments or authorization changes beyond a 10-second session cache window.
- The PostgreSQL pool defaults to one connection per serverless instance. Use the Supabase transaction pooler URL for Vercel and keep `PG_POOL_MAX` low.
- Published websites no longer store a duplicate published JSON document when the draft is identical. The published snapshot is created only when the owner edits a live site.
- Pending updates to published templates use the version-history row as their single document copy instead of duplicating the same JSON in `templates.pending_document`. Legacy pending-document rows remain readable.
- Website version history and template version history retain the newest 10 snapshots each. Maintenance prunes expired login attempts, password-reset tokens, read notifications, old webhook events, analytics events, and audit logs according to the retention rules in `src/lib/jobs.ts`.
- Form submissions, guestbook entries, support conversations, purchases, and payment records are not automatically deleted because they may contain user content or business records.
- Password-protected website forms and guestbooks require the same gate cookie as the published page.
- Payment activation is a staff-side action for manual payments.
- ZIP uploads are validated, stored privately, and remain quarantined pending review.
