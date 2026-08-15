# CodeArena Product Requirements Document

## 1. Instructions for Claude

Act as a senior full-stack and distributed-systems engineer. Build this application incrementally using production-quality TypeScript.

Before each milestone:

1. Explain the architecture and important tradeoffs.
2. List the files you will create or modify.
3. Implement the milestone.
4. Run tests, linting, and type checking.
5. Fix discovered errors before continuing.
6. Update the README with setup instructions.

Do not fabricate benchmark results, user counts, downloads, or performance improvements. Create reproducible scripts that collect these measurements later.

## 2. Product overview

Build **CodeArena**, a full-stack competitive programming platform where users can register, browse problems, write and submit solutions, join timed contests, receive test results, view live rankings, and review submission history.

This is not an AI application. Do not add generated hints, solutions, chatbots, or LLM APIs.

The primary engineering challenge is safely processing untrusted code asynchronously while supporting live contests and measurable performance.

## 3. Goals

Demonstrate practical use of:

- React, Next.js, and TypeScript
- Node.js and Express
- PostgreSQL and database indexes
- Redis caching and rate limiting
- BullMQ message queues and background workers
- WebSockets with Socket.IO
- Docker and isolated code execution
- REST APIs and authentication
- Horizontal worker scaling
- Automated and load testing
- CI/CD

Every technology must solve a real problem. Do not introduce unnecessary microservices merely to increase the technology count.

## 4. Non-goals

The MVP will not include AI, payments, mobile apps, video, public problem creation, plagiarism detection, Kubernetes, or a large microservice architecture. Start with a modular monolith and independently scalable judge workers.

## 5. Users

### Contestant

- Register and authenticate
- Browse problems
- Join contests
- Submit solutions
- View verdicts, rankings, and submission history

### Administrator

- Create and edit problems and tests
- Create contests and configure timing
- Add problems to contests
- View submission and worker statistics

## 6. Technology stack

### Frontend

- Next.js, React, TypeScript
- Tailwind CSS
- Monaco Editor
- TanStack Query
- Socket.IO client

### Backend

- Node.js, Express, TypeScript
- Zod validation
- PostgreSQL with Prisma
- Redis
- BullMQ
- Socket.IO

### Judge infrastructure

- TypeScript worker service
- BullMQ queue consumers
- Docker execution containers
- Initial languages: Python, JavaScript, and C++

### Quality and operations

- Vitest, React Testing Library, Supertest, Playwright
- k6 load testing
- Docker Compose
- GitHub Actions
- Structured logging

Use maintained, mutually compatible package versions.

## 7. Architecture

The system contains a Next.js client, Express API, PostgreSQL source of truth, Redis cache, BullMQ submission queue, scalable judge workers, Docker execution sandboxes, and Socket.IO real-time updates.

### Submission flow

1. Client submits code to the API.
2. API authenticates and rate-limits the user.
3. API validates the problem, contest, language, and source size.
4. API stores a `QUEUED` submission in PostgreSQL.
5. API places the submission ID onto BullMQ.
6. A worker claims the job and marks it `RUNNING`.
7. The worker loads hidden test cases.
8. Tests run inside restricted Docker containers.
9. The worker compares actual and expected output.
10. The final verdict is saved in PostgreSQL.
11. Redis leaderboard data is updated.
12. Socket.IO pushes the verdict and leaderboard update.

Queue jobs should contain IDs, not full source code or test cases. PostgreSQL remains authoritative.

## 8. Functional requirements

### Authentication

- Email/password registration and login
- Secure password hashing
- Short-lived access tokens
- Refresh-token rotation or secure session cookies
- Contestant and administrator roles
- Protected routes and validated input
- Generic authentication errors
- Never log passwords or tokens

### Problems

Each problem has a title, slug, description, difficulty, formats, constraints, examples, time limit, memory limit, supported languages, sample tests, and hidden tests. Only administrators can modify problems and hidden tests.

### Submissions

Store the user, problem, optional contest, language, source code, status, verdict, runtime, memory, tests passed, compiler output, and timestamps.

Statuses: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`.

Verdicts: `ACCEPTED`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `RUNTIME_ERROR`, `COMPILATION_ERROR`, `INTERNAL_ERROR`.

### Contests

Administrators configure name, description, start/end time, problems, scoring, visibility, and registration. The server must enforce contest timing; client timers are display-only.

### Leaderboard

Display rank, username, score, solved count, penalty time, and per-problem results. PostgreSQL is durable; Redis stores the fast representation. Missing Redis data must be rebuildable from PostgreSQL.

### Real-time updates

Socket.IO pushes submission status, final verdicts, and leaderboard changes. Users may join only authorized rooms.

## 9. Data model

Create `users`, `sessions` or `refresh_tokens`, `problems`, `test_cases`, `contests`, `contest_problems`, `contest_registrations`, `submissions`, `submission_results`, and `contest_scores`.

Add primary and foreign keys, unique and check constraints, cascade behavior, timestamps, and indexes for problem slugs, user submission history, contest submissions, queued statuses, rankings, and registrations.

Seed one administrator, two contestants, at least six problems, and one contest.

## 10. REST API

Use `/api/v1`.

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /problems`
- `GET /problems/:slug`
- `POST /problems`
- `PATCH /problems/:id`
- `POST /submissions`
- `GET /submissions/:id`
- `GET /users/me/submissions`
- `GET /contests`
- `GET /contests/:id`
- `POST /contests/:id/register`
- `GET /contests/:id/leaderboard`

Return consistent errors with a code, message, request ID, and optional validation details. Never return stack traces.

