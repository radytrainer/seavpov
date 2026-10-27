# Project Status

_Last updated: 2026-10-27_

## Current phase

**All phases (0–13) implemented and verified locally.** Remaining work is the on-site production
rollout on AWS EC2 for pn-seavpov.store (docs/DEPLOY_AWS.md), which needs the institution's server, domain and accounts (see
"Manual steps").

## Phases

| Phase | Name                               | Status                                                                                           |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0     | Repository inspection and planning | Complete                                                                                         |
| 1     | Project foundation                 | Complete                                                                                         |
| 2     | Database and authentication        | Complete                                                                                         |
| 3     | Library catalog and My Books       | Complete                                                                                         |
| 4     | Reading timer and sessions         | Complete                                                                                         |
| 5     | Reading reflections                | Complete                                                                                         |
| 6     | Student dashboard                  | Complete                                                                                         |
| 7     | Reading goals and analytics        | Complete                                                                                         |
| 8     | Trainer dashboard                  | Complete                                                                                         |
| 9     | Administrator dashboard            | Complete                                                                                         |
| 10    | UI/UX refinement                   | Complete                                                                                         |
| 11    | Testing and performance            | Complete                                                                                         |
| 12    | Production deployment              | Complete locally (images, compose, TLS proxy, backups verified); server rollout is a manual step |
| 13    | Final handover                     | Complete                                                                                         |

## Summary by phase

- **0–1 Foundation:** pnpm monorepo (`apps/api`, `apps/web`, `packages/shared`), strict TS 6.0,
  ESLint/Prettier, Fastify 5 + Zod type provider, Prisma 7 (pg adapter), Next.js 16 + Tailwind 4,
  env validation, central error handling, log redaction, health checks, Docker Compose dev DB.
- **2 Auth & schema:** normalized schema with extra SQL constraints (one active session per
  student via partial unique index, CHECKs); Argon2id; hashed opaque session tokens in HttpOnly
  cookies; lockout + rate limits; password change/reset; forced temporary-password change;
  object-level access helpers; admin account management; trainer assignments.
- **3 Books:** shared catalog with student submissions, duplicate detection and admin merge;
  personal book records with progress, status dates, archive; search/filter/sort/pagination.
- **4 Timer:** server-side state machine (start/pause/resume/finish/cancel) with conditional
  updates in transactions; server-computed durations; cap for forgotten timers; midnight policy;
  manual entry with overlap detection; audited edits; timer UI that survives refresh.
- **5 Reflections:** partial reflections with rating and tags, Khmer/English search, trainer
  feedback, local draft backup in the editor.
- **6–7 Dashboard, goals, analytics:** all values from SQL aggregates; streaks, consistency,
  comparisons, goal history and progress (`docs/METRICS.md`); validated single-hue charts with
  table views.
- **8 Trainer:** assigned-student list with batched metrics, overview with class trend,
  "may need encouragement" indicator, review queue, CSV reports (scoped, formula-injection safe,
  no reflection text, exports audited).
- **9 Admin:** users (create, edit, deactivate, reset password, assignments), CSV import with
  dry run and per-row errors (all-or-nothing), classes/generations, categories, catalog review,
  settings (audited before/after), audit log viewer, reports.
- **10 UI/UX:** screenshot review at 390 px and 1280 px for every page; fixed dialog grid overflow
  on mobile and a focusable element inside an `aria-hidden` chart.
- **11 Testing & performance:** Playwright E2E (10 tests, axe checks), perf dataset (25k
  sessions) and benchmark; trainer overview p95 reduced from 1.9 s to 0.32 s by computing habit
  statistics in SQL; rate limiting re-keyed per session for schools behind NAT; dependency audit.
- **12 Deployment:** multi-stage images (non-root, tini, health checks), `docker-compose.prod.yml`
  (nginx TLS/HSTS/CSP/gzip, internal-only DB and health endpoints, log rotation, restart
  policies, daily verified backups), restore script; full local smoke test incl. restart and
  restore.
- **13 Handover:** documentation set listed in README.

## Change log

- **2026-10-27 — AWS deployment for pn-seavpov.store.** nginx site config is now a template
  driven by `DOMAIN` (apex served, `www` and raw-IP requests redirected, ACME webroot on :80,
  duplicate security headers removed). New `deploy/` scripts: `server-setup.sh` (Docker, ufw,
  certbot, swap), `init-letsencrypt.sh` (first start + certificate + renewal hook),
  `bootstrap-admin.sh`, `deploy.sh` (backup, build, health-gated restart, rollback by ref),
  `backup-to-s3.sh`. `.env.production.example` pre-filled for the domain. Guide:
  docs/DEPLOY_AWS.md. Verified locally with DOMAIN=localhost (see that guide's verification
  record); server setup, certbot and S3 steps need the EC2 server and DNS.
- **2026-10-27 — Performance fixes.** Every API request from the web server waited ~200 ms
  because `localhost` resolved to IPv6 first on Windows while the API listens on IPv4; defaults
  now use `127.0.0.1` (API URL and database URLs), cutting page loads by 0.5–1 s. `pnpm dev`
  did not start the API reliably (`tsx watch` stalled under `pnpm --parallel`); the API now uses
  `node --watch --import tsx`. Fixed a hydration error (nested `<p>` in page headers) on the
  reflection edit page. Users page loads its student list in parallel with the summary.
  Added `pnpm start:prod` for fast local use. Measured (admin pages, compiled dev):
  0.26–0.44 s for most pages (was 0.9–1.7 s); production build: 0.05–0.3 s.

