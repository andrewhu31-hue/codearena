# CodeArena build progress

Five-day build plan, one PRD milestone implemented and committed per day.

| Day | Milestone                                                                                                      | Status |
| --- | -------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Milestone 1 — Foundation (monorepo, Docker Compose, Postgres, Redis, auth, migrations, seed data, basic UI)    | done   |
| 2   | Milestone 2 — Problems and submissions (catalog/workspace, Monaco, submission API/history, BullMQ, mock judge) | done   |
| 3   | Milestone 3 — Judge workers (Python/JS/C++ execution, Docker isolation, resource limits, cleanup/retries)      | done   |
| 4   | Milestone 4 — Contests (creation, registration, timing, scoring, Redis leaderboard, Socket.IO)                 | done   |
| 5   | Milestone 5 — Quality and measurement (tests, logs, health checks, k6, cache benchmark, CI, docs)              | done   |

## Day 1 verification (2026-08-15)

`npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all
pass. The auth integration suite (`apps/api/src/auth.test.ts`) was additionally run against a real
local Postgres 16 and Redis (register, duplicate-register 409, login, `/me`, wrong-password 401,
refresh-token rotation + replay rejection) — all 6 pass. The web app was smoke-tested by starting
`next dev` and `tsx` on the API and exercising `/`, `/login`, `/register`, `/me`, and the full
register→login→me→refresh HTTP flow with curl; no runtime/hydration errors in the dev server logs.
The initial Prisma migration (`packages/database/prisma/migrations/20260815202059_init`) was
generated against that real Postgres instance, so `npm run db:migrate` is exercised, not just
typechecked.

## Day 2 verification (2026-08-17)

`npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all
pass, now across four workspaces (`packages/*`, `apps/api`, `apps/judge-worker`, `apps/web`). No
Docker daemon was available this session, so a throwaway local Postgres 16 (Homebrew, port 5433)
and Redis were used instead for everything that needs real infra:

- The new `apps/api/src/problems.test.ts` and `apps/api/src/submissions.test.ts` integration
  suites (catalog listing, sample-vs-hidden test isolation, admin-only create/update, submission
  ownership/authorization, unsupported-language rejection, history pagination) — 11 tests, all
  pass. `apps/api/vitest.config.ts` now sets `fileParallelism: false`: three integration files
  sharing one real Postgres/Redis stepped on each other's fixtures when Vitest ran them
  concurrently.
- `apps/judge-worker/src/worker.test.ts` runs the **real** BullMQ worker end-to-end against that
  Postgres/Redis: seeds a problem + QUEUED submission the way the API would, enqueues the same job
  the API enqueues, and asserts the worker carries it to a persisted `ACCEPTED`/`WRONG_ANSWER`
  verdict with per-test `SubmissionResult` rows — this is the deterministic lifecycle test PRD §16
  asks for. A third test confirms a submission already in a terminal state is never reprocessed.
- The Prisma migration adding `Problem.inputFormat/outputFormat/constraints/examples`
  (`packages/database/prisma/migrations/20260817125933_problems_and_submissions`) was generated
  and applied against that real Postgres, then the seed script (6 problems, each with sample +
  hidden tests) was run against it.
- Manually ran the API, judge worker, and `next dev` together and drove the full flow over real
  HTTP: register → `GET /problems/two-sum` → `POST /submissions` (immediate `QUEUED`) → polling
  `GET /submissions/:id` until the worker judged it `COMPLETED`/`ACCEPTED` → `GET
/users/me/submissions` showing it in history. Also curled `/`, `/problems`, `/problems/two-sum`,
  `/submissions`, `/login` and confirmed 200s with no errors in the `next dev` log. No headless
  browser was available in this environment, so client-side interaction (Monaco, the submit
  button, live polling) was verified by reading the code and by the underlying API contract it
  calls, not by driving a real browser — flag this for a follow-up manual check.

## Day 3 verification (2026-08-21)

This session started with no Docker daemon available (see the note in `docs/judge-security.md`'s
history), so the real per-language execution engine (`apps/judge-worker/src/execution/`) was built
and its non-Docker logic (output normalization, `docker run` flag construction, `docker stats`
output parsing) unit-tested first. Partway through, Docker Desktop was installed and started, so
**the Docker-dependent parts were, in the end, actually verified against a real daemon** — not left
as an untested assumption:

- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all
  pass across all five workspaces.
