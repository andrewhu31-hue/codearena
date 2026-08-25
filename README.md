# CodeArena

A full-stack competitive programming platform: register, browse problems, submit solutions,
compete in timed contests, and watch live rankings. See [`PRD.md`](./PRD.md) for the full product
requirements and [`PROGRESS.md`](./PROGRESS.md) for the milestone build plan.

**Status: all 5 milestones complete.** Authentication, the problem catalog/workspace, the
submission pipeline, real Docker-sandboxed Python/JavaScript/C++ execution, timed contests with a
Redis-backed live leaderboard and Socket.IO push, and the quality/measurement work (metrics
endpoint, expanded tests, k6 load tests, a Postgres-vs-Redis cache benchmark, coverage, expanded
docs) are all in place — see [`PROGRESS.md`](./PROGRESS.md) for the day-by-day build log and
[`docs/benchmarking.md`](./docs/benchmarking.md) for real measured numbers.

## Stack

- **Web**: Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query, Monaco Editor,
  Socket.IO client
- **API**: Node.js, Express, TypeScript, Zod, Prisma, BullMQ, Socket.IO
- **Judge worker**: Node.js, TypeScript, BullMQ consumer (see [Judging](#judging) below)
- **Data**: PostgreSQL (source of truth), Redis (queue, caching, rate limiting, leaderboard, pub/sub)
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
  load-tests/              k6 scenarios and the Postgres-vs-Redis cache benchmark
  docs/
    architecture.md        System/sequence diagrams, data model, worker scaling, troubleshooting
    api.md                 REST + Socket.IO reference
    judge-security.md      Sandbox model, threat model, and known limitations
    benchmarking.md        Real measured numbers from load-tests/
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
#   DATABASE_URL=postgresql://codearena:codearena@localhost:5433/codearena
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

## Contests, scoring, and the leaderboard

- `GET /api/v1/contests` / `GET /api/v1/contests/:id` are public for `PUBLIC` contests; `PRIVATE`
  ones are only visible to admins and registered users (an unregistered non-admin gets the same
  404 as a nonexistent contest, so private contests aren't discoverable by ID-guessing).
- `POST /api/v1/contests` / `PATCH /api/v1/contests/:id` (admin-only) set name/description/
  start-end time/visibility and the attached problems with their points, all in one call.
- `POST /api/v1/contests/:id/register` registers the caller (`409` on a duplicate).
- **Timing is enforced server-side, never trusted from the client** (PRD §14): `POST /submissions`
  with a `contestId` is rejected with `400` unless the current server time is inside
  `[startTime, endTime]`, the caller is registered, and the problem is actually part of that
  contest — regardless of what any client-side countdown displays.
- **Scoring** (`packages/shared/src/scoring.ts`, unit-tested independent of any infra) is
  ICPC-style: only a problem's first `ACCEPTED` submission counts; each wrong attempt before it
  (excluding compile/internal errors) adds a fixed penalty
  (`PENALTY_MINUTES_PER_WRONG_ATTEMPT`, 20 minutes) on top of the minutes elapsed since contest
  start. The same function computes both the score judge-worker persists and the per-problem
  breakdown the leaderboard displays, so they can't drift out of sync.
- **Leaderboard** (`GET /api/v1/contests/:id/leaderboard`): ranking order comes from a Redis
  sorted set (`leaderboard:<contestId>`) judge-worker updates after every judged contest
  submission; row detail (score, solved count, penalty, per-problem breakdown) comes from
  Postgres, which stays authoritative. If the Redis key is empty (nothing scored yet, or the
  cache was evicted/lost), the API rebuilds it from `ContestScore` on the spot and re-reads —
  PRD §13's "missing Redis data must be rebuildable from PostgreSQL." If Redis is unreachable
  entirely, it falls back to ranking directly from Postgres.

## Real-time updates (Socket.IO)

`apps/api/src/lib/realtime.ts` runs a Socket.IO server alongside the REST API. Connections require
a valid access token in the handshake (`auth: { token }`); "Users may join only authorized rooms"
(PRD §8) is enforced per room:

- `submission:<id>` — only the submission's owner or an admin can join; receives `submission:update`
  (status/verdict/tests-passed) as the worker judges it.
- `contest:<id>` — for a `PRIVATE` contest, only a registered user or an admin can join; receives
  `leaderboard:update` whenever anyone's score in that contest changes.

judge-worker has no Socket.IO server of its own (it isn't an HTTP service), so it publishes
structured events to a plain Redis pub/sub channel (`REALTIME_CHANNEL`,
`apps/judge-worker/src/lib/realtimePublisher.ts`); every API instance subscribes and re-emits
locally. The API's own Socket.IO server also uses `@socket.io/redis-adapter`, so `io.to(room).emit`
reaches clients connected to _any_ horizontally-scaled API replica, not just the one that received
the pub/sub message. Every page using this treats it as an enhancement, not a dependency: the
workspace and leaderboard pages poll over REST regardless (3s/10s), and a push just triggers an
earlier refetch — a dropped or never-established socket degrades to "slightly slower," not broken.

## Caching and rate limiting

- `GET /problems` and `GET /problems/:slug` are cached in Redis (`PROBLEM_CACHE_TTL_SECONDS`,
  default 60s) and invalidated on create/update. A Redis read/write failure is logged and treated
  as a cache miss (`apps/api/src/lib/cache.ts`) — Postgres stays authoritative and the request
  still succeeds.
- Rate limits, all Redis-backed so they hold across horizontally scaled API instances: login
  (10/15min), register (5/hour), submissions (`SUBMISSION_RATE_LIMIT_MAX`/`_WINDOW_MS` per user,
  default 30/10min), and a general per-IP limit on every request
  (`GENERAL_RATE_LIMIT_MAX`/`_WINDOW_MS`, default 300/5min). The general limit is necessarily
  per-IP, so shared-IP/NAT'd traffic (or a load test run from one machine) hits it faster than a
  single browser would — see [`load-tests/README.md`](./load-tests/README.md).

## Observability

- **Structured JSON logs** (`pino`/`pino-http`) on both the API and judge-worker, with a request ID
  on every API log line (`X-Request-Id` response header too) and a `judgeDurationMs` field on every
  "Judged" log line. Passwords, tokens, and submitted source code are redacted from logs by name
  (`apps/api/src/lib/logger.ts`, `apps/judge-worker/src/lib/logger.ts`) — PRD §15.
- **`GET /health`** — liveness, always `200` if the process is up.
- **`GET /ready`** — readiness; `200` only if Postgres and Redis both respond, `503` otherwise.
- **`GET /metrics`** — `{ queue: {waiting, active, delayed, failed, completed}, judge: {succeeded, failed} }`:
  live BullMQ queue depth plus judge-worker's Redis-backed success/failure counters
  (`metrics:judge:succeeded`/`metrics:judge:failed`, incremented in `apps/judge-worker/src/worker.ts`).

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
| `npm run test:coverage`                    | Same, with a v8 coverage report per workspace                                                                         |
| `npm run build`                            | Production build of all packages and apps                                                                             |
| `npm run db:generate`                      | Regenerate the Prisma client                                                                                          |
| `npm run db:migrate`                       | Apply Prisma migrations                                                                                               |
| `npm run db:seed`                          | Seed the database                                                                                                     |
| `npm run dev:worker`                       | Run the judge worker on the host                                                                                      |
| `docker compose up --scale judge-worker=4` | Run 4 worker replicas                                                                                                 |
| `load-tests/run-all.sh`                    | Run all three k6 scenarios and write `load-tests/results/summary.md`                                                  |
| `node load-tests/cache-benchmark.mjs`      | Run the Postgres-vs-Redis leaderboard read benchmark                                                                  |

## Load testing and benchmarks

`load-tests/` (see [`load-tests/README.md`](./load-tests/README.md) for prerequisites and design
notes) has three k6 scenarios — general API browsing, a contest-start traffic spike, and concurrent
submissions with time-to-judge measurement — plus a reproducible PostgreSQL-vs-Redis leaderboard
read benchmark with a real `EXPLAIN ANALYZE` query plan. Every number in
[`docs/benchmarking.md`](./docs/benchmarking.md) came from actually running these scripts; nothing
is hardcoded or estimated (PRD §1/§17/§22).

Final validation capacity claim (2026-08-24): **50 active users is the currently supported
end-to-end claim**, reproduced across two successful corrected runs:
`final-e2e-50-corrected-1787601679` and `final-e2e-50-corrected-rerestore-1787609192`.
Both runs achieved `50/50` full journeys, `50/50` accepted, `50/50` leaderboard-reflected,
zero final idempotent GET failures, and zero P1001, lock/stall, INTERNAL_ERROR, or leaked
containers. The 100-user run `final-100-e2e-1787607937` is documented as a stretch test
(`66/100` full journeys; all 66 admitted submissions accepted and leaderboard-reflected;
failures occurred pre-submission due to API saturation/429s), so 100 active users is **not**
a supported claim right now. See [`docs/final-validation.md`](./docs/final-validation.md).

## Environment variables

See [`.env.example`](./.env.example) for the full list. Notable ones:

| Variable                                   | Purpose                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Postgres connection string                                                                              |
| `POSTGRES_PORT`                            | Host port published by the Postgres container (default `5433`, container still listens on `5432`)     |
| `REDIS_URL`                                | Redis connection string                                                                                 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Must be ≥32 characters; generate real ones with `openssl rand -base64 48` for anything beyond local dev |
| `ACCESS_TOKEN_TTL_SECONDS`                 | Access token lifetime (default 900s)                                                                    |
| `REFRESH_TOKEN_TTL_DAYS`                   | Refresh token lifetime (default 30 days)                                                                |
| `CORS_ORIGIN`                              | Origin allowed to call the API with credentials                                                         |
| `SUBMISSION_RATE_LIMIT_MAX`/`_WINDOW_MS`   | Per-user submission rate limit                                                                          |
| `GENERAL_RATE_LIMIT_MAX`/`_WINDOW_MS`      | Per-IP limit applied to every request                                                                   |
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
  persisted verdict and `SubmissionResult` rows (PRD §16's deterministic lifecycle test: register →
  submit a correct solution → judged → `ACCEPTED`), plus a contest-submission case asserting the
  `ContestScore` row and the Redis leaderboard cache are both updated after judging. Needs Postgres,
  Redis, _and_ Docker; skips itself if any are missing.
- `packages/shared/src/scoring.test.ts` — pure unit tests for the ICPC-style scoring algorithm
  (immediate accept, penalty accumulation, compile/internal errors excluded from penalty,
  resubmissions after acceptance ignored, order-independence/idempotency). No infra required.
- `apps/api/src/contests.test.ts` — integration tests for contest visibility (public vs. private),
  admin-only create, registration and duplicate rejection, server-side timing/registration/
  problem-membership enforcement on contest submissions, and the leaderboard read path including
  the Postgres rebuild-on-empty-cache case. Also covers the register rate limit itself (429 +
  `Retry-After` after 5 requests/hour/IP), in `auth.test.ts`.
- `apps/api/src/e2e.test.ts` — PRD §16's named deterministic end-to-end test: register → open a
  problem → submit a correct solution → get judged `ACCEPTED` → leaderboard updates. Unlike every
  other suite, this one spawns the real judge-worker as its own OS process (not imported
  in-process) so it exercises the actual Postgres/Redis/HTTP service boundary the same way Docker
  Compose does, not a shortcut. Needs Postgres, Redis, and Docker; skips itself otherwise.
- Run integration suites locally with `docker compose up -d postgres redis` and Docker running,
  then `npm run test` (or `npm run test:coverage` for a coverage report — see
  [`docs/benchmarking.md`](./docs/benchmarking.md#test-coverage) for a real snapshot). CI pre-pulls
  the three judge runtime images (`python:3.12-slim`/`node:20-slim`/`gcc:13`) before testing so the
  Docker-dependent suites don't burn their timeout on a cold pull.

## CI

`.github/workflows/ci.yml` installs dependencies, checks formatting, lints, runs migrations against
a Postgres/Redis service container, type-checks, tests with coverage (uploaded as a build artifact),
builds every package/app, and builds all three Docker images (api, judge-worker, web). No secrets
are embedded — CI uses throwaway dev-only credentials.

## Known limitations

- Problem and contest administration have no dedicated UI yet — only the REST endpoints
  (`POST`/`PATCH /problems`, `/contests`, admin-only).
- Contest problem statements aren't hidden before the contest starts (only submitting to them is
  time-gated) — anyone can navigate to a contest problem's slug via the public catalog ahead of
  time. No standings freeze near the end, either; the leaderboard stays live throughout.
- Socket.IO requires a logged-in user; an anonymous visitor watching a public contest's leaderboard
  falls back to the 10s REST poll instead of instant push.
- Docker is not a complete sandbox, memory measurement is best-effort, and image tags aren't
  pinned to digests — see [`docs/judge-security.md`](./docs/judge-security.md)'s limitations
  section for the full list and reasoning.
- Load tests and the cache benchmark were run on a single local developer machine, not production
  infrastructure — see [`docs/benchmarking.md`](./docs/benchmarking.md) for exact numbers and
  environment, and re-run them yourself before treating any number as representative of a real
  deployment.
