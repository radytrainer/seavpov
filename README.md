# Physical Book Reading Tracker

A web application that helps students build reading habits by tracking the **physical, printed
books** they read from the school library: books, timed reading sessions, pages read,
reflections, goals and streaks. Trainers review assigned students and give feedback;
administrators manage accounts, classes, categories, settings and reports.

> Scope: this system records the _activity_ of reading printed books. It does not provide
> e-books, PDFs, a digital library or any online reading content.

## Stack

| Layer    | Technology                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui-style components, Lucide, React Hook Form, Zod, Recharts |
| Backend  | Node.js 22, Fastify 5, Prisma 7 (pg adapter), Zod                                                                                 |
| Database | PostgreSQL 17                                                                                                                     |
| Tooling  | pnpm workspaces, Vitest, Playwright, ESLint, Prettier, Docker Compose                                                             |

Architecture: modular monolith — `apps/web`, `apps/api`, `packages/shared`.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js **22.12+** (`.nvmrc`), pnpm **11** (`corepack enable` or `npm i -g pnpm`)
- Docker with Compose v2+

## Quick start (local development)

```bash
cp .env.example .env              # local-only defaults; never commit .env
pnpm install
pnpm db:up                        # PostgreSQL on localhost:5440 (+ test database)
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # development data (see "Seed accounts")
pnpm dev                          # web: http://localhost:3000  api: http://localhost:4010
```

- API docs (OpenAPI / Swagger UI): http://localhost:4010/api/docs
- Health: http://localhost:4010/health and http://localhost:4010/health/ready

## Common commands

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `pnpm dev`          | Run API and web in watch mode                     |
| `pnpm build`        | Production builds of all packages                 |
| `pnpm typecheck`    | TypeScript checks (strict)                        |
| `pnpm lint`         | ESLint                                            |
| `pnpm format:check` | Prettier check (`pnpm format` to fix)             |
| `pnpm test`         | Unit + API integration tests (needs `pnpm db:up`) |
| `pnpm test:e2e`     | Playwright end-to-end tests (needs running app)   |
| `pnpm check`        | Format, lint, typecheck and test in one go        |

## Development vs production speed

`pnpm dev` compiles each page the first time it is opened and runs React in development mode,
so pages take ~0.3–1.5 s there. The production build is much faster (most pages 50–150 ms
server time). To use the app locally at full speed:

```bash
pnpm start:prod      # builds everything, then runs the API and web in production mode
```

Use `127.0.0.1` (not `localhost`) in `DATABASE_URL` and `API_INTERNAL_URL`: on Windows
`localhost` may try IPv6 first and add ~200 ms to every request.

## Repository layout

```
apps/api        Fastify API (modules/, plugins/, prisma/, test/)
apps/web        Next.js app (src/app routes, src/components, e2e/)
packages/shared Zod schemas, enums, timer/date helpers shared by both apps
infra/          Dockerfiles, nginx (domain template), Postgres init, backup scripts
deploy/         Server setup, Let's Encrypt, deploy and S3 backup scripts (AWS/Ubuntu)
docs/           Architecture, database, API, metrics, deployment and user guides
```

## Seed accounts (development only)

`pnpm db:seed` creates `admin`, `trainer1`, `trainer2` and `student1`…`student5`, all with the
password from `SEED_DEFAULT_PASSWORD` (default `Password123!`). trainer1 is assigned to
Class A (student1–3), trainer2 to Class B (student4–5). Never use these in production — see
docs/DEPLOYMENT.md for the first-administrator bootstrap.

## Documentation

| Document                                                            | Contents                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [PROJECT_STATUS.md](PROJECT_STATUS.md)                              | Phase status, test results, known limitations                                   |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                        | Design, conventions, key decisions (auth, timer state machine, midnight policy) |
| [docs/DATABASE.md](docs/DATABASE.md)                                | ERD, tables, constraints, retention, migrations                                 |
| [docs/API.md](docs/API.md) · [docs/openapi.json](docs/openapi.json) | REST API reference                                                              |
| [docs/METRICS.md](docs/METRICS.md)                                  | Exact definitions of streaks, consistency, goals                                |
| [docs/TESTING.md](docs/TESTING.md)                                  | How to test, final test report, performance results                             |
| [docs/DEPLOY_AWS.md](docs/DEPLOY_AWS.md)                            | **AWS EC2 deployment for pn-seavpov.store** (scripts in `deploy/`)              |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                            | Generic VPS deployment, TLS, backups/restore, rollback, checklist               |
| [docs/PRIVACY.md](docs/PRIVACY.md)                                  | Data protection and retention                                                   |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)                          | Administrator guide (CSV import, accounts, settings)                            |
| [docs/STUDENT_GUIDE.md](docs/STUDENT_GUIDE.md)                      | Student and trainer guide                                                       |

## Environment variables

All variables are documented inline in [.env.example](.env.example) (development) and
[.env.production.example](.env.production.example) (production). The API validates its
environment at start-up and refuses to start with invalid values (e.g. insecure cookies in
production).
