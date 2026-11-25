# k6 load tests

These scripts exercise the LyricsFlip game loop and wager state machine under concurrent load.
They cover the three scenarios in `Stellar-songifi/lyricsflip-toolkit#147`:

| Scenario | Script | What it drives |
| --- | --- | --- |
| `solo_play` | [`solo-play.js`](./solo-play.js) | `POST /api/v1/quick-game/rounds` → `GET .../question` → `POST .../answers` → `GET .../roundId`, so guess-submission throughput and the in-memory round map are hit concurrently. |
| `head_to_head_staking` | [`head-to-head.js`](./head-to-head.js) | Mock `escrowed → locked → settled → claimed` wager lifecycle with two stakers per match, plus a wager read. This is the concurrency path a wallet/contract/indexer flow would take. |
| `reconcile_backlog` | [`reconcile-backlog.js`](./reconcile-backlog.js) | Seeds a backlog of `escrowed` wagers, then runs concurrent reconciliation sweeps and reads the last result. |

[`all.js`](./all.js) runs all three scenarios together; the individual scripts are useful for
isolating a regression.

## Why a mock settlement harness?

The production API intentionally has **no HTTP write path for wagers**. Placing, staking,
settling and claiming happen in the wallet by calling the Stellar escrow contract, and the
wager rows are written by the indexer (`backend/src/wager/wager.controller.ts`,
`backend/src/indexer/services/indexer.service.ts`). The nightly reconciliation service also has
no HTTP trigger (`backend/src/wager/services/wager-reconciliation.service.ts`).

[`mock-settlement-server.js`](./mock-settlement-server.js) is a test-only Node HTTP service that
emulates that wallet → escrow → indexer write path and exposes a `POST /mock/reconcile` trigger.
It keeps the same wager statuses (`escrowed`, `won`, `lost`, `claimed`) and reconciliation DTO
shape as the backend, and serializes work per match/round with a lock so lock contention is
visible under load. It does **not** replace the real contract or the real reconciler in
production, and no application source was changed to accommodate it.

## Run locally

No npm dependencies are required for the harness itself. k6 2.4.0 is the version used to
establish the committed baseline.

```bash
# Terminal 1: mock settlement / indexer stand-in
node load/mock-settlement-server.js

# Terminal 2: all scenarios, 10 VUs per ramping scenario, 5 reconcile VUs
BASE_URL=http://127.0.0.1:4555 k6 run load/all.js

# Or one scenario at a time
BASE_URL=http://127.0.0.1:4555 k6 run load/solo-play.js
BASE_URL=http://127.0.0.1:4555 k6 run load/head-to-head.js
BASE_URL=http://127.0.0.1:4555 k6 run load/reconcile-backlog.js
```

Each run writes `load/last-run-summary.json` (override with `SUMMARY_EXPORT`) with p95/p99,
error rate, success rate and RPS **per scenario**, and prints the same values to stdout. Compare
a run against the committed baseline:

```bash
node load/compare-baseline.js load/last-run-summary.json load/baseline.json
```

A non-zero exit means at least one scenario regressed beyond the configured tolerance. Default
tolerances are in [`compare-baseline.js`](./compare-baseline.js) and can be overridden with
`BASELINE_P95_TOLERANCE`, `BASELINE_P99_TOLERANCE`, `BASELINE_ERROR_TOLERANCE`,
`BASELINE_RPS_TOLERANCE` and `BASELINE_SUCCESS_TOLERANCE`.

## Run against a staging-like backend

The solo scenario targets the real backend at `${BASE_URL}/api/v1`. The wager and reconcile
scenarios target the mock harness by default, because the real backend has no equivalent write
or trigger endpoints.

1. Start a **single** backend instance with seeded questions. Quick-game rounds live in an
   in-memory `Map`, so multiple instances will produce `404 Round not found` under load.
2. Raise the default rate limit for the load-test environment. The default is 60 requests /
   minute per IP (`RATE_LIMIT_TTL=60000`, `RATE_LIMIT_LIMIT=60`), which will throttle a 10-VU
   solo run; use e.g. `RATE_LIMIT_LIMIT=6000`. `/auth/*` has a separate 5/minute limit, so
   pre-provision a token instead of signing in during the run.
