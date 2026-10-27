# Database

PostgreSQL 17, managed with Prisma 7 migrations (`apps/api/prisma`). Conventions: snake_case
tables and columns, UUID primary keys, `timestamptz` stored in UTC, `created_at`/`updated_at`
on mutable tables. Source of truth: `apps/api/prisma/schema.prisma` plus the extra SQL at the
end of `prisma/migrations/20261027041917_init/migration.sql`.

## Entity–relationship diagram

```mermaid
erDiagram
  generations ||--o{ classes : contains
  classes ||--o{ users : "students in"
  users ||--o{ auth_sessions : "signed-in devices"
  users ||--o{ password_reset_tokens : ""
  users ||--o{ trainer_student_assignments : "as trainer"
  users ||--o{ trainer_student_assignments : "as student"
  book_categories ||--o{ library_books : categorises
  users ||--o{ library_books : "submitted by"
  library_books ||--o{ student_books : "tracked as"
  users ||--o{ student_books : owns
  student_books ||--o{ reading_sessions : has
  users ||--o{ reading_sessions : records
  reading_sessions ||--o| reading_reflections : "reflected in"
  reading_reflections ||--o{ reflection_tag_assignments : ""
  reflection_tags ||--o{ reflection_tag_assignments : ""
  reading_reflections ||--o{ trainer_feedback : receives
  users ||--o{ trainer_feedback : "written by trainer"
  users ||--o{ reading_goals : sets
  users ||--o{ audit_logs : "actor of"

  users { uuid id PK; enum role; enum status; varchar username UK; varchar email UK; varchar student_code UK; varchar full_name; uuid class_id FK; text password_hash }
  library_books { uuid id PK; varchar title; varchar author; varchar normalized_key; varchar isbn UK; varchar library_code UK; int total_pages; enum status }
  student_books { uuid id PK; uuid student_id FK; uuid library_book_id FK; enum status; int current_page; int total_pages; timestamptz started_at; timestamptz completed_at; timestamptz archived_at }
  reading_sessions { uuid id PK; uuid student_id FK; uuid student_book_id FK; enum source; enum status; timestamptz started_at; timestamptz ended_at; timestamptz last_resumed_at; int duration_seconds; date reading_date; int start_page; int end_page }
  reading_reflections { uuid id PK; uuid session_id FK; uuid student_id FK; varchar learned; smallint understanding_rating }
  reading_goals { uuid id PK; uuid student_id FK; int daily_minutes; int weekly_minutes; smallint days_per_week; date effective_from }
  system_settings { int id PK; varchar time_zone; int min_daily_minutes; int max_session_minutes }
  audit_logs { uuid id PK; uuid actor_id FK; varchar action; varchar entity_type; jsonb metadata; timestamptz created_at }
```

## Tables

| Table                                           | Purpose                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                         | Students, trainers, administrators. Lower-cased `username`/`email`, upper-cased `student_code`, Argon2id `password_hash`, lockout counters. |
| `auth_sessions`                                 | Server-side sessions; only the SHA-256 of the cookie token is stored.                                                                       |
| `password_reset_tokens`                         | Single-use, hashed, 30-minute reset tokens.                                                                                                 |
| `generations`, `classes`                        | Organisation; a class belongs to a generation (unique name per generation). Archived, never deleted.                                        |
| `trainer_student_assignments`                   | Which trainer may see which student (unique pair).                                                                                          |
| `book_categories`                               | Category list (archivable).                                                                                                                 |
| `library_books`                                 | Shared catalog of physical books; `normalized_key` (title + author) for duplicate detection; `PENDING` entries come from students.          |
| `student_books`                                 | A student's personal record of one catalog book (unique per student + book).                                                                |
| `reading_sessions`                              | Timed (`TIMER`) or manual (`MANUAL`) reading sessions; server-computed `duration_seconds`; `reading_date` = local start date.               |
| `reading_reflections`                           | One reflection per session.                                                                                                                 |
| `reflection_tags`, `reflection_tag_assignments` | Normalised tags.                                                                                                                            |
| `trainer_feedback`                              | Feedback on reflections.                                                                                                                    |
| `reading_goals`                                 | Goal history; latest `effective_from ≤ date` is current.                                                                                    |
| `system_settings`                               | Single row (`id = 1`) of institution settings, including `self_registration_enabled` (default false).                                       |
| `audit_logs`                                    | Administrative actions and session edits (no passwords, tokens or reflection text).                                                         |

## Constraints beyond Prisma

- `reading_sessions_one_active_per_student`: partial unique index on `student_id` where
  `status IN ('READING','PAUSED')` — prevents two running timers even under concurrent requests.
- CHECK constraints: non-negative durations and pages, `end_page ≥ start_page`,
  `ended_at ≥ started_at`, completed/cancelled sessions have `ended_at`, `last_resumed_at` set iff
  `READING`, rating 1–5, goal and settings ranges, singleton settings row, trainer ≠ student.

## Indexes (main query paths)

`reading_sessions (student_id, reading_date)`, `(student_id, status)`, `(student_book_id)`,
`(reading_date)`; `student_books (student_id, status)`, `(student_id, last_read_at)`;
`users (role, status)`, `(class_id)`; `library_books (normalized_key)`, `(category_id)`, `(status)`;
`audit_logs (created_at)`, `(entity_type, entity_id)`, `(actor_id)`. Query plans were checked
with `EXPLAIN ANALYZE` on 25k sessions (see `docs/TESTING.md`).

## Deletion behaviour and history retention

- Records are **archived or deactivated, not deleted**: users (`status = INACTIVE`), classes,
  generations, categories, catalog books and student books (`archived_at`).
- Foreign keys from reading data to users and books use `RESTRICT`, so history cannot be removed
  accidentally. Reflections, tags and feedback cascade only from their parent reflection/session.
- Discarded timer sessions are kept with `status = CANCELLED` and excluded from all metrics.
- Expired auth sessions are deleted at the user's next login; used reset tokens are kept for
  audit and removed when the user is deleted.

## Migrations and seed data

- Every schema change is a committed migration (`pnpm db:migrate` in development creates one;
  production runs `prisma migrate deploy` on start).
- `prisma/seed.ts` — development data only (refuses to run with `NODE_ENV=production`).
- `prisma/seed-production.ts` — creates the settings row and the first administrator only.
- `scripts/seed-perf.ts` — synthetic data for performance tests (requires a `*perf*` database).
- Integration tests use the separate `reading_tracker_test` database and truncate it per test.
