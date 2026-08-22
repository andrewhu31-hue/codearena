#!/usr/bin/env bash
# Runs every k6 scenario against a running API + judge-worker, then writes
# a Markdown summary. Requires: k6 installed, the API reachable at
# BASE_URL, DATABASE_URL/JWT_ACCESS_SECRET set to the running API's own
# config (setup/prepare.mjs mints tokens with that secret).
set -euo pipefail
cd "$(dirname "$0")"

BASE_URL="${BASE_URL:-http://localhost:4000}"

: "${DATABASE_URL:?DATABASE_URL must point at the running API's database}"
: "${JWT_ACCESS_SECRET:?JWT_ACCESS_SECRET must match the running API's secret}"

mkdir -p results

echo "==> Seeding load-test users/problem/contest"
node setup/prepare.mjs "${LOAD_TEST_USERS:-60}"

CONTEXT_FILE="$(pwd)/results/context.json"

# A breached threshold (e.g. an intentionally strict rate limit kicking in
# under concurrent same-IP traffic) is itself a valid result to record, not
# a script failure — k6 exits non-zero for it, so don't let `set -e` abort
# the run and skip cleanup/summarizing over it.
echo "==> general-traffic"
k6 run --env BASE_URL="$BASE_URL" \
  --summary-export=results/general-traffic-summary.json \
  scenarios/general-traffic.js || true

echo "==> contest-spike"
k6 run --env BASE_URL="$BASE_URL" --env CONTEXT_FILE="$CONTEXT_FILE" \
  --summary-export=results/contest-spike-summary.json \
  scenarios/contest-spike.js || true

echo "==> concurrent-submissions"
k6 run --env BASE_URL="$BASE_URL" --env CONTEXT_FILE="$CONTEXT_FILE" \
  --summary-export=results/concurrent-submissions-summary.json \
  scenarios/concurrent-submissions.js || true

echo "==> Cleaning up load-test data"
node setup/cleanup.mjs

echo "==> Summarizing"
node summarize.mjs

echo "Done. See results/summary.md"
