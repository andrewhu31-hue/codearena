# Load tests and benchmarks

Reproducible k6 scenarios (PRD §17) and a PostgreSQL-vs-Redis leaderboard read benchmark. For a
specific real run's numbers, see [`../docs/benchmarking.md`](../docs/benchmarking.md) — this file
covers how to run them yourself.

## Prerequisites

- [k6](https://k6.io/) installed (`brew install k6` on macOS).
- The API, judge worker, Postgres, and Redis all running (`docker compose up` or the host-native
  flow in the main README), and `DATABASE_URL`/`REDIS_URL`/`JWT_ACCESS_SECRET` in your shell
  matching that running API's own configuration.
- `DATABASE_URL` must target the dedicated load-test database (`codearena_loadtest` by default).
  Setup/cleanup scripts refuse to run against any other database name.

## What each scenario measures

| Script                                | Measures                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `scenarios/general-traffic.js`        | Anonymous browsing: `GET /problems`, `/problems/:slug`, `/contests`.                                         |
| `scenarios/contest-spike.js`          | A sharp ramp of registered contestants hitting contest detail + leaderboard at once.                         |
| `scenarios/concurrent-submissions.js` | Submission throughput and time-to-judge (queue wait + real Docker execution) under concurrency.              |
| `cache-benchmark.mjs`                 | PostgreSQL vs Redis latency for the same leaderboard ranking read, plus a real `EXPLAIN ANALYZE` query plan. |

## Running everything

```bash
export DATABASE_URL=postgresql://codearena:codearena@localhost:5433/codearena_loadtest
export JWT_ACCESS_SECRET=<same secret the running API uses>
./run-all.sh          # seeds data, runs all three k6 scenarios, cleans up, writes results/summary.md
node cache-benchmark.mjs
```

`results/` (gitignored — regenerate rather than trust stale numbers) will contain each scenario's
`k6 --summary-export` JSON, `summary.md`, and the cache benchmark's JSON/Markdown.

## Design notes

- **Tokens are minted directly, not via `/auth/login`.** `setup/prepare.mjs` signs access tokens
  with the API's own `JWT_ACCESS_SECRET` instead of calling `POST /auth/login` per user. Login is
  capped at 10/15min/IP and register at 5/hour/IP (`apps/api/src/routes/auth.routes.ts`) — with
  every k6 VU on this box sharing one IP, either limit would dominate the results within seconds
  and end up testing the rate limiter instead of the endpoints these scenarios target. Minting a
  token does exactly what a successful login does internally; the auth flow itself has its own
  dedicated, intentionally strict tests in `apps/api/src/auth.test.ts`.
- **The general per-IP rate limit (`GENERAL_RATE_LIMIT_MAX`, default 300/5min) will dominate
  concurrent same-IP traffic too**, by design — it's meant to. Running these scenarios against the
  default config mostly measures the rate limiter, not the API. `docs/benchmarking.md` documents
  both: the default config actually hitting the limiter, and a raised-limit run isolating
  throughput. If you want your own throughput numbers, raise `GENERAL_RATE_LIMIT_MAX` for the
  duration of the run and put it back afterward — don't raise it in a real deployment just to make
  a load test pass.
- **k6 exits non-zero when a threshold is breached.** `run-all.sh` treats that as a valid result to
  record (`|| true`), not a script failure — so cleanup and summarizing still run.
