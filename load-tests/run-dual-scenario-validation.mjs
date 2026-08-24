import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(ROOT, "results");
mkdirSync(RESULTS_DIR, { recursive: true });
const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const HARD_DRAIN_DEADLINE_MS = Number(process.env.HARD_DRAIN_DEADLINE_MS || 20 * 60 * 1000);
const SCENARIO_A_POLL_WAIT_MS = Number(process.env.SCENARIO_A_POLL_WAIT_MS || 15 * 60 * 1000);
const SCENARIO_B_VUS = Number(process.env.SCENARIO_B_VUS || 100);
const SCENARIO_B_DURATION = process.env.SCENARIO_B_DURATION || "30s";
const SCENARIO_B_SUBMISSION_PROBABILITY = Number(process.env.SCENARIO_B_SUBMISSION_PROBABILITY || 0.25);

const runStamp = Date.now();
const suiteTag = `dual-validation-${runStamp}`;
const checkpointPath = join(RESULTS_DIR, `${suiteTag}-checkpoint.json`);

const artifacts = {
    phase0: join(RESULTS_DIR, `${suiteTag}-phase0-semantics.json`),
    scenarioA: {
        raw: join(RESULTS_DIR, `${suiteTag}-scenarioA-k6-raw.txt`),
        summary: join(RESULTS_DIR, `${suiteTag}-scenarioA-k6-summary.json`),
        db: join(RESULTS_DIR, `${suiteTag}-scenarioA-db-reconciliation.json`),
        queue: join(RESULTS_DIR, `${suiteTag}-scenarioA-queue-worker-reconciliation.json`),
        apiLogical: join(RESULTS_DIR, `${suiteTag}-scenarioA-api-logical-accounting.json`),
        gate: join(RESULTS_DIR, `${suiteTag}-scenarioA-gate-report.json`),
    },
    scenarioB: {
        raw: join(RESULTS_DIR, `${suiteTag}-scenarioB-k6-raw.txt`),
        summary: join(RESULTS_DIR, `${suiteTag}-scenarioB-k6-summary.json`),
        db: join(RESULTS_DIR, `${suiteTag}-scenarioB-db-reconciliation.json`),
        queue: join(RESULTS_DIR, `${suiteTag}-scenarioB-queue-worker-reconciliation.json`),
        gate: join(RESULTS_DIR, `${suiteTag}-scenarioB-gate-report.json`),
    },
    final: join(RESULTS_DIR, `${suiteTag}-final-report.json`),
};

function writeCheckpoint(phase, extra = {}) {
    writeFileSync(
        checkpointPath,
        JSON.stringify(
            {
                updatedAt: new Date().toISOString(),
                suiteTag,
                phase,
                artifacts,
                ...extra,
            },
            null,
            2,
        ),
    );
}

function run(command, args, opts = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        ...opts,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = `${command} ${args.join(" ")}\nexit=${result.status}\nstdout=${result.stdout || ""}\nstderr=${result.stderr || ""}`;
        throw new Error(detail);
    }
    return result.stdout || "";
}

function runSoft(command, args, opts = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        ...opts,
    });
    if (result.error) throw result.error;
    return result;
}

function dockerComposeExec(service, shellCommand) {
    return run("docker", ["compose", "exec", "-T", service, "sh", "-lc", shellCommand]);
}

function dockerComposeExecSoft(service, shellCommand) {
    return runSoft("docker", ["compose", "exec", "-T", service, "sh", "-lc", shellCommand]);
}

function parseDbName(databaseUrl) {
    try {
        const url = new URL(databaseUrl);
        return (url.pathname || "").replace(/^\//, "").split("?")[0];
    } catch {
        return null;
    }
}

function getJsonMetric(summary, metricName, field = "count") {
    return summary?.metrics?.[metricName]?.[field] ?? null;
}

function collectLimiterTouchedKeys() {
    const out = dockerComposeExec(
        "redis",
        "for k in $(redis-cli --scan --pattern 'ratelimit:general:*'); do v=$(redis-cli GET \"$k\"); echo \"$k|${v:-0}\"; done",
    ).trim();
    if (!out) return [];
    return out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [key, count] = line.split("|");
            return { key, count: Number(count) || 0 };
        });
}

