# Testing and final test report

## How to run

```bash
pnpm db:up                 # PostgreSQL (dev + test databases)
pnpm test                  # shared unit, web unit, API integration (uses reading_tracker_test)
pnpm lint && pnpm typecheck && pnpm format:check

# End-to-end (needs the dev stack with the development seed):
pnpm db:seed && pnpm dev   # in another terminal
pnpm --filter @rt/web exec playwright install chromium   # first time only
pnpm test:e2e              # desktop + mobile (Pixel 7) projects
```

The API integration tests build the real Fastify app against a real PostgreSQL test database
(migrations applied by `test/global-setup.ts`, tables truncated per test). Time-dependent tests
inject a controllable server clock. Local E2E runs sign in many times from one IP, so the local
`.env` sets `AUTH_RATE_LIMIT_PER_MINUTE=200` (production default: 30).

## Suites

| Suite           | Location                        | Tests | Covers                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit     | `packages/shared/src/*.test.ts` | 27    | Timer state machine, elapsed time, time-zone dates, month/year/leap boundaries, streaks, consistency, goal %, series                                                                                                                                                        |
| Web unit        | `apps/web/src/lib/*.test.ts`    | 4     | Open-redirect guard, role home pages, query building                                                                                                                                                                                                                        |
| API integration | `apps/api/test/*.test.ts`       | 123   | Health/CSRF, auth & lockout & rate limit & reset, RBAC, books & catalog, timer & manual sessions, reflections & feedback, analytics & goals, trainer & reports & CSV safety, admin & CSV import & settings & audit, self-registration, SQL-vs-TypeScript metric equivalence |
| End-to-end      | `apps/web/e2e/*.spec.ts`        | 15    | Browser workflows for all roles, axe accessibility checks, mobile layout                                                                                                                                                                                                    |

## Required scenarios → evidence

| #   | Scenario                                     | Verified by                                                                      |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Student logs in                              | E2E `auth`; API `auth.test`                                                      |
| 2   | Logout blocks protected pages                | E2E `auth`; API `auth.test`                                                      |
| 3   | Add a physical library book                  | E2E `student-flow`; API `books.test`                                             |
| 4   | Start a session                              | E2E `student-flow`; API `sessions.test`                                          |
| 5   | Pause and resume                             | E2E (paused clock does not advance); API (paused time excluded)                  |
| 6   | Refresh while reading                        | E2E (reload keeps timer); API (`/active` elapsed from persisted state, re-login) |
| 7   | Finish with correct duration                 | E2E (3–9 s window); API (exact seconds with injected clock)                      |
| 8   | Record pages read                            | E2E (`pagesRead = 12`); API (progress updated in same transaction)               |
| 9   | Write and edit a reflection                  | E2E (Khmer + English); API `reflections.test`                                    |
| 10  | History and analytics                        | E2E (pages + axe); API `analytics.test` (hand-computed values)                   |
| 11  | No access to others' book/session/reflection | E2E `access`; API (404 for read/update/actions)                                  |
| 12  | Trainer reviews assigned students            | E2E `access`, `admin-trainer`; API `trainer.test`                                |
| 13  | Trainer blocked from unassigned student      | E2E `access`; API `trainer.test`, `reflections.test`                             |
| 14  | Admin imports valid CSV                      | E2E `admin-trainer`; API `admin.test`                                            |
| 15  | Invalid CSV gives clear errors               | E2E (row/column/problem table); API (each error type, nothing created)           |
| 16  | Duplicate requests don't duplicate sessions  | E2E (2 parallel starts); API (5 parallel starts, double pause/finish)            |
| 17  | Invalid timestamps/pages rejected            | E2E; API (future, too old, too long, reversed, malformed, out of range)          |
| 18  | Empty data and month boundaries              | API `analytics.test`; shared `metrics.test`, `dates.test`                        |
| 19  | Restart keeps committed data                 | Production stack `down` + `up` (docs/DEPLOYMENT.md verification record)          |
| 20  | Backup can be restored                       | `backup.sh` → `restore.sh` into separate DB, counts match (same record)          |

