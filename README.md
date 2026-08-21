# CodeArena

A full-stack competitive programming platform: register, browse problems, submit solutions,
compete in timed contests, and watch live rankings. See [`PRD.md`](./PRD.md) for the full product
requirements and [`PROGRESS.md`](./PROGRESS.md) for the milestone build plan.

**Status: Milestone 3 — Judge workers.** Authentication, the problem catalog/workspace, the
submission pipeline, and real Docker-sandboxed Python/JavaScript/C++ execution are in place.
Contests arrive in a later milestone (see [`PROGRESS.md`](./PROGRESS.md)).

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
  docs/
    judge-security.md     Sandbox model, threat model, and known limitations
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

Run this from the repo root — `judge-worker` mounts the host's Docker socket and a
`./.judge-workspaces` directory to sandbox submissions (see
[`docs/judge-security.md`](./docs/judge-security.md)), and both assume `$PWD` is the repo root.

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
npm run dev:worker  # judges submissions in the background — needs Docker Desktop/Engine running
npm run dev:web     # http://localhost:3000
```

Run this way (not via `docker compose up judge-worker`), the worker talks to your local Docker
daemon directly — no Docker-outside-of-Docker path translation needed, unlike the Compose service.

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

`apps/judge-worker` consumes the `submissions` BullMQ queue and evaluates each one for real, inside
Docker sandboxes — no submission is ever executed inside the API or worker process (PRD §12). For
each test case: compile if the language needs it (C++), run the compiled binary or interpreter
against that test's input inside an isolated, resource-limited container, and compare its stdout
against the expected output. Stops at the first failing test, like most online judges, rather than
always running every one. See [`docs/judge-security.md`](./docs/judge-security.md) for the full
sandbox model (isolation flags, cleanup, Docker-outside-of-Docker when the worker itself runs in a
container) and its documented limitations (approximate memory sampling, unpinned image tags, etc).

`apps/judge-worker/src/execution/` holds the engine: `languages.ts` (per-language image/compile/run
commands), `dockerArgs.ts`/`dockerProcess.ts` (sandboxed `docker run` invocation, timeouts, output
cap, OOM detection), `outputCompare.ts` (whitespace-tolerant comparison), and `evaluate.ts`
(orchestration). `runtimeMs` is a host-side wall-clock measurement; `memoryKb` is a best-effort peak
sampled via `docker stats` and left `null` if no sample was captured, rather than fabricated.

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
- `apps/judge-worker/src/execution/outputCompare.test.ts`, `dockerArgs.test.ts`,
  `memoryUsage.test.ts` — pure unit tests (output normalization, the exact `docker run` flags built
  for every sandbox invocation, `docker stats` output parsing). No infra required.
- `apps/judge-worker/src/execution/evaluate.docker.test.ts` — runs the real execution engine
  against a live Docker daemon: correct solutions in all three languages, a C++ compilation error,
  a wrong answer, a non-zero exit, and a submission that never terminates (time limit). Skips
  itself (`describe.skip`) if `docker info` fails.
- `apps/judge-worker/src/worker.test.ts` — runs the real BullMQ worker end to end against
  Postgres/Redis _and_ a real Docker execution: enqueues a job the way the API would and asserts a
  persisted verdict and `SubmissionResult` rows. This is PRD §16's deterministic lifecycle test
  (register → submit a correct solution → judged → `ACCEPTED`), exercised at the worker/queue layer
  since there's no leaderboard yet to extend it to. Needs Postgres, Redis, _and_ Docker; skips
  itself if any are missing.
- Run integration suites locally with `docker compose up -d postgres redis` and Docker running,
  then `npm run test`. CI pre-pulls the three judge runtime images
  (`python:3.12-slim`/`node:20-slim`/`gcc:13`) before testing so the Docker-dependent suites don't
  burn their timeout on a cold pull.

## CI

`.github/workflows/ci.yml` installs dependencies, checks formatting, lints, runs migrations against
a Postgres/Redis service container, type-checks, tests, builds every package/app, and builds all
three Docker images (api, judge-worker, web). No secrets are embedded — CI uses throwaway dev-only
credentials.

## Known limitations at this milestone

- No contests, live leaderboard, or WebSocket updates yet; the workspace polls submission status
  over HTTP instead. See `PROGRESS.md` for the day-by-day plan.
- Problem administration has no dedicated UI yet — only the REST endpoints (`POST`/`PATCH
/problems`, admin-only).
- Docker is not a complete sandbox, memory measurement is best-effort, and image tags aren't
  pinned to digests — see [`docs/judge-security.md`](./docs/judge-security.md)'s limitations
  section for the full list and reasoning.
- No load tests or benchmark scripts yet (Milestone 5).
