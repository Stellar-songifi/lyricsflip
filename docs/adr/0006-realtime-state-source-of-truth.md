# ADR-0006: Source of truth for real-time multiplayer state

- **Status:** Accepted
- **Date:** 2024-07-05
- **Tracking issue:** LF-225, LF-197
- **Deciders:** Frontend team, Backend team
- **Related ADRs:** ADR-0005

## Context

Multiplayer rounds require synchronized, low-latency gameplay: timer ticks, countdown alerts, player readiness indications, and in-round scoreboards.

Using contract polling over Soroban RPC for 15-second flip timers generates extreme RPC load, suffers from multi-second ledger block times, and causes out-of-sync flip animations between players in different regions. Conversely, letting the backend determine who won without on-chain settlement destroys trust.

## Decision

We adopt a **hybrid state synchronization model** governed by [`docs/realtime-protocol.md`](../realtime-protocol.md):

- **In-round ephemeral state**: The backend gateway (`GameGateway`) serves as the authority for fast, ephemeral in-game events: `room:state`, `player:ready`, `timer:tick`, `card:next`, and `score:update`.
- **Persistent financial and game state**: The Stellar smart contracts (`lyricsflip`, `lyricsflip-escrow`) remain the ultimate authority for round creation, player wager deposits, cryptographic answer grading, final score recording, and payout settlement.

## Consequences

### Positive
- Sub-second UI reactivity and synchronized timer count downs for all players in a room.
- Eliminates unnecessary RPC simulation and transaction fees during intermediary timer ticks.
- Retains full cryptographic verification of answers and non-custodial payouts on Stellar.

### Negative
- Requires maintaining compatibility across frontend, backend, and documentation specifications (resolved in LF-197).

## Alternatives considered

- **Pure contract polling**: Rejected due to latency, RPC rate limits, and unsynchronized timer rendering.
- **Peer-to-peer WebRTC**: Rejected due to NAT traversal complexities and client trust vulnerabilities in wager games.

## Status history

- 2024-07-05 — Proposed
- 2024-07-20 — Accepted
- 2024-11-18 — Unified protocol specifications (LF-197)