3. Point the scripts at it:

   ```bash
   BASE_URL=https://staging.example.com \
   LOAD_AUTH_TOKEN="$STAGING_TOKEN" \
   ENVIRONMENT=staging \
   LOAD_VUS=50 LOAD_DURATION=5m \
   MOCK_SETTLEMENT_URL=http://127.0.0.1:4555 \
   RECONCILE_TRIGGER_URL=http://127.0.0.1:4555 \
   k6 run load/all.js
   ```

   `RECONCILE_TRIGGER_URL` + `RECONCILE_PATH` (default `/mock/reconcile`) and
   `RECONCILE_STATUS_PATH` (default `/mock/reconcile/status`) let a staging environment supply
   its own test-only reconcile trigger later without changing the scripts.

4. Promote the result only after reviewing it:

   ```bash
   BASELINE_SOURCE='staging run, 50 VUs, 5m' \
     node load/update-baseline.js load-summary.json load/baseline.json
   ```

   Then commit `load/baseline.json` together with [`BASELINE.md`](./BASELINE.md).

### Configuration reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `http://127.0.0.1:4555` | Backend base URL (no `/api/v1` suffix). |
| `MOCK_SETTLEMENT_URL` | `BASE_URL` | Mock settlement / indexer harness base URL. |
| `RECONCILE_TRIGGER_URL` | `MOCK_SETTLEMENT_URL` | Base URL for the reconcile sweep trigger. |
| `RECONCILE_PATH` | `/mock/reconcile` | Sweep trigger path. |
| `RECONCILE_STATUS_PATH` | `/mock/reconcile/status` | Last-sweep status path. |
| `ENVIRONMENT` | derived from `BASE_URL` | Tag applied to summaries (`local-mock` or `staging`). |
| `LOAD_VUS` | `10` | Peak VUs for the ramping solo and wager scenarios. |
| `LOAD_DURATION` | `20s` | Steady-state duration for ramping scenarios. |
| `LOAD_RAMP_UP` / `LOAD_RAMP_DOWN` | `5s` / `5s` | Ramp stages. |
| `RECONCILE_VUS` / `RECONCILE_DURATION` | `5` / `20s` | Reconcile sweep load. |
| `RECONCILE_BACKLOG` | `200` | Pending wagers seeded in `setup()`. |
| `SOLO_QUESTIONS` / `SOLO_DIFFICULTY` | `3` / `2` | Questions per solo round. |
| `WAGER_STAKE` | `10000000` | Base-unit stake per player. |
| `LOAD_AUTH_TOKEN` | empty | Pre-provisioned bearer token for guarded routes. |
| `LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD` | empty | Optional one-time sign-in during `setup()`; avoid at high VU counts. |
| `P95_LIMIT_MS` / `P99_LIMIT_MS` | `1500` / `3000` | k6 threshold limits. |
| `ERROR_RATE_LIMIT` / `SUCCESS_RATE_MIN` | `0.05` / `0.95` | k6 threshold limits. |
| `SUMMARY_EXPORT` | `load/last-run-summary.json` | Per-run JSON summary path. |
| `MOCK_PORT` | `4555` | Mock harness listen port. |
| `MOCK_LATENCY_MS` / `MOCK_JITTER_MS` | `5` / `10` | Artificial harness latency. |

## CI

[`.github/workflows/load-test.yml`](../.github/workflows/load-test.yml) runs on a weekly schedule
(Monday 03:23 UTC) and on `workflow_dispatch`. With no `base_url` input and no
`LOAD_TEST_BASE_URL` secret it starts the local mock harness, runs all three scenarios, checks
the baseline and uploads the summary as an artifact. Supplying a staging URL (or configuring the
secret) runs against that environment; promote a reviewed staging result before enabling the
scheduled job against it.

The dispatch inputs can override VUs and duration without editing the workflow. The
`update_baseline` input skips the regression check and uploads the summary as a candidate so a
maintainer can promote it deliberately.
