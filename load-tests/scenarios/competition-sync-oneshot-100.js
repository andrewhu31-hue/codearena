import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const CONTEXT_FILE = __ENV.CONTEXT_FILE;
const RUN_TAG = __ENV.RUN_TAG || `sync-oneshot-${Date.now()}`;
const EXPECTED_VUS = Number(__ENV.EXPECTED_VUS || 100);
const SYNC_START_EPOCH_MS = Number(__ENV.SYNC_START_EPOCH_MS || 0);
const POST_MAX_ATTEMPTS = Number(__ENV.POST_MAX_ATTEMPTS || 2);
const POLL_BASE_MS = Number(__ENV.POLL_BASE_MS || 750);
const POLL_CAP_MS = Number(__ENV.POLL_CAP_MS || 12000);
const POLL_JITTER_RATIO = Number(__ENV.POLL_JITTER_RATIO || 0.2);
const POLL_MAX_WAIT_MS = Number(__ENV.POLL_MAX_WAIT_MS || 900000);
const EXPECT_VERDICT = __ENV.EXPECT_VERDICT || "ACCEPTED";

if (!CONTEXT_FILE) throw new Error("CONTEXT_FILE is required");

const context = JSON.parse(open(CONTEXT_FILE));
const users = new SharedArray("sync-users", () => context.users);

const c201 = new Counter("submission_created_201");
const c200Replay = new Counter("submission_replay_200");
const c429 = new Counter("submission_http_429");
const cOther4xx = new Counter("submission_http_other_4xx");
const c5xx = new Counter("submission_http_5xx");
const cTransport = new Counter("submission_transport_errors");
const cDuplicateIds = new Counter("duplicate_submission_ids");
const cTerminal = new Counter("submission_terminal");
const cExpectedVerdict = new Counter("submission_expected_verdict");
const distinctAdmittedUsers = new Counter("distinct_admitted_users");
const poll429 = new Counter("poll_http_429");
const pollOther4xx = new Counter("poll_http_other_4xx");
const poll5xx = new Counter("poll_http_5xx");
const pollTransport = new Counter("poll_transport_errors");

const postLatencyMs = new Trend("post_latency_ms", true);
const timeToTerminalMs = new Trend("submission_time_to_terminal_ms", true);

const SOURCE_CODE =
    `# ${RUN_TAG}\n` +
    "import sys\n" +
    "line = sys.stdin.readline()\n" +
    "if line.endswith('\\n'):\n" +
    "    line = line[:-1]\n" +
    "sys.stdout.write(line)\n";

const seenSubmissionIds = {};
const admittedByUser = {};

export const options = {
    scenarios: {
        synced_one_shot: {
            executor: "per-vu-iterations",
            vus: EXPECTED_VUS,
            iterations: 1,
            maxDuration: "20m",
            gracefulStop: "30s",
        },
    },
    thresholds: {
        "checks{check:intended user count is 100}": ["rate==1.0"],
        "checks{check:context user count is 100}": ["rate==1.0"],
    },
};

function mapUserForVu() {
    return users[(__VU - 1) % users.length];
}

function parseRetryAfterMs(res) {
    if (!res || !res.headers) return null;
    const value = res.headers["Retry-After"] || res.headers["retry-after"];
    if (!value) return null;

    const numeric = Number(String(value).trim());
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric * 1000);

    const epoch = Date.parse(String(value));
    if (Number.isFinite(epoch)) return Math.max(0, epoch - Date.now());

    return null;
}

function backoffDelayMs(attempt, retryAfterMs) {
    const exp = Math.min(POLL_CAP_MS, POLL_BASE_MS * 2 ** Math.max(0, attempt));
    const jitter = exp * POLL_JITTER_RATIO * Math.random();
    const computed = Math.min(POLL_CAP_MS, Math.round(exp + jitter));
    if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)) {
        return Math.min(POLL_CAP_MS, Math.max(computed, retryAfterMs));
    }
    return computed;
}

function waitUntilSyncStart() {
    if (!Number.isFinite(SYNC_START_EPOCH_MS) || SYNC_START_EPOCH_MS <= 0) return;
    const waitMs = SYNC_START_EPOCH_MS - Date.now();
    if (waitMs > 0) sleep(waitMs / 1000);
}

