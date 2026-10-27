# API reference

- Base path: `/api/v1` (same origin as the web app in production; nginx routes it to the API).
- Machine-readable spec: [`docs/openapi.json`](openapi.json) (OpenAPI 3, generated from the route
  schemas with `pnpm --filter @rt/api openapi`). Interactive docs in development:
  `http://localhost:4010/api/docs` (disabled in production by `API_DOCS_ENABLED=false`).

## Conventions

| Topic          | Rule                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | `POST /auth/login` sets the `rt_session` HttpOnly cookie. All other endpoints require it unless noted.                                                                                                           |
| CSRF           | Every non-GET request must send `X-Requested-With: fetch`; a present `Origin` must equal `APP_ORIGIN`.                                                                                                           |
| Success        | `{ "data": … }`, lists add `"meta": { "page", "pageSize", "total" }` (`pageSize` ≤ 100).                                                                                                                         |
| Errors         | `{ "error": { "code", "message", "details?" } }`. Validation errors: `400 VALIDATION_ERROR` with `details: [{ path, message }]`.                                                                                 |
| Status codes   | 400 invalid input · 401 not signed in · 403 role not allowed / CSRF / password change required · 404 not found **or not yours** · 409 conflict (duplicate, invalid timer transition, overlap) · 429 rate limited |
| Dates          | Timestamps are ISO-8601 UTC. Calendar dates (`readingDate`, `from`, `to`) are `YYYY-MM-DD` in the institution time zone.                                                                                         |
| Durations      | Always computed by the server; any duration sent by a client is ignored.                                                                                                                                         |

## Endpoints

### Authentication — `/auth`

| Method    | Path                    | Role   | Notes                                                                                                                                                                                                                                                                        |
| --------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/auth/login`           | public | `identifier` = username, email or student ID. Rate limited per IP; account lockout after 5 failures.                                                                                                                                                                         |
| POST      | `/auth/logout`          | any    | Deletes the server session.                                                                                                                                                                                                                                                  |
| GET/PATCH | `/auth/me`              | any    | Current user; PATCH may change own `email`, `gender` only.                                                                                                                                                                                                                   |
| POST      | `/auth/change-password` | any    | Signs out other devices.                                                                                                                                                                                                                                                     |
| GET       | `/auth/registration`    | public | `{ enabled, institutionName, classes }` (classes only while registration is open).                                                                                                                                                                                           |
| POST      | `/auth/register`        | public | Student self-registration (`fullName`, `studentCode`, `classId`, `password`, optional `username`, `email`, `gender`; the username defaults to the student ID). `403 REGISTRATION_CLOSED` unless enabled; signs the student in and links them to the trainers of their class. |
| POST      | `/auth/forgot-password` | public | Always `202`; emails a 30-minute single-use link if SMTP is configured.                                                                                                                                                                                                      |
| POST      | `/auth/reset-password`  | public | `token`, `newPassword`.                                                                                                                                                                                                                                                      |

### Books

| Method | Path                        | Role    | Notes                                                                                                              |
| ------ | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/categories`               | any     | Active categories.                                                                                                 |
| GET    | `/library-books`            | any     | Catalog search (`search`, `categoryId`, `status` for admins).                                                      |
| GET    | `/library-books/:id`        | any     |                                                                                                                    |
| POST   | `/library-books`            | any     | Students create `PENDING` entries; `409 DUPLICATE_BOOK` returns the existing entry.                                |
| PATCH  | `/library-books/:id`        | admin   | Edit, approve (`status`), archive.                                                                                 |
| POST   | `/library-books/:id/merge`  | admin   | Move student records to `targetId` and archive the duplicate.                                                      |
| GET    | `/student-books`            | any     | Own books (students) or `studentId` for authorised trainers/admins; `status`, `categoryId`, `search`, `sort=recent | title | started`, `archived`. |
| POST   | `/student-books`            | student | `libraryBookId` **or** `newBook`; `409 ALREADY_TRACKING`.                                                          |
| GET    | `/student-books/:id`        | any     | Includes `stats` and `activeSessionId`.                                                                            |
| PATCH  | `/student-books/:id`        | owner   | `currentPage`, `totalPages` override, `notes`, `archived`.                                                         |
| PATCH  | `/student-books/:id/status` | owner   | Sets start/completion dates automatically.                                                                         |

### Reading sessions — `/reading-sessions`

