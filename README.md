# CodeArena

A full-stack competitive programming platform: register, browse problems, submit solutions,
compete in timed contests, and watch live rankings. See [`PRD.md`](./PRD.md) for the full product
requirements and [`PROGRESS.md`](./PROGRESS.md) for the milestone build plan.

**Status: Milestone 2 — Problems and submissions.** Authentication, the problem catalog/workspace,
and the submission pipeline (API → BullMQ → worker → verdict → history) are in place. Real
per-language code execution and contests arrive in later milestones (see
[`PROGRESS.md`](./PROGRESS.md)).

## Stack

- **Web**: Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query, Monaco Editor
- **API**: Node.js, Express, TypeScript, Zod, Prisma, BullMQ
- **Judge worker**: Node.js, TypeScript, BullMQ consumer (see [Judging](#judging) below)
- **Data**: PostgreSQL (source of truth), Redis (queue, caching, rate limiting)
- **Infra**: Docker Compose, GitHub Actions

## Repository structure

```text
codearena/
  apps/
    web/               Next.js frontend
    api/                Express API
    judge-worker/        BullMQ consumer that judges submissions
  packages/
    database/            Prisma schema, migrations, seed script
    shared/               Types and Zod schemas shared across apps
    config/               Environment-variable validation
  infrastructure/
    docker/               Dockerfiles for web, api, and judge-worker
  docker-compose.yml
```

## Prerequisites

- Node.js 20+
- Docker and Docker Compose

## Quick start (Docker Compose)

```bash
cp .env.example .env          # adjust secrets for anything beyond local dev
docker compose up --build     # starts postgres, redis, migrate, api, judge-worker, web
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

npm run dev:api     # http://localhost:4000
npm run dev:worker  # judges submissions in the background
npm run dev:web     # http://localhost:3000
```

## Problems and submissions

- `GET /api/v1/problems` / `GET /api/v1/problems/:slug` are public and return only sample tests —
  hidden tests never leave the API.
- `POST /api/v1/problems` / `PATCH /api/v1/problems/:id` require the `ADMIN` role.
- `POST /api/v1/submissions` validates the problem/language, inserts a `QUEUED` row in Postgres,
  and enqueues a BullMQ job carrying only the submission ID (never source code or test data — the
  worker re-reads both from Postgres, which stays authoritative).
- `GET /api/v1/submissions/:id` is owner-or-admin only. `GET /api/v1/users/me/submissions` lists
  the caller's own history, paginated.

## Judging

`apps/judge-worker` consumes the `submissions` BullMQ queue. Per PRD §12, no submission is ever
executed outside a Docker sandbox — and that sandbox doesn't exist until Milestone 3 — so the
current worker uses a **documented placeholder evaluator**
(`apps/judge-worker/src/mockEvaluator.ts`) that does not run submitted code at all. It exists to
exercise the full pipeline (queue → `RUNNING` → verdict → `SubmissionResult` rows → history) end
to end before real execution lands. Submissions default to `ACCEPTED`; a source can opt into a
different verdict for demos/tests via a first-line directive, e.g.
`// CODEARENA_VERDICT: WRONG_ANSWER`. `runtimeMs`/`memoryKb` stay `null` until Milestone 3 actually
measures them.

Queue/worker behavior (PRD §11):

- **Idempotent**: the job ID equals the submission ID, and the worker skips any submission already
  in a terminal (`COMPLETED`/`FAILED`) state, so a retried or duplicate delivery can't double-score
  a submission.
- **Retries**: 3 attempts with exponential backoff; after the final attempt, the submission is
  marked `FAILED`/`INTERNAL_ERROR`.
- **Dead-letter visibility**: failed jobs remain queryable in BullMQ's failed set
  (`removeOnFail: { count: 1000 }`) instead of vanishing.
- **Graceful shutdown**: `SIGTERM`/`SIGINT` let in-flight jobs finish before the worker exits.
- **Concurrency**: configurable via `WORKER_CONCURRENCY`; scale worker instances with
  `docker compose up --scale judge-worker=4`.

## Caching and rate limiting

- `GET /problems` and `GET /problems/:slug` are cached in Redis (`PROBLEM_CACHE_TTL_SECONDS`,
  default 60s) and invalidated on create/update. A Redis read/write failure is logged and treated
  as a cache miss (`apps/api/src/lib/cache.ts`) — Postgres stays authoritative and the request
  still succeeds.
- Rate limits, all Redis-backed so they hold across horizontally scaled API instances: login
  (10/15min), register (5/hour), submissions (`SUBMISSION_RATE_LIMIT_MAX`/`_WINDOW_MS` per user,
  default 30/10min), and a general per-IP limit on every request (300/5min).

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

## Common commands

| Command                                    | Description                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                             | ESLint across the monorepo                                                                                            |
| `npm run format`                           | Check Prettier formatting                                                                                             |
| `npm run typecheck`                        | Build workspace packages, then type-check every app                                                                   |
| `npm run test`                             | Run unit/integration tests (integration suites are skipped unless `DATABASE_URL`/`REDIS_URL` point at Postgres/Redis) |
| `npm run build`                            | Production build of all packages and apps                                                                             |
| `npm run db:generate`                      | Regenerate the Prisma client                                                                                          |
| `npm run db:migrate`                       | Apply Prisma migrations                                                                                               |
| `npm run db:seed`                          | Seed the database                                                                                                     |
| `npm run dev:worker`                       | Run the judge worker on the host                                                                                      |
| `docker compose up --scale judge-worker=4` | Run 4 worker replicas                                                                                                 |

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
| `SUBMISSION_RATE_LIMIT_MAX`/`_WINDOW_MS`   | Per-user submission rate limit                                                                          |
| `PROBLEM_CACHE_TTL_SECONDS`                | TTL for cached public problem metadata                                                                  |
| `WORKER_CONCURRENCY`                       | Judge worker's concurrent job count                                                                     |

The API and judge worker both refuse to start if a required variable is missing or invalid
(`packages/config`).

## Testing

- `apps/api/src/auth.test.ts`, `problems.test.ts`, `submissions.test.ts` — Vitest + Supertest
  integration tests against a real Postgres and Redis (auth flow; catalog listing; sample tests
  never leaking hidden ones; admin-only create/update; submission ownership/authorization;
  unsupported-language rejection; paginated history). They no-op (`describe.skip`) if
  `DATABASE_URL`/`REDIS_URL` aren't set. Because they share one real database, `vitest.config.ts`
  sets `fileParallelism: false` so files don't reset each other's fixtures mid-run.
- `apps/judge-worker/src/mockEvaluator.test.ts` — pure unit tests for the placeholder judge's
  verdict logic, no infra required.
- `apps/judge-worker/src/worker.test.ts` — runs the real BullMQ worker end to end against
  Postgres/Redis: enqueues a job the way the API would and asserts a persisted verdict and
  `SubmissionResult` rows. This is PRD §16's deterministic lifecycle test (register → submit a
  correct solution → judged → `ACCEPTED`), exercised at the worker/queue layer since Milestone 2
  doesn't yet have a leaderboard to extend it to.
- Run integration suites locally with `docker compose up -d postgres redis` then `npm run test`.

## CI

`.github/workflows/ci.yml` installs dependencies, checks formatting, lints, runs migrations against
a Postgres/Redis service container, type-checks, tests, builds every package/app, and builds all
three Docker images (api, judge-worker, web). No secrets are embedded — CI uses throwaway dev-only
credentials.

## Known limitations at this milestone

- Submissions are judged by a documented placeholder (see [Judging](#judging)), not real Python/
  JavaScript/C++ execution — that's Milestone 3.
- No contests, live leaderboard, or WebSocket updates yet; the workspace polls submission status
  over HTTP instead. See `PROGRESS.md` for the day-by-day plan.
- Problem administration has no dedicated UI yet — only the REST endpoints (`POST`/`PATCH
/problems`, admin-only).
- No load tests or benchmark scripts yet (Milestone 5).