Self-registration (closed by default, student-only role, uniqueness, valid class, automatic
trainer linking, immediate close, audit) is covered by `registration.test.ts` and the E2E
`registration` spec; inline trainer feedback by the E2E `admin-trainer` spec; administrative session voiding and the
weekly/monthly summary report by `sessions.test.ts`, `trainer.test.ts` and the E2E
`admin-void` spec.

Reflection PDFs (access rules, audit, multi-page Khmer/English text, date ranges) are covered by
`reflections-pdf.test.ts` and the E2E `admin-users` spec; Khmer shaping in PDFs was verified
visually against browser rendering (pdfkit uses a patched fontkit, see `patches/`).

Additional edge cases found and tested: session crossing midnight, forgotten-timer cap, manual
entry overlapping a running timer, back-dated entries not reducing progress, CSV formula
injection, BOM/quoted CSV parsing, settings cache invalidation, chart focus inside `aria-hidden`.

## Final results (2026-10-27)

| Check                                                                                                                                                          | Result                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Shared unit tests                                                                                                                                              | 27 / 27 passed           |
| Web unit tests                                                                                                                                                 | 4 / 4 passed             |
| API integration tests                                                                                                                                          | 123 / 123 passed         |
| E2E (Playwright, Chromium desktop + Pixel 7)                                                                                                                   | 15 / 15 passed           |
| Accessibility (axe, WCAG 2 A/AA, serious/critical) on login, registration, dashboard, history, analytics, CSV import, trainer students and student reflections | 0 violations             |
| TypeScript strict, ESLint, Prettier                                                                                                                            | pass                     |
| `next build`, API bundle, Docker images                                                                                                                        | pass                     |
| `pnpm audit` (all dependencies)                                                                                                                                | no known vulnerabilities |
| Production stack smoke test, restart persistence, backup/restore                                                                                               | pass                     |

## Performance

**Conditions:** local development laptop (Windows 11, Docker Desktop PostgreSQL 17), production
API bundle (`NODE_ENV=production`, pool 10), dataset of 305 students in 9 classes, 25 263
sessions over 120 days, trainer assigned to 303 students. 200 requests per endpoint at
concurrency 10 after 20 warm-up requests (`apps/api/scripts/perf.mjs`; rate limits raised for the
benchmark). These are local measurements, not production guarantees; re-measure on the OVHcloud
server.

| Endpoint                                                     | p50 ms | p95 ms |
| ------------------------------------------------------------ | ------ | ------ |
| `GET /auth/me`                                               | 61     | 89     |
| `GET /reading-sessions/active`                               | 45     | 63     |
| `GET /student-books`                                         | 49     | 63     |
| `GET /reading-sessions`                                      | 50     | 69     |
| `GET /reflections`                                           | 47     | 85     |
| `GET /analytics/me` (dashboard)                              | 55     | 70     |
| `GET /analytics/reading-trends` (12 months)                  | 38     | 49     |
| `GET /trainer/students` (25 of 303)                          | 69     | 84     |
| `GET /trainer/overview` (303 students)                       | 235    | 324    |
| `GET /admin/users`                                           | 49     | 58     |
| `GET /admin/reports/student-summary` (303 students, 30 days) | 266    | 348    |

Targets: common operations p95 < 300 ms ✔; dashboard p95 < 500 ms ✔.
The first measurement showed `/trainer/overview` at 1.9 s p95: per-day rows for every student
were loaded and aggregated in Node. Habit statistics are now computed in SQL (one row per
student, `habitStatsFor`), verified equal to the TypeScript rules by `habit-stats.test.ts`.
`EXPLAIN ANALYZE` of the per-student daily aggregate over 25k sessions: 33 ms (bitmap index scan
on `reading_sessions(student_id, status)`).

**Frontend** (production `next start`, Chromium, local): login page 214 KB JS gzip
(React/Next runtime ≈ 113 KB, Zod ≈ 46 KB); charts (Recharts) load only on dashboard/analytics
pages. Largest Contentful Paint 130–760 ms, Cumulative Layout Shift 0.000 on all measured pages.
A formal Lighthouse run should be done on the production server.
