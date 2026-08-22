# Benchmarking

Real numbers from an actual run of `load-tests/` on a single developer machine, not a production
environment. Every figure below came from executing the scripts in `load-tests/` (see
[`load-tests/README.md`](../load-tests/README.md)) — none are hardcoded or estimated (PRD §1/§22).
Re-run them yourself; expect different absolute numbers on different hardware, but the same
relative shape (Redis faster than Postgres for the ranking read; the rate limiter kicking in under
concurrent same-IP traffic).

## Environment

|                    |                                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| Date               | 2026-08-21                                                             |
| Machine            | Apple M2, 8 cores, 8GB RAM, macOS 15.5                                 |
| Node               | v26.3.0                                                                |
| Docker             | 29.7.2 (Docker Desktop)                                                |
| Postgres           | 16 (local Homebrew instance, not containerized this run)               |
| Redis              | 7 (local instance)                                                     |
| API / judge-worker | `tsx` directly on the host (not containerized), `WORKER_CONCURRENCY=4` |
| k6                 | v2.2.0                                                                 |

## k6 scenarios

Commands: `LOAD_TEST_USERS=40 ./run-all.sh` (see `load-tests/README.md` for prerequisites).

### General API traffic (`scenarios/general-traffic.js`)

Ramped to 20 VUs over ~30s browsing `GET /problems`, `/problems/:slug`, `/contests`.

**Run 1 — default `GENERAL_RATE_LIMIT_MAX` (300 requests/5min/IP):**

| Metric                                    | Value                  |
| ----------------------------------------- | ---------------------- |
| Requests                                  | 1,120                  |
| Checks failed                             | 73.21% (820/1,120)     |
| `http_req_duration` (successful requests) | avg 3.13ms, p95 7.65ms |

This is the rate limiter doing exactly what it's configured to do: every k6 VU shares this
machine's one IP, so 20 VUs × ~1 request/second immediately exceeds a 300-per-5-minutes-per-IP
budget (an average of 1/second). It's a genuine, useful result — confirmation the general limiter
is enforced under real concurrent load — but it doesn't say anything about the API's actual request
handling capacity, since the limiter is the bottleneck, not application logic.

**Run 2 — `GENERAL_RATE_LIMIT_MAX` raised to isolate throughput from the limiter:**

| Metric               | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Requests             | 1,503 (49.1 req/s)                                          |
| Iterations           | 501 (16.4/s)                                                |
| Request failure rate | 0.00%                                                       |
| `http_req_duration`  | avg 3.58ms, p50 3.12ms, p90 5.49ms, p95 6.72ms, max 38.84ms |

### Contest-start spike (`scenarios/contest-spike.js`)

50 VUs ramped up in 2 seconds (simulating everyone refreshing the moment a contest goes live), each
repeatedly fetching contest detail and the leaderboard, for ~20s. Raised rate limit (same reasoning
as above — this scenario is inherently the highest same-IP burst of the three).

| Metric               | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Requests             | 3,502 (171.5 req/s)                                         |
| Iterations           | 1,751 (85.7/s)                                              |
| Request failure rate | 0.00%                                                       |
| `http_req_duration`  | avg 3.47ms, p50 3.18ms, p90 4.74ms, p95 5.35ms, max 13.43ms |

### Concurrent submissions (`scenarios/concurrent-submissions.js`)

10 VUs, each submitting a genuinely correct Python solution and polling until judged, for ~20s
sustained (26s including ramp). Judge worker at `WORKER_CONCURRENCY=4`, so up to 4 submissions
actually executing inside Docker at once; the rest queue.

| Metric                                                                            | Value                                                           |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Submissions accepted                                                              | 76 (2.63/s)                                                     |
| Request failure rate                                                              | 0.00%                                                           |
| `http_req_duration` (API requests: submit + poll)                                 | avg 8.03ms, p50 5.53ms, p90 12.64ms, p95 16.57ms, max 163.58ms  |
| Judge duration (submit → terminal, includes queue wait + real Docker compile/run) | avg 3,338ms, p50 3,341ms, p90 4,065ms, p95 4,109ms, max 4,739ms |

