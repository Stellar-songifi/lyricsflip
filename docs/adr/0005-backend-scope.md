# ADR-0005: Backend architecture and off-chain scope

- **Status:** Accepted
- **Date:** 2024-07-01
- **Tracking issue:** LF-226
- **Deciders:** Full-stack team
- **Related ADRs:** ADR-0006

## Context

LyricsFlip combines on-chain gameplay recorded on Stellar (Soroban) with an off-chain application backend. We must clearly define the boundary of responsibility between smart contracts and the backend server.

Relying exclusively on blockchain RPC for all features causes excessive latency, lacks support for rich social interactions (e.g., chat, push notifications, global leaderboards), and provides poor search capabilities across songs and lyrics. Conversely, storing gameplay rules or balances off-chain compromises trust and decentralization.

## Decision

We establish a clear division of scope between the on-chain contracts and the NestJS backend:

- **On-chain contracts (`lyricsflip`, `lyricsflip-nft`, `lyricsflip-escrow`)**: Sole source of truth for game rules, round outcomes, stakes, payouts, stats, and badges.
- **Backend service (`backend/`)**: Provides auxiliary off-chain features including:
  - Aggregated search and catalog indexing across songs, artists, and genres.
  - Social interactions: chat rooms, player friendships, direct challenges, and notification dispatch.
  - Event indexing cache to accelerate leaderboard queries without repeatedly scanning ledger history.

## Consequences

### Positive
- High-throughput social and search features operate with sub-second latency.
- Financial transactions and round fairness remain decentralized and tamper-proof on Stellar.

### Negative
- Requires maintaining an off-chain event ingestion pipeline (indexer) to keep database caches synchronized with ledger state.

## Alternatives considered

- **Fully on-chain**: Rejected due to high transaction fees and storage limitations for real-time chat, notifications, and complex text search.
- **Fully off-chain with periodic settlement**: Rejected because users require non-custodial wagers and verifiable question grading.

## Status history

- 2024-07-01 — Proposed
- 2024-07-15 — Accepted
