# ADR-0007: Solo and combined round entry points

- **Status:** Accepted
- **Date:** 2024-07-15
- **Tracking issue:** LF-163, LF-164, LF-297
- **Deciders:** Contracts team, Frontend team
- **Related ADRs:** ADR-0002

## Context

In multiplayer lobbies, round creation and participation requires a staged lifecycle:
1. `create_round`: The host initializes the round, selects mode and parameters, and receives a round ID.
2. `join_round`: Participating players join the lobby.
3. `set_ready`: Each player signs readiness. Once all players are ready, the round transitions to active.

For solo (single-player) rounds, there are no other participants. Subjecting solo players to the multi-step lobby flow forces them to submit multiple consecutive transactions, sign multiple prompts, wait through intermediate block confirmations, and poll readiness before seeing the first card. This creates severe user friction and consumes unnecessary network fees.

## Decision

We introduce an **atomic, single-signature solo entry point (`create_solo_round`)**:

- **Atomic creation & initialization**: `create_solo_round` initializes the round, registers the caller, automatically sets readiness, and transitions the round status immediately to `RoundStatus::InProgress` within a single transaction.
- **Combined entry points (LF-163/164)**: The contract internalizes common setup logic so `create_round` serves multiplayer lobbies while `create_solo_round` serves streamlined single-player play without branching complexity or redundant storage writes.

## Consequences

### Positive
- One-click immediate gameplay for single players.
- Reduces transaction submission and fee overhead by combining three operations into one.
- Eliminates polling loops and readiness timeouts for solo sessions.

### Negative
- Requires maintaining two public entry points (`create_round` and `create_solo_round`) in contracts and client bindings.

## Alternatives considered

- **Unified multi-step flow**: Rejected due to poor single-player user experience.
- **Boolean flag on `create_round(..., is_solo: bool)`**: Rejected in favor of explicit typed entry points to minimize argument complexity and branching in contracts.

## Status history

- 2024-07-15 — Proposed
- 2024-08-01 — Accepted
- 2024-11-18 — Wired to frontend solo flow (LF-297)
