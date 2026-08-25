// Active competition simulation: users open contest and problem pages,
// submit contest-linked solutions concurrently, wait for judging, then
// verify leaderboard reflects write activity under load.
//
// Run:
// k6 run --env BASE_URL=http://localhost:4000 \
//   --env CONTEXT_FILE=$(pwd)/load-tests/results/competition-context.json \
//   --env VUS=100 --env DURATION=30s \
//   --summary-export=load-tests/results/active-competition-100-summary.json \
//   load-tests/scenarios/active-competition.js
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || "30s";
const SUBMISSION_PROBABILITY = Number(__ENV.SUBMISSION_PROBABILITY || 0.2);

const context = JSON.parse(open(__ENV.CONTEXT_FILE));
const users = new SharedArray("users", () => context.users);

const judgeDurationMs = new Trend("judge_duration_ms", true);
const leaderboardUpdateLagMs = new Trend("leaderboard_update_lag_ms", true);
const acceptedCount = new Counter("submissions_accepted");
const terminalCount = new Counter("submissions_terminal");
const leaderboardReflectedCount = new Counter("leaderboard_reflected");
const leaderboardMissCount = new Counter("leaderboard_miss_after_accept");

const ECHO_PYTHON = `import sys\nline = sys.stdin.readline()\nif line.endswith("\\n"):\n    line = line[:-1]\nsys.stdout.write(line)\n`;

export const options = {
  scenarios: {
    active_competition: {
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
    http_req_failed: ["rate<0.05"],
    "checks{check:contest detail 200}": ["rate>0.99"],
    "checks{check:problem detail 200}": ["rate>0.99"],
    "checks{check:submission queued (201)}": ["rate>0.99"],
    "checks{check:submission reached terminal state}": ["rate>0.90"],
    "checks{check:leaderboard 200}": ["rate>0.99"],
    "checks{check:accepted submission}": ["rate>0.90"],
    "checks{check:leaderboard reflects accepted user}": ["rate>0.80"],
  },
};

function waitForTerminalSubmission(headers, submissionId) {
  const start = Date.now();
  for (let attempt = 0; attempt < 120; attempt++) {
    sleep(0.5);
    const pollRes = http.get(`${BASE_URL}/api/v1/submissions/${submissionId}`, { headers });
    const status = pollRes.json("status");
    if (status === "COMPLETED" || status === "FAILED") {
      judgeDurationMs.add(Date.now() - start);
      return pollRes;
    }
  }
  return null;
}

function waitForLeaderboardReflection(contestId, expectedUserId) {
  const start = Date.now();
  for (let attempt = 0; attempt < 10; attempt++) {
    const lbRes = http.get(`${BASE_URL}/api/v1/contests/${contestId}/leaderboard`);
    const ok = check(lbRes, { "leaderboard 200": (r) => r.status === 200 });
    if (ok) {
      const entries = lbRes.json("entries") || [];
      if (entries.some((entry) => entry.userId === expectedUserId)) {
        leaderboardUpdateLagMs.add(Date.now() - start);
        return true;
      }
    }
    sleep(0.5);
  }
  return false;
}

export default function () {
  const user = users[__VU % users.length];
  const headers = { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" };

  const contestRes = http.get(`${BASE_URL}/api/v1/contests/${context.contestId}`, { headers });
  check(contestRes, { "contest detail 200": (r) => r.status === 200 });

  const problemRes = http.get(`${BASE_URL}/api/v1/problems/${context.problemSlug}`);
  check(problemRes, { "problem detail 200": (r) => r.status === 200 });

  // Simulate that not every page visit turns into an immediate submission.
  if (Math.random() > SUBMISSION_PROBABILITY) {
    sleep(0.8 + Math.random() * 1.4);
    return;
  }

  const submitRes = http.post(
    `${BASE_URL}/api/v1/submissions`,
    JSON.stringify({
      contestId: context.contestId,
      problemId: context.problemId,
      language: "PYTHON",
      sourceCode: ECHO_PYTHON,
    }),
    { headers },
  );
  const queued = check(submitRes, { "submission queued (201)": (r) => r.status === 201 });
  if (!queued) return;

  const submissionId = submitRes.json("id");
  const finalRes = waitForTerminalSubmission(headers, submissionId);
  const terminal = Boolean(finalRes);
  check(terminal, { "submission reached terminal state": (v) => v === true });
  if (!terminal) return;
  terminalCount.add(1);

  const verdict = finalRes.json("verdict");
  const accepted = check(finalRes, { "accepted submission": () => verdict === "ACCEPTED" });
  if (!accepted) return;

  acceptedCount.add(1);
  const reflected = waitForLeaderboardReflection(context.contestId, user.userId);
  if (reflected) {
    leaderboardReflectedCount.add(1);
    check(reflected, { "leaderboard reflects accepted user": (v) => v === true });
  } else {
    leaderboardMissCount.add(1);
    check(reflected, { "leaderboard reflects accepted user": (v) => v === true });
  }
}
