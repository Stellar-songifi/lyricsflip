# Monitoring (LF-250)

Dashboards and alerts derived from indexer data. These run against testnet
first and are promoted to mainnet after sign-off (see
`docs/mainnet-checklist.md`).

## Dashboards

| Panel | Source | Purpose |
| ----- | ------ | ------- |
| Rounds started vs. finalized | indexer `rounds` table | Detect rounds that never finalize |
| Average finalize delay | indexer round timestamps | Spot stuck or slow rounds |
| `submit_answer` error rate by code | indexer `events` (submit_answer) | Surface contract/UX failures |
| Escrow balance vs. sum of open pots | on-chain balance + indexer open pots | Detect accounting drift |
| Indexer lag | indexer ledger cursor vs. chain tip | Detect stale data |

## Alerts

- **Stuck rounds** — a round started but not finalized within the expected
  window (warn at 2x expected delay, page at 4x).
- **High submit_answer error rate** — error rate by code exceeds threshold for
  5 minutes.
- **Escrow drift** — escrow balance deviates from the sum of open pots beyond a
  small tolerance.
- **Indexer lag** — indexer cursor falls more than N ledgers behind chain tip.

Thresholds are placeholders to be tuned on testnet before mainnet promotion.
