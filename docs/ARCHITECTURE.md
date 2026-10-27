# Architecture

## 1. Scope

The Physical Book Reading Tracker records **the activity of reading printed books** from the
school library. Students log books, time reading sessions, write reflections and set goals.
Trainers review assigned students. Administrators manage accounts, classes, categories,
settings and reports.

### Non-goals (explicitly out of scope)

- Online/e-book/PDF/EPUB reading, digital libraries, book file uploads, streaming content.
- AI summaries, automated grading, public leaderboards or rankings.
- Microservices, Kubernetes, Redis, message queues (single modular monolith is sufficient for a
  small-to-medium institution).
- In-app notifications (not required for the MVP; can be added later).
- Excel/PDF exports (CSV only for the initial release).

## 2. System overview

```text
 Browser ──HTTPS──► Nginx (TLS, gzip, security headers)
                       │
                       ├──► web  (Next.js, App Router, port 3000)
                       │       └─ rewrites /api/v1/* ──► api
                       └──► api  (Fastify, port 4010, /api/v1, /health)
                                   └──► PostgreSQL 17 (Prisma ORM, pooled)
```

- The browser only talks to **one origin**. Next.js proxies `/api/v1/*` to the API, so the
  session cookie is first-party, `SameSite=Lax`, `HttpOnly`, `Secure` in production.
- Server Components call the API over the internal network (`API_INTERNAL_URL`) and forward the
  incoming cookie. Client Components call the same-origin `/api/v1` paths for mutations, then
  call `router.refresh()` to re-render server data.
- `packages/shared` holds Zod schemas, enums and pure calculation helpers (durations, streaks,
  date-in-timezone utilities) used by both apps, so validation rules are defined once.

## 3. Repository layout

```text
apps/
  api/                Fastify REST API
    prisma/           schema.prisma, migrations/, seed scripts
    src/
      app.ts          buildApp() – plugins, error handler, route registration
      server.ts       process entry point (listen, graceful shutdown)
      config/         env validation (Zod)
      plugins/        prisma, auth (session cookie), csrf, rate limit, swagger
      lib/            errors, pagination, audit, password hashing, time helpers
      modules/<name>/ routes.ts (thin HTTP layer) + service.ts (business logic)
    test/             integration tests (real PostgreSQL test database)
  web/                Next.js frontend
    src/app/          routes: (auth)/login, (student)/..., trainer/..., admin/...
    src/components/   ui/ (design-system primitives), feature components
    src/lib/          api client (server + browser), formatting helpers
    e2e/              Playwright tests
packages/
  shared/             Zod schemas, enums, metric/timer helpers + unit tests
infra/                Dockerfiles, nginx config, backup scripts, Postgres init
docs/                 architecture, ERD, API, metrics, deployment, guides
```

Modules: `auth`, `users` (admin), `classes`, `generations`, `categories`, `library-books`,
`student-books`, `reading-sessions`, `reflections`, `goals`, `analytics`, `trainer`, `reports`,
`settings`, `audit`.

## 4. Conventions

- TypeScript `strict` everywhere; no `any` in application code.
- Database: snake_case tables/columns (Prisma `@@map`/`@map`), UUID primary keys, UTC
  `timestamptz` timestamps, `created_at`/`updated_at` on mutable tables.
- API: JSON, versioned under `/api/v1`. Success → `{ data, meta? }`. Error →
  `{ error: { code, message, details? } }`. Lists accept `page`, `pageSize` (max 100) and
  return `meta: { page, pageSize, total }`.
- Route handlers stay thin: parse with Zod → call service → return. Authorization helpers
  (`requireRole`, ownership checks inside services) never trust IDs/roles from the client.
- Errors: services throw `AppError(status, code, message)`; one central Fastify error handler
  maps Zod, Prisma and AppErrors to the error shape and never leaks stack traces or SQL.
- Logging: pino (Fastify default) with redaction of `authorization`, `cookie`, `password*`,
  `token`, and reflection text fields.
- Formatting: Prettier; linting: ESLint flat config with typescript-eslint.

## 5. Key design decisions

### Authentication

- Opaque random 256-bit session token in an `HttpOnly` cookie; only its SHA-256 hash is stored
  in `auth_sessions`, so sessions are revocable (logout, deactivation, password change).
- Passwords hashed with **Argon2id** (`@node-rs/argon2`, prebuilt binaries).
- Login accepts username, email or student ID. Generic error message for every failure;
  a dummy hash verification runs for unknown users to reduce timing-based enumeration.