## 11. Queue and worker requirements

- Submission and leaderboard queues
- Configurable retries and exponential backoff
- Idempotent processing using submission IDs
- Timeouts and dead-letter visibility
- Graceful shutdown
- Configurable worker concurrency
- Duplicate-job prevention
- Structured worker logs

A retry must not create duplicate submissions or scores.

## 12. Execution security

Treat every submission as hostile. Containers must have no network, a non-root user, CPU/memory/process/time/output limits, a temporary writable directory, automatic cleanup, no Docker socket, and no sensitive host mounts. Use a read-only root filesystem where practical.

Never execute code inside the API or worker process. Document that Docker alone is not a complete production sandbox and recommend gVisor, Firecracker, or dedicated hosts for stronger isolation.

## 13. Caching and rate limiting

Use Redis for leaderboards, public problem metadata, rate-limit counters, and short-lived contest state. Document cache keys, TTLs, invalidation, fallback behavior, and the authoritative source.

Apply separate limits to logins, registration, submissions, and general requests. Submission limits should be configurable per user and IP. Return HTTP 429 with retry information.

## 14. Frontend

Build responsive pages for landing, authentication, problem catalog, problem workspace, history, contest catalog/detail, live leaderboard, problem administration, and contest administration.

The workspace includes the statement, language selector, Monaco editor, submit control, live status, verdict, runtime/memory, and visible results. Every page needs loading, empty, error, and disconnected states. Do not add nonfunctional controls.

## 15. Observability

Add JSON logs, request IDs, request durations, queue depth, worker success/failure counts, judge duration, and health/readiness endpoints. Never log secrets, tokens, source code, or hidden tests.

## 16. Testing

Unit-test scoring, verdicts, output normalization, timing, rate limits, and leaderboard calculations.

Integration-test authentication, problem retrieval, submission creation, queue publication, result persistence, leaderboard updates, and authorization.

Create a deterministic end-to-end test: register, open a problem, submit a correct solution, process it, receive `ACCEPTED`, and update the leaderboard.

## 17. Load testing and benchmarks

Create configurable k6 scenarios for general API traffic, contest-start spikes, and concurrent submissions. Measure requests/second, submission throughput, p50/p95/p99 latency, errors, queue depth, and judging duration.

Generate JSON results and a Markdown summary. Never hardcode impressive results.

Create a reproducible benchmark comparing PostgreSQL leaderboard reads with Redis sorted-set reads. Report environment, dataset size, concurrency, request count, latency, and measured improvement.

## 18. Local development and CI

`docker compose up --build` should start the web app, API, PostgreSQL, Redis, and at least one judge worker. Document migrations, seeding, tests, load tests, queue inspection, shutdown, and worker scaling.

Example: `docker compose up --scale judge-worker=4`.

GitHub Actions must install dependencies, check formatting, lint, type-check, test, build applications, and build images. Do not embed secrets.

## 19. Repository structure

```text
codearena/
  apps/
    web/
    api/
    judge-worker/
  packages/
    database/
    shared/
    config/
  infrastructure/
    docker/
  load-tests/
  docs/
  docker-compose.yml
  README.md
```

Avoid abstractions used only once.

## 20. Milestones

### Milestone 1: Foundation

Monorepo, Docker Compose, PostgreSQL, Redis, authentication, migrations, seed data, and basic UI.

### Milestone 2: Problems and submissions

Problem catalog/workspace, Monaco, submission API/history, and BullMQ. Use a deterministic mock judge first to verify the lifecycle.

### Milestone 3: Judge workers

Python, JavaScript, and C++ execution; Docker isolation; compiler/runtime errors; resource limits; test evaluation; cleanup and retries.

### Milestone 4: Contests

Contest creation, registration, timing, scoring, Redis leaderboard, and Socket.IO updates.

### Milestone 5: Quality and measurement

Tests, logs, health checks, k6 scripts, cache benchmark, CI, and documentation.

Complete and verify one milestone before starting the next.

## 21. Acceptance criteria

- Users can authenticate and browse seeded problems.
- Users can submit Python, JavaScript, or C++.
- The API acknowledges without waiting for execution.
- BullMQ workers process submissions under documented restrictions.
- Verdicts persist to PostgreSQL and arrive in real time.
- Users can join timed contests with deterministic scoring.
- The leaderboard updates in real time.
- Redis failure cannot destroy authoritative data.
- Automated tests cover the critical flow.
- k6 generates real reports.
- Docker Compose runs the whole system.
- The README fully documents setup and architecture.

## 22. Documentation and résumé evidence

Create `docs/architecture.md`, `docs/judge-security.md`, `docs/benchmarking.md`, and `docs/api.md`. Include architecture and sequence diagrams, setup, environment variables, testing, worker scaling, security limitations, and troubleshooting.

Generate reproducible artifacts for k6 results, cache comparisons, query plans, coverage, queue throughput, and worker scaling. Phrase claims honestly: "X simulated concurrent users," "X test submissions per second," or "p95 latency improved X%." Every number must come from a saved test result.

## 23. Engineering standards

- Strict TypeScript; avoid unjustified `any`
- Validate environment variables and all external input
- Thin controllers and separated domain logic
- Transactions where atomicity matters
- Graceful shutdown
- Comments for security-sensitive decisions
- No silently swallowed errors
- No unfinished UI controls
- Prefer working vertical slices over generated boilerplate

Begin with **Milestone 1 only**. First propose the architecture, repository structure, database model, major decisions, and plan. Wait for approval before generating code.
