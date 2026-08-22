// General API traffic: anonymous browsing of the problem catalog and
// contest listing, the read-heavy path most requests are expected to be.
// Run: k6 run --out json=results/general-traffic.json scenarios/general-traffic.js
// Configure: BASE_URL, VUS, DURATION env vars.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || "20s";

export const options = {
  scenarios: {
    general_traffic: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const problemsRes = http.get(`${BASE_URL}/api/v1/problems`);
  check(problemsRes, { "GET /problems is 200": (r) => r.status === 200 });

  const problems = problemsRes.json("problems");
  if (Array.isArray(problems) && problems.length > 0) {
    const slug = problems[Math.floor(Math.random() * problems.length)].slug;
    const detailRes = http.get(`${BASE_URL}/api/v1/problems/${slug}`);
    check(detailRes, { "GET /problems/:slug is 200": (r) => r.status === 200 });
  }

  const contestsRes = http.get(`${BASE_URL}/api/v1/contests`);
  check(contestsRes, { "GET /contests is 200": (r) => r.status === 200 });

  sleep(1);
}
