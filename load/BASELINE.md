# Load-test baseline

## Bootstrap baseline (not a production SLO)

No staging URL or credentials were supplied with this change, so the committed baseline was
measured by running `load/all.js` against the local mock settlement harness on
2026-11-25 (k6 2.4.0, single Node process, `MOCK_LATENCY_MS=5`, `MOCK_JITTER_MS=10`).

| Scenario | VUs | Backlog | p95 | p99 | Errors | Success | Throughput |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `solo_play` | 10 | – | 15.67 ms | 16.61 ms | 0% | 100% | 790.88 req/s |
| `head_to_head_staking` | 10 | – | 15.67 ms | 16.62 ms | 0% | 100% | 780.16 req/s |
| `reconcile_backlog` | 5 | 200 escrowed wagers | 60.55 ms | 65.31 ms | 0% | 100% | 137.21 req/s |

Run shape: 2s ramp-up, 10s steady state, 2s ramp-down for the ramping scenarios; 10s constant
load for reconciliation. Machine-readable values are in [`baseline.json`](./baseline.json).

**This is a bootstrap, not a staging baseline.** Its numbers describe the mock harness and must
not be used to assert production readiness. Replace it with a staging run before treating CI as
a performance gate.

## How to establish the staging baseline

```bash
# 1. Run against the staging-like environment (see README.md).
BASE_URL=https://staging.example.com \
LOAD_AUTH_TOKEN="$STAGING_TOKEN" \
ENVIRONMENT=staging \
LOAD_VUS=50 LOAD_DURATION=5m RECONCILE_BACKLOG=2000 \
GITHUB_SHA="$(git rev-parse HEAD)" \
SUMMARY_EXPORT=staging-summary.json \
k6 run load/all.js

# 2. Review the printed p95/p99, error-rate and RPS table, then promote it.
BASELINE_SOURCE='staging run, 50 VUs, 5m, 2000 pending wagers' \
  node load/update-baseline.js staging-summary.json load/baseline.json
```

Commit `load/baseline.json` and update this table in the same PR. The comparison tolerances are
documented in [`README.md`](./README.md) and implemented in
[`compare-baseline.js`](./compare-baseline.js).

## Interpreting future runs

- **p95/p99** — latency under load; compare per scenario, not in aggregate.
- **Errors** — `http_req_failed` rate; includes 4xx/5xx, so auth or rate-limit misconfiguration
  shows up here.
- **Success** — business-level checks (round completed, wager reached `claimed`, reconciliation
  matched). A low success rate with a low HTTP error rate means a state-machine regression.
- **RPS** — achieved throughput at the configured VU count. A drop at unchanged VUs usually
  indicates lock contention or pool exhaustion.
- `reconcile_backlog` latency includes a serialized sweep over the backlog; keep
  `RECONCILE_BACKLOG` constant when comparing runs.
