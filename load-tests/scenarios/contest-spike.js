// Contest-start spike: many registered contestants hitting contest detail
// and the leaderboard in a sharp ramp, simulating everyone refreshing the
// moment a contest goes live.
// Run: k6 run --env CONTEXT_FILE=$(pwd)/results/context.json \
//   --summary-export=results/contest-spike-summary.json scenarios/contest-spike.js
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const VUS = Number(__ENV.VUS || 50);

const context = JSON.parse(open(__ENV.CONTEXT_FILE));
const users = new SharedArray("users", () => context.users);

export const options = {
  scenarios: {
    contest_spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2s", target: VUS },
        { duration: "15s", target: VUS },
        { duration: "3s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const user = users[__VU % users.length];
  const headers = { Authorization: `Bearer ${user.token}` };

  const detailRes = http.get(`${BASE_URL}/api/v1/contests/${context.contestId}`, { headers });
  check(detailRes, { "contest detail 200": (r) => r.status === 200 });

  const leaderboardRes = http.get(`${BASE_URL}/api/v1/contests/${context.contestId}/leaderboard`);
  check(leaderboardRes, { "leaderboard 200": (r) => r.status === 200 });

  sleep(0.5);
}