function collectQueueSnapshot() {
    const out = dockerComposeExec(
        "redis",
        "echo wait=$(redis-cli LLEN bull:submissions:wait); echo active=$(redis-cli LLEN bull:submissions:active); echo delayed=$(redis-cli ZCARD bull:submissions:delayed); echo prioritized=$(redis-cli ZCARD bull:submissions:prioritized); echo waiting_children=$(redis-cli ZCARD bull:submissions:waiting-children); echo paused=$(redis-cli LLEN bull:submissions:paused)",
    );
    const snapshot = {};
    for (const line of out.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.includes("=")) continue;
        const [k, v] = trimmed.split("=");
        snapshot[k] = Number(v) || 0;
    }
    snapshot.pendingTotal =
        (snapshot.wait || 0) +
        (snapshot.active || 0) +
        (snapshot.delayed || 0) +
        (snapshot.prioritized || 0) +
        (snapshot.waiting_children || 0) +
        (snapshot.paused || 0);
    return snapshot;
}

function waitForQueueDrain(deadlineMs) {
    const started = Date.now();
    let last = collectQueueSnapshot();
    while (Date.now() - started < deadlineMs) {
        if (last.pendingTotal === 0) {
            return { drained: true, waitedMs: Date.now() - started, final: last };
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
        last = collectQueueSnapshot();
    }
    return { drained: false, waitedMs: Date.now() - started, final: last };
}

function countStaleContestantContainers() {
    const out = run("docker", ["ps", "-a", "--format", "{{.Names}}"])
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
    return out.filter((name) => /^codearena-run-test-/.test(name));
}

function getRestartCounts() {
    const names = ["codearena-api-1", "codearena-postgres-1", "codearena-redis-1"];
    const workerNames = run(
        "docker",
        [
            "ps",
            "--filter",
            "label=com.docker.compose.project=codearena",
            "--filter",
            "label=com.docker.compose.service=judge-worker",
            "--format",
            "{{.Names}}",
        ],
    )
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);

    const all = [...names, ...workerNames];
    const inspect = run("docker", ["inspect", "-f", "{{.Name}}|{{.RestartCount}}|{{.State.Status}}", ...all]);
    const map = {};
    for (const line of inspect.split("\n")) {
        if (!line.trim()) continue;
        const [name, restartCount, status] = line.replace(/^\//, "").split("|");
        map[name] = { restartCount: Number(restartCount) || 0, status };
    }
    return map;
}

function countOomKilled() {
    const names = run("docker", ["ps", "-a", "--format", "{{.Names}}"])
        .split("\n")
        .map((v) => v.trim())
        .filter((v) => v.startsWith("codearena-"));
    if (names.length === 0) return [];
    const out = run("docker", ["inspect", "-f", "{{.Name}}|{{.State.OOMKilled}}", ...names]);
    return out
        .split("\n")
        .filter(Boolean)
        .map((line) => line.replace(/^\//, "").split("|"))
        .filter(([, oom]) => oom === "true")
        .map(([name]) => name);
}

function parseActiveCompetitionSemantics() {
    const scenarioText = readFileSync(join(ROOT, "scenarios", "active-competition.js"), "utf8");
    const limiterText = readFileSync(join(ROOT, "..", "apps", "api", "src", "middleware", "rateLimit.ts"), "utf8");

    const phase0 = {
        sourceScenario: "load-tests/scenarios/active-competition.js",
        generalLimiterSource: "apps/api/src/middleware/rateLimit.ts",
        submissionLimiterSource: "apps/api/src/routes/submission.routes.ts",
        semantics: {
            executor: "ramping-vus",
            iterationBehavior:
                "Each iteration calls contest detail and problem detail; probabilistically submits; if submitted, polls submission status and optionally polls leaderboard reflection.",
            postFrequency: "Math.random() <= SUBMISSION_PROBABILITY (default 0.2) per iteration.",
            pollingCadence: "Fixed 0.5s poll interval for submission status; fixed 0.5s leaderboard poll interval.",
            pollingTimeout: "Submission: up to 120 attempts (~60s). Leaderboard: up to 10 attempts (~5s).",
            handles429RetryAfter: "No explicit Retry-After handling in current scenario.",
            expectedRequestVolume:
                "Per iteration baseline 2 GETs; plus 1 POST with probability p; plus up to 120 status GETs per admitted submission and up to 10 leaderboard GETs for accepted verdict paths.",
        },
        limiter: {
            generalKeying: "By req.ip (key format general:${req.ip}).",
            submissionKeying: "By authenticated user id when available, else req.ip.",
            sharedBudgetConclusion:
                "Yes. 100 localhost k6 VUs share one general limiter budget when API sees same client IP, because general limiter key is IP-based.",
        },
        evidence: {
            containsGeneralIpKeying: limiterText.includes("general:${req.ip}"),
            containsSubmissionAuthKeying: limiterText.includes("req.auth?.sub ?? req.ip"),
            containsRampingVus: scenarioText.includes('executor: "ramping-vus"'),
            containsSubmissionProbability: scenarioText.includes("SUBMISSION_PROBABILITY"),
        },
    };

    writeFileSync(artifacts.phase0, JSON.stringify(phase0, null, 2));
    return phase0;
}

function sqlValue(sql, dbName) {
    const out = run("docker", [
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "codearena",
        "-d",
        dbName,
        "-t",
        "-A",
        "-c",
        sql,
    ]).trim();
    return out;
}

function sqlRows(sql, dbName) {
    const out = run("docker", [
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "codearena",
        "-d",
        dbName,
        "-t",
        "-A",
        "-F",
        "|",
        "-c",
        sql,
    ]).trim();
    return out ? out.split("\n") : [];
}

function runK6Scenario({ scenarioPath, contextFile, runTag, summaryPath, rawPath, extraEnv = {} }) {
    const env = {
        ...process.env,
        BASE_URL,
        CONTEXT_FILE: contextFile,
        RUN_TAG: runTag,
        ...extraEnv,
    };

    const args = [
        "run",
        "--summary-export",
        summaryPath,
        "--env",
        `BASE_URL=${BASE_URL}`,
        "--env",
        `CONTEXT_FILE=${contextFile}`,
        "--env",
        `RUN_TAG=${runTag}`,
        ...Object.entries(extraEnv).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
        scenarioPath,
    ];

    const result = runSoft("k6", args, { env });
    const raw = `exit=${result.status}\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`;
    writeFileSync(rawPath, raw);

    if (!existsSync(summaryPath)) {
        throw new Error(`k6 summary not found at ${summaryPath}`);
    }

    return { exitCode: result.status ?? 1, rawPath, summaryPath };
}

function prechecks() {
    const apiDb = dockerComposeExec("api", "echo $DATABASE_URL").trim();
    const workerDb = dockerComposeExec("judge-worker", "echo $DATABASE_URL").trim();
    const apiDbName = parseDbName(apiDb);
    const workerDbName = parseDbName(workerDb);

    const nonTerminal = Number(
        sqlValue("select count(*) from submissions where status in ('QUEUED','RUNNING')", "codearena_loadtest"),
    );
    const queue = collectQueueSnapshot();
    const staleContainers = countStaleContestantContainers();

    return {
        apiDatabaseUrl: apiDb,
        workerDatabaseUrl: workerDb,
        apiDbName,
        workerDbName,
        databaseTargetIsLoadtest: apiDbName === "codearena_loadtest",
        apiWorkerSameDatabase: apiDb === workerDb,
        nonTerminalSubmissionsCount: nonTerminal,
        queuePendingTotal: queue.pendingTotal,
        queue,
        staleContestantContainers: staleContainers,
    };
}

function reconcileScenarioA({ runTag, contextFile, summaryPath, startedAtIso, endedAtIso, dbName, restartBefore }) {
    const context = JSON.parse(readFileSync(contextFile, "utf8"));
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));

    const intendedUsers = context.users.map((u) => u.userId);
    const distinctUsers = new Set(intendedUsers);
    const expectedIdemKeys = intendedUsers.map((u) => `${runTag}:${u}`);

    const rows = sqlRows(
        `select id, \"userId\", status, verdict, coalesce(\"idempotencyKey\",''), coalesce(\"idempotencyScope\",''), coalesce(\"testsPassed\",0), coalesce(\"testsTotal\",0) from submissions where \"sourceCode\" like '# ${runTag}%'`,
        dbName,
    );

    const submissions = rows.map((line) => {
        const [id, userId, status, verdict, idempotencyKey, idempotencyScope, testsPassed, testsTotal] = line.split("|");
        return {
            id,
            userId,
            status,
            verdict: verdict || null,
            idempotencyKey: idempotencyKey || null,
            idempotencyScope: idempotencyScope || null,
            testsPassed: Number(testsPassed) || 0,
            testsTotal: Number(testsTotal) || 0,
        };
    });

    const byUser = new Map();
    for (const sub of submissions) {
        if (!byUser.has(sub.userId)) byUser.set(sub.userId, []);
        byUser.get(sub.userId).push(sub);
    }

    const duplicatesByUser = [...byUser.entries()].filter(([, subs]) => subs.length > 1);
    const nonTerminal = submissions.filter((s) => s.status !== "COMPLETED" && s.status !== "FAILED");
    const accepted = submissions.filter((s) => s.verdict === "ACCEPTED");
    const verdictDistribution = submissions.reduce((acc, s) => {
        const key = s.verdict || s.status;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const contestId = context.contestId;
    const contestProblemPoints = Number(
        sqlValue(`select points from contest_problems where \"contestId\"='${contestId}' limit 1`, dbName),
    );

    const scoreRows = sqlRows(
        `select \"userId\", score, \"solvedCount\" from contest_scores where \"contestId\"='${contestId}'`,
        dbName,
    );
    const scoreMap = new Map(
        scoreRows.map((line) => {
            const [userId, score, solvedCount] = line.split("|");
            return [userId, { score: Number(score) || 0, solvedCount: Number(solvedCount) || 0 }];
        }),
    );

    const acceptedScoreMismatches = [];
    for (const sub of accepted) {
        const score = scoreMap.get(sub.userId);
        if (!score || score.score !== contestProblemPoints || score.solvedCount !== 1) {
            acceptedScoreMismatches.push({ userId: sub.userId, score: score || null });
        }
    }

    const leakedContainers = countStaleContestantContainers();

    const logsSince = run("docker", ["compose", "logs", "--since", startedAtIso, "--tail", "5000", "api", "judge-worker", "postgres", "redis"]);
    const restartAfter = getRestartCounts();
    const ooms = countOomKilled();

    const restartDelta = [];
    for (const [name, after] of Object.entries(restartAfter)) {
        const before = restartBefore[name]?.restartCount || 0;
        if (after.restartCount > before) {
            restartDelta.push({ name, before, after: after.restartCount });
        }
    }

    const stalledLogHits = logsSince
        .split("\n")
        .filter((line) => /stalled|lock renew|Submission job failed/i.test(line));

    const dbRecon = {
        runTag,
        dbName,
        intendedUsersCount: intendedUsers.length,
        distinctIntendedUsersCount: distinctUsers.size,
        expectedIdempotencyKeysCount: expectedIdemKeys.length,
        submissionsPersistedCount: submissions.length,
        distinctSubmissionIdsCount: new Set(submissions.map((s) => s.id)).size,
        duplicateUsersWithMoreThanOneSubmission: duplicatesByUser.map(([userId, subs]) => ({ userId, count: subs.length })),
        nonTerminalCount: nonTerminal.length,
        acceptedCount: accepted.length,
        verdictDistribution,
        acceptedScoreMismatches,
        contestProblemPoints,
        submissions,
    };

    const queueRecon = {
        queueAfterScenario: collectQueueSnapshot(),
        queueDrain: waitForQueueDrain(SCENARIO_A_POLL_WAIT_MS),
        stalledOrLockRenewLogEvents: stalledLogHits,
        restartDelta,
        oomKilledContainers: ooms,
        leakedContestantContainers: leakedContainers,
    };

    const apiLogicalAccounting = collectScenarioAApiLogicalAccounting({
        runTag,
        contextFile,
        startedAtIso,
        endedAtIso,
    });

    const gateFailures = [];
    if (intendedUsers.length !== 100) gateFailures.push(`intended_users=${intendedUsers.length}`);
    if (distinctUsers.size !== 100) gateFailures.push(`distinct_intended_users=${distinctUsers.size}`);
    if (expectedIdemKeys.length !== 100) gateFailures.push(`idempotency_keys=${expectedIdemKeys.length}`);
    if (submissions.length !== 100) gateFailures.push(`persisted_submissions=${submissions.length}`);
    if (new Set(submissions.map((s) => s.id)).size !== 100) gateFailures.push("distinct_submission_ids_not_100");
    if (duplicatesByUser.length !== 0) gateFailures.push("user_has_more_than_one_submission");
    if (nonTerminal.length !== 0) gateFailures.push(`non_terminal=${nonTerminal.length}`);
    if (accepted.length !== 100) gateFailures.push(`accepted=${accepted.length}`);
    if (acceptedScoreMismatches.length !== 0) gateFailures.push(`contest_scores_mismatch=${acceptedScoreMismatches.length}`);
    if (apiLogicalAccounting.logicalUsersExpected !== 100) {
        gateFailures.push(`logical_users_expected=${apiLogicalAccounting.logicalUsersExpected}`);
    }
    if (apiLogicalAccounting.logicalUsersReported !== 100) {
        gateFailures.push(`logical_users_reported=${apiLogicalAccounting.logicalUsersReported}`);
    }
    if (!queueRecon.queueDrain.drained) gateFailures.push("queue_not_drained_before_deadline");
    if (queueRecon.leakedContestantContainers.length !== 0) gateFailures.push("leaked_containers_detected");
    if (queueRecon.stalledOrLockRenewLogEvents.length !== 0) gateFailures.push("stalled_or_lock_renew_errors_detected");
    if (queueRecon.restartDelta.length !== 0) gateFailures.push("service_restarts_detected");
    if (queueRecon.oomKilledContainers.length !== 0) gateFailures.push("oom_killed_detected");

    const report = {
        scenario: "A",
        runTag,
        k6: {
            summaryPath,
            checksPass: summary?.metrics?.checks?.passes ?? null,
            checksFail: summary?.metrics?.checks?.fails ?? null,
        },
        pass: gateFailures.length === 0,
        failures: gateFailures,
    };

    dbRecon.apiLogicalAccounting = apiLogicalAccounting;

    writeFileSync(artifacts.scenarioA.db, JSON.stringify(dbRecon, null, 2));
    writeFileSync(artifacts.scenarioA.queue, JSON.stringify(queueRecon, null, 2));
    writeFileSync(artifacts.scenarioA.gate, JSON.stringify(report, null, 2));

    return { report, dbRecon, queueRecon, apiLogicalAccounting };
}

function parseApiSubmissionAttemptLine(line, runTag) {
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) return null;
    let obj;
    try {
        obj = JSON.parse(line.slice(jsonStart));
    } catch {
        return null;
    }

    const req = obj?.req;
    if (!req || req.method !== "POST" || req.url !== "/api/v1/submissions") return null;
    const idemKey = req?.headers?.["idempotency-key"] ?? req?.headers?.["Idempotency-Key"];
    if (!idemKey || !String(idemKey).startsWith(`${runTag}:`)) return null;

    const userId = String(idemKey).slice(`${runTag}:`.length);
    const statusCode = obj?.res?.statusCode ?? null;
    const lifecycle = obj?.msg ?? null;
    const requestId = req?.id ?? null;

    return { userId, idempotencyKey: String(idemKey), statusCode, lifecycle, requestId };
}

function collectScenarioAApiLogicalAccounting({ runTag, contextFile, startedAtIso, endedAtIso }) {
    const context = JSON.parse(readFileSync(contextFile, "utf8"));
    const users = context.users.map((u) => u.userId);

    const logs = run("docker", [
        "compose",
        "logs",
        "--since",
        startedAtIso,
        "--until",
        endedAtIso,
        "api",
    ]);

    const attempts = [];
    for (const line of logs.split("\n")) {
        const parsed = parseApiSubmissionAttemptLine(line, runTag);
        if (parsed) attempts.push(parsed);
    }

    const byUser = new Map(users.map((userId) => [userId, []]));
    for (const attempt of attempts) {
        if (!byUser.has(attempt.userId)) continue;
        byUser.get(attempt.userId).push(attempt);
    }

    const logicalUserOutcomes = users.map((userId) => {
        const userAttempts = byUser.get(userId) || [];
        const saw201 = userAttempts.some((a) => a.statusCode === 201);
        const saw200 = userAttempts.some((a) => a.statusCode === 200);
        const sawTransportOnly =
            userAttempts.length > 0 &&
            userAttempts.every((a) => a.statusCode === null && String(a.lifecycle || "").includes("request aborted"));

        let delivery = "no_attempt_observed";
        if (saw201 || saw200) delivery = "received_201_or_200";
        else if (sawTransportOnly) delivery = "transport_errors_only";
        else if (userAttempts.length > 0) delivery = "attempted_without_201_200";

        return {
            userId,
            attempts: userAttempts.length,
            received201: saw201,
            received200Replay: saw200,
            delivery,
            requestIds: userAttempts.map((a) => a.requestId).filter(Boolean),
        };
    });

    const attemptLevel = {
        totalAttempts: attempts.length,
        transportErrors: attempts.filter((a) => a.statusCode === null && String(a.lifecycle || "").includes("request aborted")).length,
        status201: attempts.filter((a) => a.statusCode === 201).length,
        status200: attempts.filter((a) => a.statusCode === 200).length,
        status429: attempts.filter((a) => a.statusCode === 429).length,
        status5xx: attempts.filter((a) => Number(a.statusCode) >= 500).length,
    };

    const result = {
        runTag,
        window: { startedAtIso, endedAtIso },
        logicalUsersExpected: users.length,
        logicalUsersReported: logicalUserOutcomes.length,
        usersReceived201Or200: logicalUserOutcomes.filter((u) => u.delivery === "received_201_or_200").length,
        usersTransportErrorsOnly: logicalUserOutcomes.filter((u) => u.delivery === "transport_errors_only").length,
        usersAttemptedWithout201Or200: logicalUserOutcomes.filter((u) => u.delivery === "attempted_without_201_200").length,
        usersWithNoAttemptObserved: logicalUserOutcomes.filter((u) => u.delivery === "no_attempt_observed").length,
        logicalUserOutcomes,
        attemptLevel,
    };

    writeFileSync(artifacts.scenarioA.apiLogical, JSON.stringify(result, null, 2));
    return result;
}

function reconcileScenarioB({ runTag, contextFile, summaryPath, startedAtIso, dbName, restartBefore }) {
    const context = JSON.parse(readFileSync(contextFile, "utf8"));
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));

    const rows = sqlRows(
        `select id, \"userId\", status, verdict, coalesce(\"idempotencyKey\",''), \"createdAt\" from submissions where \"sourceCode\" like '# ${runTag}%' order by \"createdAt\" asc`,
        dbName,
    );

    const submissions = rows.map((line) => {
        const [id, userId, status, verdict, idempotencyKey, createdAt] = line.split("|");
        return { id, userId, status, verdict: verdict || null, idempotencyKey: idempotencyKey || null, createdAt };
    });

    const duplicatesByIdempotency = sqlRows(
        `select \"idempotencyKey\", count(*) from submissions where \"sourceCode\" like '# ${runTag}%' and \"idempotencyKey\" is not null group by \"idempotencyKey\" having count(*) > 1`,
        dbName,
    ).map((line) => {
        const [idempotencyKey, count] = line.split("|");
        return { idempotencyKey, count: Number(count) || 0 };
    });

    const nonTerminal = submissions.filter((s) => s.status !== "COMPLETED" && s.status !== "FAILED");
    const queueDrain = waitForQueueDrain(HARD_DRAIN_DEADLINE_MS);
    const queueAfter = collectQueueSnapshot();
    const leakedContainers = countStaleContestantContainers();

    const logsSince = run("docker", ["compose", "logs", "--since", startedAtIso, "--tail", "7000", "api", "judge-worker", "postgres", "redis"]);
    const ooms = countOomKilled();

    const restartAfter = getRestartCounts();
    const restartDelta = [];
    for (const [name, after] of Object.entries(restartAfter)) {
        const before = restartBefore[name]?.restartCount || 0;
        if (after.restartCount > before) {
            restartDelta.push({ name, before, after: after.restartCount });
        }
    }

    const infraErrors = logsSince
        .split("\n")
        .filter((line) => /unhandled|fatal|oom|segfault|panic|internal server error|can't reach database server|ECONNRESET|EOF|timed out/i.test(line));

    const endpointBreakdown = {
        contest: {
            s200: getJsonMetric(summary, "ep_contest_200"),
            s429: getJsonMetric(summary, "ep_contest_429"),
            other4xx: getJsonMetric(summary, "ep_contest_other_4xx"),
            s5xx: getJsonMetric(summary, "ep_contest_5xx"),
            transport: getJsonMetric(summary, "ep_contest_transport_errors"),
        },
        problem: {
            s200: getJsonMetric(summary, "ep_problem_200"),
            s429: getJsonMetric(summary, "ep_problem_429"),
            other4xx: getJsonMetric(summary, "ep_problem_other_4xx"),
            s5xx: getJsonMetric(summary, "ep_problem_5xx"),
            transport: getJsonMetric(summary, "ep_problem_transport_errors"),
        },
        submit: {
            s200: getJsonMetric(summary, "ep_submit_200"),
            s201: getJsonMetric(summary, "ep_submit_201"),
            s429: getJsonMetric(summary, "ep_submit_429"),
            other4xx: getJsonMetric(summary, "ep_submit_other_4xx"),
            s5xx: getJsonMetric(summary, "ep_submit_5xx"),
            transport: getJsonMetric(summary, "ep_submit_transport_errors"),
        },
        poll: {
            s200: getJsonMetric(summary, "ep_poll_200"),
            s429: getJsonMetric(summary, "ep_poll_429"),
            other4xx: getJsonMetric(summary, "ep_poll_other_4xx"),
            s5xx: getJsonMetric(summary, "ep_poll_5xx"),
            transport: getJsonMetric(summary, "ep_poll_transport_errors"),
        },
        leaderboard: {
            s200: getJsonMetric(summary, "ep_leaderboard_200"),
            s429: getJsonMetric(summary, "ep_leaderboard_429"),
            other4xx: getJsonMetric(summary, "ep_leaderboard_other_4xx"),
            s5xx: getJsonMetric(summary, "ep_leaderboard_5xx"),
            transport: getJsonMetric(summary, "ep_leaderboard_transport_errors"),
        },
    };

    const limiterKeysObserved = collectLimiterTouchedKeys();

    const admittedByHttp = (endpointBreakdown.submit.s200 || 0) + (endpointBreakdown.submit.s201 || 0);
    const persistedCount = submissions.length;

    const accepted = submissions.filter((s) => s.verdict === "ACCEPTED");
    const scoreRows = sqlRows(
        `select \"userId\", score, \"solvedCount\" from contest_scores where \"contestId\"='${context.contestId}'`,
        dbName,
    );
    const scoreMap = new Map(
        scoreRows.map((line) => {
            const [userId, score, solvedCount] = line.split("|");
            return [userId, { score: Number(score) || 0, solvedCount: Number(solvedCount) || 0 }];
        }),
    );

    const leaderboardMismatches = accepted.filter((s) => {
        const score = scoreMap.get(s.userId);
        return !score || score.solvedCount < 1 || score.score < 100;
    });

    const dbRecon = {
        runTag,
        persistedSubmissions: submissions,
        persistedCount,
        admittedByHttp,
        rejectedBeforeAdmissionEstimate: Math.max(0, admittedByHttp - persistedCount),
        duplicatePersistedByIdempotency: duplicatesByIdempotency,
        nonTerminalCount: nonTerminal.length,
        acceptedCount: accepted.length,
        leaderboardMismatches: leaderboardMismatches.map((m) => m.userId),
    };

    const queueRecon = {
        queueAfterTraffic: queueAfter,
        queueDrain,
        limiterKeysObserved,
        restartDelta,
        oomKilledContainers: ooms,
        leakedContestantContainers: leakedContainers,
        infraErrors,
    };

    const gateFailures = [];
    if (queueRecon.restartDelta.length !== 0) gateFailures.push("service_restarts_detected");
    if (queueRecon.oomKilledContainers.length !== 0) gateFailures.push("oom_killed_detected");
    if (duplicatesByIdempotency.length !== 0) gateFailures.push("duplicate_persisted_idempotency_key");
    if (nonTerminal.length !== 0) gateFailures.push(`non_terminal=${nonTerminal.length}`);
    if (!queueDrain.drained) gateFailures.push("queue_not_drained_before_deadline");
    if (leakedContainers.length !== 0) gateFailures.push("leaked_containers_detected");
    if (leaderboardMismatches.length !== 0) gateFailures.push("leaderboard_mismatch_for_accepted");

    // 429s are expected protection and are not a failure criterion.
    if ((endpointBreakdown.submit.s5xx || 0) > 0 || (endpointBreakdown.poll.s5xx || 0) > 0) {
        gateFailures.push("unexpected_5xx_detected");
    }

    const report = {
        scenario: "B",
        runTag,
        pass: gateFailures.length === 0,
        failures: gateFailures,
        endpointBreakdown,
    };

    writeFileSync(artifacts.scenarioB.db, JSON.stringify(dbRecon, null, 2));
    writeFileSync(artifacts.scenarioB.queue, JSON.stringify(queueRecon, null, 2));
    writeFileSync(artifacts.scenarioB.gate, JSON.stringify(report, null, 2));

    return { report, dbRecon, queueRecon, endpointBreakdown };
}

function ensureContext100(path) {
    const context = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(context.users) || context.users.length !== 100) {
        throw new Error(`context users must be 100 in ${path}`);
    }
    const distinct = new Set(context.users.map((u) => u.userId));
    if (distinct.size !== 100) {
        throw new Error(`context users must be distinct 100 in ${path}`);
    }
    return context;
}

