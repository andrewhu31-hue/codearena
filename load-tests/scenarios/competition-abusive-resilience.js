import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || "30s";
const SUBMISSION_PROBABILITY = Number(__ENV.SUBMISSION_PROBABILITY || 0.25);
const CONTEXT_FILE = __ENV.CONTEXT_FILE;
const RUN_TAG = __ENV.RUN_TAG || `abusive-${Date.now()}`;

if (!CONTEXT_FILE) throw new Error("CONTEXT_FILE is required");

const context = JSON.parse(open(CONTEXT_FILE));
const users = new SharedArray("abusive-users", () => context.users);

const epContest200 = new Counter("ep_contest_200");
const epContest429 = new Counter("ep_contest_429");
const epContest4xx = new Counter("ep_contest_other_4xx");
const epContest5xx = new Counter("ep_contest_5xx");
const epContestTransport = new Counter("ep_contest_transport_errors");

const epProblem200 = new Counter("ep_problem_200");
const epProblem429 = new Counter("ep_problem_429");
const epProblem4xx = new Counter("ep_problem_other_4xx");
const epProblem5xx = new Counter("ep_problem_5xx");
const epProblemTransport = new Counter("ep_problem_transport_errors");

const epSubmit200 = new Counter("ep_submit_200");
const epSubmit201 = new Counter("ep_submit_201");
const epSubmit429 = new Counter("ep_submit_429");
const epSubmit4xx = new Counter("ep_submit_other_4xx");
const epSubmit5xx = new Counter("ep_submit_5xx");
const epSubmitTransport = new Counter("ep_submit_transport_errors");

const epPoll200 = new Counter("ep_poll_200");
const epPoll429 = new Counter("ep_poll_429");
const epPoll4xx = new Counter("ep_poll_other_4xx");
const epPoll5xx = new Counter("ep_poll_5xx");
const epPollTransport = new Counter("ep_poll_transport_errors");

const epLeaderboard200 = new Counter("ep_leaderboard_200");
const epLeaderboard429 = new Counter("ep_leaderboard_429");
const epLeaderboard4xx = new Counter("ep_leaderboard_other_4xx");
const epLeaderboard5xx = new Counter("ep_leaderboard_5xx");
const epLeaderboardTransport = new Counter("ep_leaderboard_transport_errors");

const retryAfterSeconds = new Trend("retry_after_seconds", true);
const submissionTimeToTerminalMs = new Trend("abusive_submission_time_to_terminal_ms", true);
const admittedSubmissionCount = new Counter("admitted_submission_count");
const terminalSubmissionCount = new Counter("terminal_submission_count");

const SOURCE_CODE =
  `# ${RUN_TAG}\n` +
  "import sys\n" +
  "line = sys.stdin.readline()\n" +
  "if line.endswith('\\n'):\n" +
  "    line = line[:-1]\n" +
  "sys.stdout.write(line)\n";

export const options = {
  scenarios: {
    abusive_resilience: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "3s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "4s", target: 0 },
      ],
      gracefulRampDown: "20s",
      gracefulStop: "20s",
    },
  },
  thresholds: {
    "checks{check:context has users}": ["rate==1.0"],
  },
};

function captureRetryAfter(res) {
  const raw = res?.headers?.["Retry-After"] || res?.headers?.["retry-after"];
  if (!raw) return;
  const seconds = Number(String(raw).trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    retryAfterSeconds.add(seconds);
  }
}

function classify(res, counters) {
  if (!res || res.status === 0) {
    counters.transport.add(1);
    return;
  }

  if (res.status === 200) {
    counters.s200.add(1);
    return;
  }

  if (res.status === 201 && counters.s201) {
    counters.s201.add(1);
    return;
  }

  if (res.status === 429) {
    counters.s429.add(1);
    captureRetryAfter(res);
    return;
  }

  if (res.status >= 500) {
    counters.s5xx.add(1);
    return;
  }

  if (res.status >= 400) {
    counters.s4xx.add(1);
  }
}

function boundedPoll(headers, submissionId) {
  const started = Date.now();
  let delaySeconds = 0.5;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    sleep(delaySeconds);
    const pollRes = http.get(`${BASE_URL}/api/v1/submissions/${submissionId}`, {
      headers,
      timeout: "10s",
    });

    classify(pollRes, {
      s200: epPoll200,
      s429: epPoll429,
      s4xx: epPoll4xx,
      s5xx: epPoll5xx,
      transport: epPollTransport,
    });

    if (pollRes && pollRes.status >= 200 && pollRes.status < 300) {
      const status = pollRes.json("status");
      if (status === "COMPLETED" || status === "FAILED") {
        terminalSubmissionCount.add(1);
        submissionTimeToTerminalMs.add(Date.now() - started);
        return;
      }
    }

    delaySeconds = Math.min(4, delaySeconds * 1.2);
  }
}

export default function () {
  check(users.length > 0, { "context has users": (v) => v === true });
  const user = users[(__VU - 1) % users.length];
  const headers = { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" };

  const contestRes = http.get(`${BASE_URL}/api/v1/contests/${context.contestId}`, {
    headers,
    timeout: "10s",
  });
  classify(contestRes, {
    s200: epContest200,
    s429: epContest429,
    s4xx: epContest4xx,
    s5xx: epContest5xx,
    transport: epContestTransport,
  });

  const problemRes = http.get(`${BASE_URL}/api/v1/problems/${context.problemSlug}`, {
    timeout: "10s",
  });
  classify(problemRes, {
    s200: epProblem200,
    s429: epProblem429,
    s4xx: epProblem4xx,
    s5xx: epProblem5xx,
    transport: epProblemTransport,
  });

  if (Math.random() < SUBMISSION_PROBABILITY) {
    const idempotencyKey = `${RUN_TAG}:${user.userId}:it-${__ITER}`;
    const submitRes = http.post(
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
          "Idempotency-Key": idempotencyKey,
        },
        timeout: "15s",
      },
    );

    classify(submitRes, {
      s200: epSubmit200,
      s201: epSubmit201,
      s429: epSubmit429,
      s4xx: epSubmit4xx,
      s5xx: epSubmit5xx,
      transport: epSubmitTransport,
    });

    if (submitRes && (submitRes.status === 200 || submitRes.status === 201)) {
      admittedSubmissionCount.add(1);
      const submissionId = submitRes.json("id");
      if (submissionId) {
        boundedPoll(headers, submissionId);
      }
    }
  }

  if (Math.random() < 0.4) {
    const leaderboardRes = http.get(
      `${BASE_URL}/api/v1/contests/${context.contestId}/leaderboard`,
      {
        timeout: "10s",
      },
    );
    classify(leaderboardRes, {
      s200: epLeaderboard200,
      s429: epLeaderboard429,
      s4xx: epLeaderboard4xx,
      s5xx: epLeaderboard5xx,
      transport: epLeaderboardTransport,
    });
  }

  sleep(0.2 + Math.random() * 0.4);
}