| Method | Path                                                  | Role    | Notes                                                                                                                    |
| ------ | ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/reading-sessions`                                   | any     | History (`studentId`, `studentBookId`, `from`, `to`, `source`, `includeCancelled`).                                      |
| GET    | `/reading-sessions/active`                            | student | Restores the timer; includes `meta.serverNow`.                                                                           |
| GET    | `/reading-sessions/:id`                               | any     |                                                                                                                          |
| POST   | `/reading-sessions/start`                             | student | `409 ACTIVE_SESSION_EXISTS` (with `sessionId`) if one is running.                                                        |
| POST   | `/reading-sessions/:id/pause` · `/resume` · `/cancel` | owner   | `409 INVALID_TRANSITION` otherwise.                                                                                      |
| POST   | `/reading-sessions/:id/finish`                        | owner   | `endPage`, `note`, `markBookCompleted`; updates the book in the same transaction.                                        |
| POST   | `/reading-sessions/manual`                            | student | `startedAt`, `endedAt`; `409 SESSION_OVERLAP` lists overlapping sessions.                                                |
| PATCH  | `/reading-sessions/:id`                               | owner   | Pages and note; times only for manual sessions (audited).                                                                |
| POST   | `/reading-sessions/:id/void`                          | admin   | `reason` (5–300 chars). Excludes the session from all metrics (kept as `CANCELLED`); reason and previous values audited. |

### Reflections — `/reflections`

| Method    | Path                                    | Role                           | Notes                                                                                                                                                                                                         |
| --------- | --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/reflections`                          | any                            | `search`, `studentBookId`, `studentId`, `classId`, `tag`, `from`, `to`, `needsFeedback`.                                                                                                                      |
| POST      | `/reflections`                          | student                        | One per completed session (`409 REFLECTION_EXISTS`).                                                                                                                                                          |
| GET/PATCH | `/reflections/:id`                      | owner (PATCH)                  |                                                                                                                                                                                                               |
| GET       | `/reflections/:id/pdf`                  | owner, assigned trainer, admin | One reflection as a formatted PDF (attachment). Staff downloads are audited.                                                                                                                                  |
| GET       | `/reflections/export.pdf`               | any                            | All reflections of a student as one PDF (summary page + one section per reflection). Students: their own; trainers/admins: `studentId` required. Optional `from`, `to`, `studentBookId`. Max 200 reflections. |
| POST      | `/reflections/:id/feedback`             | trainer (assigned), admin      |                                                                                                                                                                                                               |
| PATCH     | `/reflections/:id/feedback/:feedbackId` | feedback author                |                                                                                                                                                                                                               |

### Goals and analytics

| Method   | Path                        | Role    | Notes                                      |
| -------- | --------------------------- | ------- | ------------------------------------------ |
| GET/POST | `/reading-goals`            | student | POST sets the goal effective today.        |
| PATCH    | `/reading-goals/:id`        | owner   |                                            |
| GET      | `/analytics/me`             | student | Dashboard summary (see `docs/METRICS.md`). |
| GET      | `/analytics/reading-trends` | any     | `from`, `to`, `granularity=day             | week | month`; `studentId` for trainers/admins. |

### Trainer — `/trainer` (trainers: assigned students; admins: all)

`GET /trainer/overview`, `GET /trainer/filters`, `GET /trainer/students` (`search`, `classId`,
`generationId`, `from`, `to`, `inactiveOnly`, `unassigned`, `accountStatus=ACTIVE|INACTIVE|ALL`;
rows include `metrics` and `trainers`), `GET /trainer/students/:id/summary`.

### Reports — `/trainer/reports`, `/admin/reports`

`GET …/reports` lists types; `GET …/reports/:type?format=csv|json` with `from`, `to`, `classId`,
`generationId`, `studentId`, `includeInactiveAccounts`. Types: `student-summary`, `daily-activity`, `period-summary` (`granularity=week|month`),
`sessions` (needs `studentId`), `inactive-students`, `reflections` (counts only), `book-completion`.

### Administration — `/admin` (admins only)

`/admin/overview`; `/admin/users` (GET with `role`, `status`, `classId`, `search`, `unassigned`; POST, `GET|PATCH /:id`, `POST /:id/reset-password`);
`/admin/users/import` (`csv`, `dryRun`); `/admin/trainers/:id/students` (GET, POST,
`DELETE /:studentId`); `/admin/generations`, `/admin/classes`, `/admin/categories` (GET, POST,
PATCH incl. `archived`); `/admin/settings` (GET, PATCH; includes `selfRegistrationEnabled`); `/admin/audit-logs`.

### Health (internal network only)

`GET /health` (process) and `GET /health/ready` (database).
