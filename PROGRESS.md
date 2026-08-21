# CodeArena build progress

Five-day build plan, one PRD milestone implemented and committed per day.

| Day | Milestone                                                                                                      | Status  |
| --- | -------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Milestone 1 — Foundation (monorepo, Docker Compose, Postgres, Redis, auth, migrations, seed data, basic UI)    | done    |
| 2   | Milestone 2 — Problems and submissions (catalog/workspace, Monaco, submission API/history, BullMQ, mock judge) | done    |
| 3   | Milestone 3 — Judge workers (Python/JS/C++ execution, Docker isolation, resource limits, cleanup/retries)      | done    |
| 4   | Milestone 4 — Contests (creation, registration, timing, scoring, Redis leaderboard, Socket.IO)                 | pending |
| 5   | Milestone 5 — Quality and measurement (tests, logs, health checks, k6, cache benchmark, CI, docs)              | pending |

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
