// One-shot active competition run:
// - 100 VUs
// - each VU performs exactly one contestant flow
// - one submission per user
// - poll until terminal state (or timeout)
//
// Usage:
// RUN_TAG=run_123 k6 run \
//   --env BASE_URL=http://localhost:4000 \
//   --env CONTEXT_FILE=$(pwd)/load-tests/results/competition-context.json \
//   --env RUN_TAG=$RUN_TAG \
//   --summary-export=load-tests/results/active-competition-once-summary.json \
//   load-tests/scenarios/active-competition-once.js
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const RUN_TAG = __ENV.RUN_TAG || `run_${Date.now()}`;
const context = JSON.parse(open(__ENV.CONTEXT_FILE));
const users = new SharedArray("users", () => context.users);

const submissionsTotal = new Counter("submissions_total");
const submissionsTerminal = new Counter("submissions_terminal");
const submissionsAccepted = new Counter("submissions_accepted");

const SOURCE = `# ${RUN_TAG}\nimport sys\nline = sys.stdin.readline()\nif line.endswith("\\n"):\n    line = line[:-1]\nsys.stdout.write(line)\n`;

export const options = {
  scenarios: {
    one_submission_each: {
      executor: "per-vu-iterations",
      vus: 100,
      iterations: 1,
      maxDuration: "15m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    "checks{check:submission queued (201)}": ["rate>0.99"],
    "checks{check:submission terminal}": ["rate>0.99"],
  },
};

function waitForTerminal(headers, submissionId) {
  for (let i = 0; i < 120; i++) {
    sleep(2);
    const poll = http.get(`${BASE_URL}/api/v1/submissions/${submissionId}`, {
      headers,
      timeout: "5s",
    });

    if (!poll || poll.status === 0 || !poll.body) continue;

    let status = null;
    try {
      status = poll.json("status");
    } catch {
      status = null;
    }

    if (status === "COMPLETED" || status === "FAILED") return poll;
  }
  return null;
}

export default function () {
  const user = users[(__VU - 1) % users.length];
  const headers = { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" };

  const submitRes = http.post(
    `${BASE_URL}/api/v1/submissions`,
    JSON.stringify({
      contestId: context.contestId,
      problemId: context.problemId,
      language: "PYTHON",
      sourceCode: SOURCE,
    }),
    { headers, timeout: "10s" },
  );

  const queued = check(submitRes, { "submission queued (201)": (r) => r.status === 201 });
  if (!queued) return;

  submissionsTotal.add(1);
  const submissionId = submitRes.json("id");
  const finalRes = waitForTerminal(headers, submissionId);

  const terminal = Boolean(finalRes);
  check(terminal, { "submission terminal": (v) => v === true });
  if (!terminal) return;

  submissionsTerminal.add(1);
  const verdict = finalRes.json("verdict");
  if (verdict === "ACCEPTED") submissionsAccepted.add(1);
}