- Brute force: per-account temporary lockout (5 failures → 15 minutes) plus a per-IP limit on
  credential endpoints (`AUTH_RATE_LIMIT_PER_MINUTE`, default 30 — students in one school often
  share a NAT address). Other API traffic is limited per session (per IP when signed out),
  `GLOBAL_RATE_LIMIT_PER_MINUTE`, default 600; nginx adds a coarse per-IP limit.
- CSRF: `SameSite=Lax` cookie **and** a required `X-Requested-With: fetch` header on every
  state-changing request (cross-site forms cannot set custom headers) **and** an Origin check
  against `APP_ORIGIN` when the header is present.
- Password reset: single-use, hashed, 30-minute token. Delivered by SMTP when configured;
  administrators can also issue a temporary password that must be changed at next login.

### Reading timer state machine

States per session: `READING`, `PAUSED`, `COMPLETED`, `CANCELLED`. A student with no
`READING`/`PAUSED` session is `IDLE`.

| From    | Action | To        |
| ------- | ------ | --------- |
| IDLE    | start  | READING   |
| READING | pause  | PAUSED    |
| PAUSED  | resume | READING   |
| READING | finish | COMPLETED |
| PAUSED  | finish | COMPLETED |
| READING | cancel | CANCELLED |
| PAUSED  | cancel | CANCELLED |

Anything else returns `409 INVALID_TRANSITION`.

- Persisted fields: `started_at`, `last_resumed_at` (null while paused), `duration_seconds`
  (accumulated completed segments), `ended_at`. Live elapsed =
  `duration_seconds + (now − last_resumed_at)` while `READING`. All timestamps come from the
  server clock; the browser never sends a duration.
- One active session per student is enforced by a **partial unique index**
  (`student_id WHERE status IN ('READING','PAUSED')`), so concurrent duplicate "start" requests
  cannot both succeed.
- Transitions use conditional updates (`UPDATE … WHERE id = ? AND status = ?`) inside a
  transaction, so double-clicked pause/finish requests are rejected instead of double-counted.
- Finishing updates the student book (current page, status, `last_read_at`) in the **same
  transaction**.
- Sessions longer than `max_session_minutes` (default 240) are capped and flagged
  `duration_capped`, which keeps a forgotten timer from inflating metrics.

### Midnight / date-boundary policy

Each session stores `reading_date`: the local calendar date (institution time zone, default
`Asia/Phnom_Penh`) on which the session **started**. A session from 23:40 to 00:20 counts fully
toward the start date. This keeps a session atomic (no double counting, simple streaks) and is
stable even if the time-zone setting changes later.

### Manual sessions

`source = MANUAL`, with student-provided start and end times. The server computes the duration and
validates it: end after start, not in the future, at most `manual_entry_max_days` back, and no longer
than the max session length. A manual session that **overlaps** an existing non-cancelled session is
rejected with `409 SESSION_OVERLAP`, and the overlapping sessions are listed so the UI can warn.
Edits are audited.

### Catalog vs personal record

`library_books` is the shared physical-book catalog. `student_books` is a student's personal
reading record (status, current page, dates) referencing a catalog entry; unique per
(student, library book). Students may select an existing catalog book or submit a new entry,
which is created with `status = PENDING` and usable immediately; administrators approve, edit
or merge entries. Duplicate detection: exact ISBN / library code, or normalized title + author.

### Analytics

Computed on demand with SQL aggregates over indexed `reading_sessions(student_id,
reading_date)` and COMPLETED sessions only. No stored totals. Metric definitions live in
`docs/METRICS.md`; pure calculation helpers in `packages/shared` are unit-tested.
Single-student views use per-day totals plus those helpers; multi-student views (trainer
overview, reports) compute streaks and range totals in SQL (`habitStatsFor`, one row per
student), and a test checks that both implementations agree.

## 6. Deployment

See `docs/DEPLOYMENT.md`: Docker images (`infra/docker`), `docker-compose.prod.yml` (nginx TLS
proxy routing `/api/v1` to the API and everything else to Next.js, PostgreSQL without public
ports, daily verified `pg_dump` backups, log rotation, health checks, restart policies).

## 7. Data retention and privacy (summary)

- Prefer archive/deactivate over delete; historical sessions and reflections are preserved.
- Reflection text is visible only to the owning student, their assigned trainers and admins;
  it is never written to logs or audit metadata, and reports export counts, not text, unless
  the requesting role is authorized.
- Full policy: `docs/PRIVACY.md`.