The API itself responds in single-digit milliseconds throughout; judging takes seconds because it's
real container start-up + execution (see [`judge-security.md`](./judge-security.md)) contended
across only 4 concurrent worker slots for 10 VUs' worth of submissions — the queue, not the API, is
where load shows up under this configuration. Raising `WORKER_CONCURRENCY` (and provisioning more
worker replicas via `docker compose up --scale judge-worker=N`) is the intended way to bring that
down, not raising API capacity.

## PostgreSQL vs Redis leaderboard reads

Command: `node cache-benchmark.mjs`. Dataset: 1,000 `ContestScore` rows for one contest (randomized
scores/penalties), reading the top 100 ranked by score desc, penalty asc. 200 sequential iterations
per backend, same Node process, both warmed up once before measuring.

| Backend    | avg     | p50     | p95     | p99     | max     |
| ---------- | ------- | ------- | ------- | ------- | ------- |
| PostgreSQL | 1.140ms | 1.126ms | 1.205ms | 1.474ms | 1.547ms |
| Redis      | 0.270ms | 0.238ms | 0.375ms | 0.639ms | 0.785ms |

**Redis was 68.9% faster than PostgreSQL at p95** for this query, dataset size, and machine. Both
are fast in absolute terms at this dataset size — Postgres is already using the
`contest_scores_contestId_userId_key` index — but the gap is real and matches why PRD §13 asks for
Redis as the "fast representation": the advantage should widen further with contest/leaderboard
size and concurrent readers, neither of which this single-process, 1,000-row benchmark stresses.

### PostgreSQL query plan (`EXPLAIN ANALYZE`, this run)

```
Limit  (cost=18.86..18.87 rows=6 width=116) (actual time=0.242..0.251 rows=100 loops=1)
  ->  Sort  (cost=18.86..18.87 rows=6 width=116) (actual time=0.242..0.245 rows=100 loops=1)
        Sort Key: score DESC, "penaltyMs"
        Sort Method: top-N heapsort  Memory: 67kB
        ->  Bitmap Heap Scan on contest_scores  (cost=4.32..18.78 rows=6 width=116) (actual time=0.072..0.143 rows=1000 loops=1)
              Recheck Cond: ("contestId" = 'fb762405-c086-42b1-a847-2befd1df022f'::text)
              Heap Blocks: exact=21
              ->  Bitmap Index Scan on "contest_scores_contestId_userId_key"  (cost=0.00..4.32 rows=6 width=0) (actual time=0.067..0.067 rows=1000 loops=1)
                    Index Cond: ("contestId" = 'fb762405-c086-42b1-a847-2befd1df022f'::text)
Planning Time: 0.054 ms
Execution Time: 0.264 ms
```

The planner's row-count estimate (6) is off from the actual (1,000) — a side effect of Postgres's
default statistics target on a freshly-seeded, never-`ANALYZE`d table in this benchmark run, not a
missing index; the index itself (on `contestId`, incidentally the unique `[contestId, userId]`
constraint's index) is being used correctly, and the query still completes in a fraction of a
millisecond regardless.

## Test coverage

Command: `npm run test:coverage` (v8 provider; each workspace's `vitest.config.ts`). This is a
snapshot from this run, not a target to keep updated by hand — regenerate rather than trust it
after any change to source or tests. Coverage only counts files a test actually imported (vitest's
default, not `coverage.all`), so a file with zero tests importing it doesn't appear at all rather
than showing as 0%.

| Workspace                                                            | Statements | Branches | Functions | Lines  |
| -------------------------------------------------------------------- | ---------- | -------- | --------- | ------ |
| `apps/api`                                                           | 79.62%     | 58.89%   | 88.79%    | 83.24% |
| `apps/judge-worker`                                                  | 82.54%     | 73.49%   | 78.72%    | 84.42% |
| `apps/web`                                                           | 62.62%     | 65.51%   | 44.11%    | 64.21% |
| `packages/shared` (`scoring.ts`, the only file with dedicated tests) | 100%       | 90%      | 100%      | 100%   |

`apps/web`'s lower figures mostly reflect one thing: only `LoginPage` and a couple of `lib/` files
have dedicated component/unit tests (`apps/web/app/login/page.test.tsx`) — the newer pages
(problems, contests, submissions) are verified by manual browser/API-contract testing (see
`PROGRESS.md`), not automated component tests, which this number makes visible rather than
obscures.
