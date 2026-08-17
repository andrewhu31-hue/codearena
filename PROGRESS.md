# CodeArena build progress

Five-day build plan, one PRD milestone implemented and committed per day.

| Day | Milestone                                                                                                      | Status  |
| --- | -------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Milestone 1 — Foundation (monorepo, Docker Compose, Postgres, Redis, auth, migrations, seed data, basic UI)    | done    |
| 2   | Milestone 2 — Problems and submissions (catalog/workspace, Monaco, submission API/history, BullMQ, mock judge) | done    |
| 3   | Milestone 3 — Judge workers (Python/JS/C++ execution, Docker isolation, resource limits, cleanup/retries)      | pending |
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
