# Final validation report (2026-08-24)

This report records the final validated capacity claim without additional reruns.

## Supported capacity claim

Use the corrected 50-user runs as the current supported end-to-end claim:

- `50/50` full journeys completed
- `50/50` accepted
- `50/50` leaderboard-reflected
- zero final idempotent GET failures
- zero P1001, lock/stall, INTERNAL_ERROR, and leaked containers

This result was reproduced twice:

- `final-e2e-50-corrected-1787601679`
- `final-e2e-50-corrected-rerestore-1787609192`

Artifacts:

- [load-tests/results/final-e2e-50-corrected-1787601679-raw.json](../load-tests/results/final-e2e-50-corrected-1787601679-raw.json)
- [load-tests/results/final-e2e-50-corrected-1787601679-summary.json](../load-tests/results/final-e2e-50-corrected-1787601679-summary.json)
- [load-tests/results/final-e2e-50-corrected-rerestore-1787609192-raw.json](../load-tests/results/final-e2e-50-corrected-rerestore-1787609192-raw.json)
- [load-tests/results/final-e2e-50-corrected-rerestore-1787609192-summary.json](../load-tests/results/final-e2e-50-corrected-rerestore-1787609192-summary.json)

## Stretch test only (not supported capacity)

Record the 100-user run as stretch-test evidence only:

- `66/100` full journeys completed
- all 66 admitted submissions were accepted and leaderboard-reflected
- failed journeys occurred before submission creation because API GET stages encountered saturation/429
- therefore, 100 active users is not currently a supported claim

Artifacts:

- [load-tests/results/final-100-e2e-1787607937-raw.json](../load-tests/results/final-100-e2e-1787607937-raw.json)
- [load-tests/results/final-100-e2e-1787607937-summary.json](../load-tests/results/final-100-e2e-1787607937-summary.json)
- [load-tests/results/final-100-e2e-1787607937-db-reconciliation.json](../load-tests/results/final-100-e2e-1787607937-db-reconciliation.json)
- [load-tests/results/final-100-e2e-1787607937-queue-worker-reconciliation.json](../load-tests/results/final-100-e2e-1787607937-queue-worker-reconciliation.json)
- [load-tests/results/final-100-e2e-1787607937-resource-health-snapshots.json](../load-tests/results/final-100-e2e-1787607937-resource-health-snapshots.json)
- [load-tests/results/final-100-e2e-1787607937-report.md](../load-tests/results/final-100-e2e-1787607937-report.md)

## Decision

Current supported active-user capacity claim: **50 users**.

Current non-supported active-user claim: **100 users**.
