# CodeArena

A full-stack competitive programming platform: register, browse problems, submit solutions,
compete in timed contests, and watch live rankings. See [`PRD.md`](./PRD.md) for the full product
requirements and [`PROGRESS.md`](./PROGRESS.md) for the milestone build plan.

**Status: Milestone 1 — Foundation.** Authentication, the monorepo, and Docker Compose are in
place. Problems, submissions, judging, and contests arrive in later milestones (see
[`PROGRESS.md`](./PROGRESS.md)).

## Stack

- **Web**: Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query
- **API**: Node.js, Express, TypeScript, Zod, Prisma
- **Data**: PostgreSQL (source of truth), Redis (cache/rate limiting, wired but not yet used for
  real work)
- **Infra**: Docker Compose, GitHub Actions

## Repository structure

```text
codearena/
  apps/
    web/            Next.js frontend
    api/             Express API
    judge-worker/     empty — added in Milestone 3
  packages/
    database/         Prisma schema, migrations, seed script
    shared/            Types and Zod schemas shared by web and api
    config/            Environment-variable validation
  infrastructure/
    docker/            Dockerfiles for web and api
  docker-compose.yml
```

## Prerequisites

- Node.js 20+
- Docker and Docker Compose

## Quick start (Docker Compose)

```bash
cp .env.example .env          # adjust secrets for anything beyond local dev
docker compose up --build     # starts postgres, redis, migrate, api, web
docker compose run --rm seed  # one-off: seeds an admin, two contestants, six problems, one contest
```

- Web: http://localhost:3000
- API: http://localhost:4000 (health: `/health`, readiness: `/ready`)

Seeded accounts (password is `SEED_PASSWORD` from `.env`, default `ChangeMe123!`):

| Email               | Role       |
| ------------------- | ---------- |
| admin@codearena.dev | ADMIN      |
| alice@codearena.dev | CONTESTANT |
| bob@codearena.dev   | CONTESTANT |

Stop everything with `docker compose down` (add `-v` to also drop the Postgres volume).

## Local development without full-container rebuilds

Run Postgres and Redis in Docker, everything else on the host for fast iteration:

```bash
cp .env.example .env
# In .env, point DATABASE_URL / REDIS_URL at localhost instead of the service names:
#   DATABASE_URL=postgresql://codearena:codearena@localhost:5432/codearena
#   REDIS_URL=redis://localhost:6379

docker compose up -d postgres redis
npm install
npm run db:migrate
npm run db:seed

npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000
```

## Common commands

| Command                           | Description                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                    | ESLint across the monorepo                                                                                                          |
| `npm run format`                  | Check Prettier formatting                                                                                                           |
| `npm run typecheck`               | Build workspace packages, then type-check every app                                                                                 |
| `npm run test`                    | Run unit/integration tests (auth integration tests are skipped unless `DATABASE_URL`/`REDIS_URL` point at a running Postgres/Redis) |
| `npm run build`                   | Production build of all packages and apps                                                                                           |
| `npm run db:generate`             | Regenerate the Prisma client                                                                                                        |
| `npm run db:migrate`              | Apply Prisma migrations                                                                                                             |
| `npm run db:seed`                 | Seed the database                                                                                                                   |
| `docker compose up --scale api=3` | Run 3 API replicas (relevant once workers/queues arrive in Milestone 3)                                                             |

## Environment variables

See [`.env.example`](./.env.example) for the full list. Notable ones:

| Variable                                   | Purpose                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Postgres connection string                                                                              |
| `REDIS_URL`                                | Redis connection string                                                                                 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Must be ≥32 characters; generate real ones with `openssl rand -base64 48` for anything beyond local dev |
| `ACCESS_TOKEN_TTL_SECONDS`                 | Access token lifetime (default 900s)                                                                    |
| `REFRESH_TOKEN_TTL_DAYS`                   | Refresh token lifetime (default 30 days)                                                                |
| `CORS_ORIGIN`                              | Origin allowed to call the API with credentials                                                         |

The API refuses to start if any required variable is missing or invalid (`packages/config`).

## Authentication design

- Passwords hashed with bcrypt (12 rounds).
- Access tokens are short-lived JWTs, returned in the response body and kept in memory on the
  client (never `localStorage`), to limit exposure if a script-injection bug is ever found.
- Refresh tokens are high-entropy random values, stored server-side as a SHA-256 hash in
  `refresh_tokens`, and set as an `httpOnly`, `SameSite=Lax` cookie scoped to `/api/v1/auth`.
- Every refresh **rotates** the token: the presented token is revoked and a new one issued, so a
  replayed old token is rejected.
- Login/registration failures return generic messages — the API never confirms whether an email is
  registered.

## Testing

- `apps/api/src/auth.test.ts` — Vitest + Supertest integration tests for register/login/refresh
  rotation/logout/me, run against a real Postgres and Redis. They no-op (via `describe.skip`) if
  `DATABASE_URL`/`REDIS_URL` aren't set, so `npm test` doesn't fail in environments without those
  services running.
- Run them locally with `docker compose up -d postgres redis` then `npm run test -w apps/api`.

## CI

`.github/workflows/ci.yml` installs dependencies, checks formatting, lints, runs migrations against
a Postgres/Redis service container, type-checks, tests, builds every package/app, and builds both
Docker images. No secrets are embedded — CI uses throwaway dev-only credentials.

## Known limitations at this milestone

- No problems/submissions UI, judge workers, queues, contests, or WebSocket updates yet — see
  `PROGRESS.md` for the day-by-day plan.
- `apps/judge-worker` is an empty placeholder until Milestone 3.
- Rate limiting is wired for login/register only; general and submission-specific limits arrive
  with the submissions API in Milestone 2.
- No load tests or benchmark scripts yet (Milestone 5).
