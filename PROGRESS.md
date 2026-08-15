# CodeArena build progress

Five-day build plan, one PRD milestone implemented and committed per day.

| Day | Milestone                                                                                                      | Status      |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Milestone 1 — Foundation (monorepo, Docker Compose, Postgres, Redis, auth, migrations, seed data, basic UI)    | done        |
| 2   | Milestone 2 — Problems and submissions (catalog/workspace, Monaco, submission API/history, BullMQ, mock judge) | pending     |
| 3   | Milestone 3 — Judge workers (Python/JS/C++ execution, Docker isolation, resource limits, cleanup/retries)      | pending     |
| 4   | Milestone 4 — Contests (creation, registration, timing, scoring, Redis leaderboard, Socket.IO)                 | pending     |
| 5   | Milestone 5 — Quality and measurement (tests, logs, health checks, k6, cache benchmark, CI, docs)              | pending     |

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