- **2026-10-27 — Reflection PDFs and Users page redesign.** Reflections download as branded A4
  PDFs (single reflection, or all reflections of a student with summary page) for students,
  assigned trainers and admins; staff downloads audited; Khmer rendered with Noto Sans Khmer via
  pdfkit with a patched fontkit (`patches/fontkit@2.0.4.patch`), fonts in `apps/api/assets`.
  Admin Users page rebuilt: summary shortcuts, Students / Trainers / Administrators tabs,
  progress-at-a-glance student table with one-click links to progress, reflections and PDF;
  new filters (account status, without a trainer); trainer student counts.

- **2026-10-27 — Specification gap review.** Added the remaining items found by comparing the
  build with the original specification: administrator "void session" workflow (reason required,
  audited, excluded from metrics) — the only authorised way to correct reading data;
  weekly/monthly reading summary report; "include deactivated accounts" report filter; date
  filters and clickable tags for student reflections; cover image link when adding a new book.
- **2026-10-27 — Registration and sign-in fit on one screen.** Registration reduced to name,
  student ID + class, optional email and password (username derived from the student ID,
  show/hide password); sign-in redesigned with larger inputs; both verified without scrolling
  from 360×640 phones to 1920×1080.
- **2026-10-27 — New logo "សៀវភៅ PN"** (design/logo, public/brand), used in the app shell,
  sign-in pages, favicon and touch icon.

- **2026-10-27 — Self-registration and trainer view.** Admin switch (Overview and Settings) to
  let students create their own accounts, off by default; new students are linked to the
  trainers of their class; "No trainer" user filter. Trainer student list shows current-book
  progress and reading time vs. goal; student page has Overview / Reflections / Sessions / Books
  tabs; reflections are shown in full with inline feedback (also in the review queue, filterable
  by class). Warning text colour darkened to meet WCAG AA contrast.

## Test results (latest run, 2026-10-27)

| Suite                                                                | Result                       |
| -------------------------------------------------------------------- | ---------------------------- |
| Shared unit (Vitest)                                                 | 27 / 27 passed               |
| Web unit (Vitest)                                                    | 4 / 4 passed                 |
| API integration (Vitest + PostgreSQL)                                | 123 / 123 passed             |
| E2E (Playwright: Chromium desktop + Pixel 7)                         | 15 / 15 passed               |
| axe WCAG A/AA serious/critical                                       | 0 violations on tested pages |
| TypeScript / ESLint / Prettier                                       | pass                         |
| `next build`, API bundle, Docker image builds                        | pass                         |
| `pnpm audit`                                                         | no known vulnerabilities     |
| Production compose smoke test, restart persistence, backup → restore | pass                         |

Details and performance numbers: `docs/TESTING.md`.

## Database migration status

| Migration                          | Status                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `20261027041917_init`              | Applied to dev, test and perf databases; applied automatically by the API container in production |
| `20261027070807_self_registration` | Adds `system_settings.self_registration_enabled` (default false); applied to dev and test         |

## Manual steps (not possible from this environment)

1. AWS (docs/DEPLOY_AWS.md): Elastic IP for the EC2 instance (16.176.173.105), security group
   80/443 open (only 22 was reachable on 2026-10-27), Namecheap A records `@` and `www` →
   the server IP (the domain still pointed at Namecheap parking on 2026-10-27).
2. On the server: `deploy/server-setup.sh`, fill `.env.production`, `deploy/init-letsencrypt.sh`,
   `deploy/bootstrap-admin.sh`.
3. Configure S3 backups (`deploy/backup-to-s3.sh` + cron) and/or EBS snapshots; schedule a
   monthly restore test.
4. Re-run the performance benchmark and a Lighthouse audit on the production server.
5. Commit the repository to Git/GitHub (the repository is initialised locally; no commits were
   made in this session).

## Known limitations

- Web dates are formatted with `NEXT_PUBLIC_TIME_ZONE` (build-time); it must match the
  institution time zone in Admin → Settings. Changing the zone requires rebuilding the web image.
- Sessions are attributed entirely to the local date on which they started (documented policy).
- Password-reset emails require SMTP; without it administrators reset passwords manually.
- No in-app notifications; reports are CSV only (no Excel/PDF), as scoped.
- Rate limits are in-memory per API process (fine for the single-instance architecture; a
  multi-instance deployment would need a shared store).
- The login page ships ~214 KB gzipped JavaScript (React/Next runtime + Zod for shared
  validation); acceptable for the target but could be reduced with `zod/mini` later.
- Erasing all data of one person is a manual database task (docs/PRIVACY.md).

## Known bugs

- None open. Environment notes: `tsx watch` ignores `--env-file-if-exists` (scripts use
  `--env-file`, so `.env` is required for development); on Windows Git Bash, use
  `MSYS_NO_PATHCONV=1` for commands with container paths and `--data-binary @file` for
  non-ASCII `curl` payloads.

## Commands

See README "Quick start", "Common commands" and docs/DEPLOYMENT.md.