function createSubmissionWithIdempotentRetries(user, idempotencyKey, headers) {
    let first200SubmissionId = null;

    for (let attempt = 0; attempt < POST_MAX_ATTEMPTS; attempt += 1) {
        const started = Date.now();
        const res = http.post(
            `${BASE_URL}/api/v1/submissions`,
            JSON.stringify({
                contestId: context.contestId,
                problemId: context.problemId,
                language: "PYTHON",
                sourceCode: SOURCE_CODE,
            }),
            {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                },
                timeout: "15s",
            },
        );
        postLatencyMs.add(Date.now() - started);

        if (!res || res.status === 0) {
            cTransport.add(1);
            if (attempt < POST_MAX_ATTEMPTS - 1) {
                sleep(0.2 * (attempt + 1));
                continue;
            }
            return { kind: "transport", submissionId: null };
        }

        if (res.status === 201) {
            c201.add(1);
            const submissionId = res.json("id");
            return { kind: "created", submissionId };
        }

        if (res.status === 200) {
            c200Replay.add(1);
            const replayId = res.json("id");
            if (!first200SubmissionId) first200SubmissionId = replayId;
            if (first200SubmissionId !== replayId) {
                cDuplicateIds.add(1);
            }
            return { kind: "replay", submissionId: replayId };
        }

        if (res.status === 429) {
            c429.add(1);
            const retryAfterMs = parseRetryAfterMs(res);
            if (attempt < POST_MAX_ATTEMPTS - 1) {
                const delayMs = backoffDelayMs(attempt, retryAfterMs);
                sleep(delayMs / 1000);
                continue;
            }
            return { kind: "throttled", submissionId: null };
        }

        if (res.status >= 400 && res.status < 500) {
            cOther4xx.add(1);
            return { kind: "other4xx", submissionId: null };
        }

        if (res.status >= 500) {
            c5xx.add(1);
            if (attempt < POST_MAX_ATTEMPTS - 1) {
                sleep(backoffDelayMs(attempt, null) / 1000);
                continue;
            }
            return { kind: "5xx", submissionId: null };
        }

        return { kind: "unexpected", submissionId: null };
    }

    return { kind: "unknown", submissionId: null };
}

function pollSubmissionToTerminal(submissionId, headers) {
    const started = Date.now();
    let attempt = 0;

    while (Date.now() - started <= POLL_MAX_WAIT_MS) {
        const res = http.get(`${BASE_URL}/api/v1/submissions/${submissionId}`, {
            headers,
            timeout: "15s",
        });

        if (!res || res.status === 0) {
            pollTransport.add(1);
            sleep(backoffDelayMs(attempt, null) / 1000);
            attempt += 1;
            continue;
        }

        if (res.status === 429) {
            poll429.add(1);
            const retryAfterMs = parseRetryAfterMs(res);
            sleep(backoffDelayMs(attempt, retryAfterMs) / 1000);
            attempt += 1;
            continue;
        }

        if (res.status >= 500) {
            poll5xx.add(1);
            sleep(backoffDelayMs(attempt, null) / 1000);
            attempt += 1;
            continue;
        }

        if (res.status >= 400 && res.status < 500) {
            pollOther4xx.add(1);
            sleep(backoffDelayMs(attempt, null) / 1000);
            attempt += 1;
            continue;
        }

        const status = res.json("status");
        if (status === "COMPLETED" || status === "FAILED") {
            const verdict = res.json("verdict");
            timeToTerminalMs.add(Date.now() - started);
            cTerminal.add(1);
            if (verdict === EXPECT_VERDICT) cExpectedVerdict.add(1);
            return { reached: true, status, verdict };
        }

        sleep(backoffDelayMs(attempt, null) / 1000);
        attempt += 1;
    }

    return { reached: false, status: null, verdict: null };
}

export default function () {
    check(users.length, { "context user count is 100": (v) => v === 100 });
    check(__VU <= 100, { "intended user count is 100": (v) => v === true });

    const user = mapUserForVu();
    const headers = { Authorization: `Bearer ${user.token}` };
    const idempotencyKey = `${RUN_TAG}:${user.userId}`;

    waitUntilSyncStart();

    const createResult = createSubmissionWithIdempotentRetries(user, idempotencyKey, headers);
    if (!createResult.submissionId) return;

    if (!admittedByUser[user.userId]) {
        admittedByUser[user.userId] = true;
        distinctAdmittedUsers.add(1);
    }

    if (seenSubmissionIds[createResult.submissionId]) {
        cDuplicateIds.add(1);
    }
    seenSubmissionIds[createResult.submissionId] = true;

    pollSubmissionToTerminal(createResult.submissionId, headers);
}
