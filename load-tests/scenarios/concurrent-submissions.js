// Concurrent submissions: each iteration submits a genuinely correct
// solution and polls until it's judged, measuring submission throughput
// and time-to-judge (queue wait + real Docker execution) end to end.
// Run: k6 run --env CONTEXT_FILE=$(pwd)/results/context.json \
//   --summary-export=results/concurrent-submissions-summary.json scenarios/concurrent-submissions.js
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || "20s";

const context = JSON.parse(open(__ENV.CONTEXT_FILE));
const users = new SharedArray("users", () => context.users);

const judgeDurationMs = new Trend("judge_duration_ms", true);
const acceptedCount = new Counter("submissions_accepted");
const timedOutCount = new Counter("submissions_not_judged_in_time");

export const options = {
  scenarios: {
    concurrent_submissions: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "3s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "3s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.1"],
  },
};

// Genuinely correct for the seeded "echo" load-test problem.
const SOURCE = "import sys\nsys.stdout.write(sys.stdin.read())\n";

export default function () {
  const user = users[__VU % users.length];
  const headers = { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" };

  const submitRes = http.post(
    `${BASE_URL}/api/v1/submissions`,
    JSON.stringify({ problemId: context.problemId, language: "PYTHON", sourceCode: SOURCE }),
    { headers },
  );
  const accepted = check(submitRes, { "submission queued (201)": (r) => r.status === 201 });
  if (!accepted) return;

  const submissionId = submitRes.json("id");
  const start = Date.now();

  for (let attempt = 0; attempt < 30; attempt++) {
    sleep(0.5);
    const pollRes = http.get(`${BASE_URL}/api/v1/submissions/${submissionId}`, { headers });
    const status = pollRes.json("status");
    if (status === "COMPLETED" || status === "FAILED") {
      judgeDurationMs.add(Date.now() - start);
      if (pollRes.json("verdict") === "ACCEPTED") acceptedCount.add(1);
      return;
    }
  }
  timedOutCount.add(1);
}
