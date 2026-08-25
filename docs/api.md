# API reference

Base URL: `/api/v1` (plus unversioned `/health`, `/ready`, `/metrics`). Exact request/response
shapes are defined by the Zod schemas in `packages/shared/src` and the Prisma models in
`packages/database/prisma/schema.prisma` — this is a human-readable map of what exists and how
it's protected, not a substitute for reading those when you need the precise field list.

## Conventions

- **Auth**: `Authorization: Bearer <accessToken>` for endpoints marked 🔒. Endpoints marked 🔑
  additionally require the `ADMIN` role. Endpoints marked 👤 are public but personalize their
  response when a valid token is present (contest listings/detail).
- **Errors**: every non-2xx response is `{ error: { code, message, requestId, details? } }`
  (`packages/shared/src/errors.ts`). `requestId` matches the `X-Request-Id` response header and the
  structured log line for that request — include it when reporting a bug.
- **Rate limits**: every response carries standard `RateLimit-*` headers; a `429` additionally sets
  `Retry-After`. See the README's [Caching and rate limiting](../README.md#caching-and-rate-limiting)
  section for the specific limits per endpoint group.

## Operational endpoints

| Method & path  | Auth | Purpose                                                                                                                                                                          |
| -------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`  | none | Liveness — always `200` if the process is up.                                                                                                                                    |
| `GET /ready`   | none | Readiness — `200` only if Postgres and Redis both respond; `503` otherwise.                                                                                                      |
| `GET /metrics` | none | `{ queue: {waiting, active, delayed, failed, completed}, judge: {succeeded, failed} }` — BullMQ queue depth plus judge-worker's Redis-backed success/failure counters (PRD §15). |

## Auth

| Method & path         | Auth   | Purpose                                                                                                       |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register` | none   | Create an account; sets the refresh cookie, returns `{ user, accessToken, accessTokenExpiresAt }`.            |
| `POST /auth/login`    | none   | Same response shape as register. Generic `401` on any failure — never reveals whether an email is registered. |
| `POST /auth/refresh`  | cookie | Rotates the refresh token (old one is revoked) and issues a new access token.                                 |
| `POST /auth/logout`   | cookie | Revokes the presented refresh token; `204`.                                                                   |
| `GET /auth/me`        | 🔒     | The caller's own user record.                                                                                 |

## Problems

| Method & path         | Auth | Purpose                                                                                           |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `GET /problems`       | none | `{ problems: ProblemSummary[] }` — cached in Redis (`PROBLEM_CACHE_TTL_SECONDS`).                 |
| `GET /problems/:slug` | none | Full statement + **sample tests only** (hidden tests never leave the API). Cached.                |
| `POST /problems`      | 🔑   | Create a problem, optionally with `sampleTests`/`hiddenTests` inline. Invalidates the list cache. |
| `PATCH /problems/:id` | 🔑   | Partial update; passing `sampleTests`/`hiddenTests` replaces that set entirely.                   |

## Submissions

| Method & path                     | Auth                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /submissions`               | 🔒                  | `{problemId, language, sourceCode, contestId?}` → `201` with status `QUEUED` immediately (never waits for judging). Optional request header `Idempotency-Key` deduplicates retried client requests per user; a replay returns the previously created submission. Validates language support; if `contestId` is set, also validates the contest is currently active, the caller is registered, and the problem belongs to that contest — server-side, regardless of client state. |
| `GET /submissions/:id`            | 🔒 (owner or admin) | Full detail including `sourceCode` and `compilerOutput`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GET /users/me/submissions?page=` | 🔒                  | The caller's own paginated history (`SubmissionSummary[]`, no source code).                                                                                                                                                                                                                                                                                                                                                                                                      |

## Contests

| Method & path                   | Auth | Purpose                                                                                                                                                                                            |
| ------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /contests`                 | 👤   | `PUBLIC` contests for everyone; admins additionally see `PRIVATE` ones.                                                                                                                            |
| `GET /contests/:id`             | 👤   | Detail including `isRegistered` for the caller. A `PRIVATE` contest the caller isn't registered for (and isn't an admin) returns `404` — same as a nonexistent one, so its existence isn't leaked. |
| `POST /contests`                | 🔑   | Create, with an inline `problems: [{problemId, points, order}]` list.                                                                                                                              |
| `PATCH /contests/:id`           | 🔑   | Partial update; passing `problems` replaces the full set.                                                                                                                                          |
| `POST /contests/:id/register`   | 🔒   | Registers the caller; `204`, or `409` on a duplicate.                                                                                                                                              |
| `GET /contests/:id/leaderboard` | none | `{contestId, entries: LeaderboardEntry[]}`, ranked (Redis-backed, rebuilt from Postgres if the cache is empty). Each entry includes a per-problem breakdown (attempts, solved, penalty).           |

## Real-time (Socket.IO)

Not a REST endpoint — connect with `auth: { token: accessToken }` in the Socket.IO handshake, then:

| Client emits                           | Server emits (to the room) | Who can join                                                                   |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `join:submission` with a submission ID | `submission:update`        | The submission's owner, or an admin.                                           |
| `join:contest` with a contest ID       | `leaderboard:update`       | Anyone for a `PUBLIC` contest; registered users or admins for a `PRIVATE` one. |

See [`architecture.md`](./architecture.md#submission-flow) for the full event sequence, and
`apps/api/src/lib/realtime.ts` for the authorization checks.