- All 51 tests pass with real infra: the existing 17 API tests, 2 web tests, and 32 judge-worker
  tests — including, once Docker came up, all 10 that had been skipping (7 in
  `execution/evaluate.docker.test.ts`: correct solutions in Python/JavaScript/C++, a C++ compile
  error, wrong answer, non-zero exit, and an infinite loop hitting the time limit; 3 in
  `worker.test.ts`, the full BullMQ-to-Postgres lifecycle with real execution).
- Manually drove a real end-to-end HTTP flow with the API, judge worker, and a real Docker daemon
  running together: registered, fetched the seeded `two-sum` problem, submitted a genuine C++
  solution (reads two integers' worth of input, brute-forces the pair, prints the indices),
  confirmed it came back `QUEUED` immediately (API doesn't wait for judging), polled until the
  worker compiled and ran it against all 3 sample+hidden tests inside sandboxed containers, and got
  a real `ACCEPTED` with a measured `runtimeMs`.
- That run also caught a real bug: `memoryKb` came back as `0` instead of a plausible reading or
  `null`. Root cause: the first `docker stats` poll can catch a container before its cgroup memory
  accounting initializes, returning a literal zero that isn't a real "no memory used" measurement.
  Fixed in `memorySampler.ts` to discard exactly-zero readings; a fast program with no other sample
  now correctly reports `memoryKb: null` instead of a misleading `0`.
- The mock evaluator from Milestone 2 (`mockEvaluator.ts`, its `CODEARENA_VERDICT` test directive)
  was deleted outright rather than kept around: with real execution in place, a magic string that
  bypasses judging based on source content would be a genuine security hole, not a convenience.
- Having a real daemon also surfaced a pre-existing, unrelated bug from Milestone 1:
  `infrastructure/docker/web.Dockerfile` copies `apps/web/public`, but that directory never
  existed, so the web image has apparently never actually built successfully — including in CI's
  `build-images` job, since GitHub-hosted runners do have Docker. Fixed by adding
  `apps/web/public/.gitkeep` (git doesn't track empty directories). All three images
  (`api`, `judge-worker`, `web`) now build cleanly; confirmed the `docker` CLI is present and
  runnable inside the `judge-worker` image specifically, since that's new this milestone.
- Docker-outside-of-Docker wiring for `docker-compose.yml` (`judge-worker` mounts the host socket
  and a shared `./.judge-workspaces` bind mount, with `JUDGE_WORKSPACE_DIR`/
  `JUDGE_WORKSPACE_HOST_DIR` translating between the container's and the host's view of the same
  workspace path) was written and reasoned through carefully, but **not** exercised via
  `docker compose up` itself in this session — only the host-native path (`npm run dev:worker`
  talking to Docker Desktop directly, which is what the tests and manual run above used) was
  actually verified. Worth a real `docker compose up` smoke test before relying on it.
- CI (`.github/workflows/ci.yml`) now pre-pulls the three judge runtime images before running tests
  and builds the `judge-worker` image alongside `api`/`web`; GitHub-hosted runners have Docker
  available by default, so the Docker-dependent suites should run for real there too, not skip.

## Day 4 verification (2026-08-21)

Same session as Day 3, continuing with real Postgres/Redis/Docker already available.

- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all
  pass across all five workspaces (`packages/shared` gained its own test suite this milestone —
  `scoring.test.ts` — so it's now five, not four).
- 71 tests pass total: the scoring algorithm (`packages/shared/src/scoring.ts`) has 8 pure unit
  tests covering immediate-accept, penalty accumulation, compile/internal-error exclusion,
  resubmission-after-accept, multi-problem sums, and order-independence; `apps/api/src/
contests.test.ts` adds 11 integration tests for visibility rules, admin-only writes,
  registration, server-side timing/registration/problem-membership enforcement on contest
  submissions, and the leaderboard read path (including the Postgres-rebuild-on-empty-cache case);
  `apps/judge-worker/src/worker.test.ts` gained one real-Docker test asserting `ContestScore` and
  the Redis leaderboard cache both update after a contest submission is judged.
- Manually verified the full real-time pipeline end to end, which no automated test exercises: ran
  the API and judge worker together, used a real `socket.io-client` instance to connect,
  authenticate, and join a contest's room, then submitted a genuine C++ solution to a live contest
  from a separate registered account. The socket received a live `submission:update` (`COMPLETED`/
  `ACCEPTED`) and a `leaderboard:update` event within seconds of the real Docker judging finishing
  — not simulated, an actual WebSocket message delivered by the running server. `GET /contests/:id/
leaderboard` immediately reflected the correct score (150, matching the contest problem's
  points), solved count, and penalty (~1 minute, matching real elapsed time since contest start).
- One thing this session did **not** verify: the Docker-outside-of-Docker wiring in
  `docker-compose.yml` still hasn't been exercised via an actual `docker compose up` (same caveat
  as Day 3) — all verification above used `npm run dev:worker`/`dev:api` talking to Docker
  directly on the host, not the containerized judge-worker service.

## Day 5 verification (2026-08-21)

Same session as Days 3–4, same real Postgres/Redis/Docker. This closes out the last milestone.

- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all
  pass. `npm run test:coverage` (new this milestone) also passes across all four instrumented
  workspaces — 73 tests total, same count as `npm run test` since coverage only adds instrumentation.
- Added `apps/api/src/e2e.test.ts`: PRD §16's named end-to-end test, spawning the real judge-worker
  as its own OS process (not imported in-process) so it's the actual service boundary under test.
  First attempt was flaky — `TIME_LIMIT_EXCEEDED` on a problem left at the schema's default 1000ms
  limit, because a freshly-spawned worker's first Docker container has more cold-start jitter than
  a warmed-up one in the other suites. Fixed by giving that one test problem a generous 10s limit
  (it's testing pipeline correctness, not performance) — not a product bug.
- Added a rate-limit test to `auth.test.ts` (429 + `Retry-After` after 5 registrations/hour/IP) —
  previously the only PRD §16 item ("unit-test ... rate limits") with no automated coverage at all.
- Added `GET /metrics` (queue depth via BullMQ, judge success/failure counts via new Redis
  counters `metrics:judge:succeeded`/`_failed`) and a `judgeDurationMs` field on judge-worker's
  "Judged" log line — the queue-depth/worker-success-failure-counts/judge-duration half of PRD
  §15 that wasn't covered yet.
- Built `load-tests/` (three k6 scenarios + a cache benchmark) and **actually ran all of it** rather
  than leaving it as unexecuted scripts — real numbers are in `docs/benchmarking.md`. Along the way:
  - The first `general-traffic` run, at the default `GENERAL_RATE_LIMIT_MAX` (300/5min/IP), hit
    73% failure — the general rate limiter working exactly as designed against many k6 VUs sharing
    one IP. That's a genuine, useful result (confirms the limiter holds under concurrent load) but
    it measures the limiter, not the API, so `GENERAL_RATE_LIMIT_MAX`/`_WINDOW_MS` were made
    configurable (previously hardcoded) and a second run raised it to isolate throughput. Both
    numbers are documented, not just the flattering one.
  - `run-all.sh` originally used `set -e`, so that first threshold-breaching k6 run aborted the
    whole script before cleanup or summarizing — fixed to treat a breached threshold as a valid
    result (`|| true`), not a script failure.
  - `setup/prepare.mjs` mints access tokens directly with the API's own JWT secret rather than
    calling `POST /auth/login` per simulated user — documented as a deliberate choice, not a
    shortcut: with every k6 VU sharing one IP, the (intentionally strict) login/register rate
    limits would dominate the results and end up testing auth throttling instead of the target
    endpoints.
  - `cache-benchmark.mjs`'s summarizer initially crashed: it assumed k6's `--summary-export` JSON
    nests metric fields under a `.values` key, but this k6 version puts them directly on the
    metric object, with different shapes per metric type (trend vs. counter vs. rate). Fixed by
    reading the actual JSON structure instead of assuming it.
  - Real result: PostgreSQL p95 1.205ms vs. Redis p95 0.375ms for a 1,000-row leaderboard's top-100
    read (68.9% faster) — including a real `EXPLAIN ANALYZE` plan showing the composite index
    being used correctly.
- Wrote `docs/architecture.md` (Mermaid system + sequence + ER diagrams, worker scaling, a
  troubleshooting table drawn from issues actually hit across this build), `docs/api.md` (REST +
  Socket.IO reference), and `docs/benchmarking.md` (the load-test/cache-benchmark numbers above,
  with full environment/command provenance) — the remaining PRD §22 docs beyond
  `docs/judge-security.md` (written in Milestone 3).

## Cadence

Originally planned as an automated daily cloud agent, but that requires connecting a GitHub App
installation to this repo on github.com, which didn't work out. Falling back to manual check-ins:
the next milestone is implemented in-session whenever the human says to continue — no fixed
schedule. Repo: https://github.com/andrewhu31-hue/codearena (pushed after Milestone 1).

## Notes for the next session/day

- Read `PRD.md` in full before starting a milestone.
- Complete and verify one milestone (tests, lint, typecheck passing) before starting the next, per PRD §20.
- Update this table's Status column and commit it alongside the milestone's code.
- Do not fabricate benchmark numbers, user counts, or performance claims (PRD §1, §22) — only Milestone 5 produces measured numbers.