function main() {
    writeCheckpoint("phase0-start");
    const phase0 = parseActiveCompetitionSemantics();
    writeCheckpoint("phase0-complete", { phase0Artifact: artifacts.phase0 });

    writeCheckpoint("prechecks-start");
    const pre = prechecks();
    if (!pre.databaseTargetIsLoadtest) throw new Error(`DATABASE target is not codearena_loadtest (${pre.apiDbName})`);
    if (!pre.apiWorkerSameDatabase) throw new Error("API and worker DATABASE_URL are not identical");
    if (pre.nonTerminalSubmissionsCount !== 0) throw new Error(`non terminal submissions before run: ${pre.nonTerminalSubmissionsCount}`);
    if (pre.queuePendingTotal !== 0) throw new Error(`queue pending before run: ${pre.queuePendingTotal}`);
    if (pre.staleContestantContainers.length !== 0) {
        throw new Error(`stale contestant containers before run: ${pre.staleContestantContainers.join(",")}`);
    }
    writeCheckpoint("prechecks-complete", { prechecks: pre });

    const sharedContextPath = join(RESULTS_DIR, "context.json");
    ensureContext100(sharedContextPath);

    const scenarioARunTag = `${suiteTag}-A`;
    const syncStartEpochMs = Date.now() + 4000;

    writeCheckpoint("scenarioA-start", { scenarioARunTag, syncStartEpochMs });
    const startedA = new Date().toISOString();
    const restartBeforeA = getRestartCounts();
    const aK6 = runK6Scenario({
        scenarioPath: join(ROOT, "scenarios", "competition-sync-oneshot-100.js"),
        contextFile: sharedContextPath,
        runTag: scenarioARunTag,
        summaryPath: artifacts.scenarioA.summary,
        rawPath: artifacts.scenarioA.raw,
        extraEnv: {
            EXPECTED_VUS: "100",
            SYNC_START_EPOCH_MS: String(syncStartEpochMs),
            POLL_MAX_WAIT_MS: String(SCENARIO_A_POLL_WAIT_MS),
            EXPECT_VERDICT: "ACCEPTED",
        },
    });
    const endedA = new Date().toISOString();

    const aRecon = reconcileScenarioA({
        runTag: scenarioARunTag,
        contextFile: sharedContextPath,
        summaryPath: artifacts.scenarioA.summary,
        startedAtIso: startedA,
        endedAtIso: endedA,
        dbName: "codearena_loadtest",
        restartBefore: restartBeforeA,
    });

    writeCheckpoint("scenarioA-complete", { scenarioA: { k6: aK6, gate: aRecon.report } });

    if (!aRecon.report.pass) {
        const finalFail = {
            suiteTag,
            baseUrl: BASE_URL,
            stoppedAfter: "scenarioA",
            prechecks: pre,
            phase0,
            scenarioA: aRecon.report,
            artifacts,
        };
        writeFileSync(artifacts.final, JSON.stringify(finalFail, null, 2));
        console.log(`final_report=${artifacts.final}`);
        process.exitCode = 1;
        return;
    }

    // Fresh context for Scenario B.
    writeCheckpoint("scenarioB-fresh-context-start");
    run("node", [join(ROOT, "setup", "prepare.mjs"), "100"], { env: process.env });
    const scenarioBContextPath = join(RESULTS_DIR, `context-scenarioB-${suiteTag}.json`);
    copyFileSync(sharedContextPath, scenarioBContextPath);
    ensureContext100(scenarioBContextPath);
    writeCheckpoint("scenarioB-fresh-context-complete", { scenarioBContextPath });

    const scenarioBRunTag = `${suiteTag}-B`;
    writeCheckpoint("scenarioB-start", { scenarioBRunTag });
    const startedB = new Date().toISOString();
    const restartBeforeB = getRestartCounts();

    const bK6 = runK6Scenario({
        scenarioPath: join(ROOT, "scenarios", "competition-abusive-resilience.js"),
        contextFile: scenarioBContextPath,
        runTag: scenarioBRunTag,
        summaryPath: artifacts.scenarioB.summary,
        rawPath: artifacts.scenarioB.raw,
        extraEnv: {
            VUS: String(SCENARIO_B_VUS),
            DURATION: SCENARIO_B_DURATION,
            SUBMISSION_PROBABILITY: String(SCENARIO_B_SUBMISSION_PROBABILITY),
        },
    });

    const bRecon = reconcileScenarioB({
        runTag: scenarioBRunTag,
        contextFile: scenarioBContextPath,
        summaryPath: artifacts.scenarioB.summary,
        startedAtIso: startedB,
        dbName: "codearena_loadtest",
        restartBefore: restartBeforeB,
    });

    writeCheckpoint("scenarioB-complete", { scenarioB: { k6: bK6, gate: bRecon.report } });

    const finalReport = {
        suiteTag,
        baseUrl: BASE_URL,
        phase0,
        prechecks: pre,
        scenarioA: aRecon.report,
        scenarioB: bRecon.report,
        artifacts,
    };

    writeFileSync(artifacts.final, JSON.stringify(finalReport, null, 2));
    writeCheckpoint("complete", { finalReport: artifacts.final });
    console.log(`final_report=${artifacts.final}`);
}

main();
