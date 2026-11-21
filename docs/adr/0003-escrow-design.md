# ADR-0003: Escrow architecture and pull-payment claims

- **Status:** Accepted
- **Date:** 2024-06-20
- **Tracking issue:** LF-135, LF-259, LF-260
- **Deciders:** Contracts team, Security team
- **Related ADRs:** ADR-0007

## Context

LyricsFlip supports wager rounds where participants stake SEP-41 tokens (such as XLM or USDC) into a prize pot, and winners claim winnings according to game results.

Managing player funds introduces significant security and operational considerations:
- Storing balances in the main game contract mixes game state management with token custody.
- Push-based payouts (sending tokens automatically to winners upon round settlement) introduce denial-of-service vulnerabilities if a winner's account is frozen, missing trustlines, or failing authentication.
- Abandoned rounds or uncollected payouts risk permanently locking tokens on-chain.

## Decision

We will implement a **separate, dedicated escrow contract (`lyricsflip-escrow`)** utilizing a **pull-payment claim pattern**:

1. **Separation of custody**: The game contract manages gameplay rules and acts as the authorized round oracle, while `lyricsflip-escrow` holds token balances.
2. **Pull-payment claims**: Upon settlement, `settle_round` records winners, the pot distribution, protocol fees, and a configurable `claim_deadline`. Winners withdraw their share via `claim_winnings(caller, round_id)`.
3. **Refund guarantees**: If a round fails to start, is cancelled, or has no winners, depositors reclaim their exact stakes via `refund` or `cancel_round`.
4. **Treasury sweep**: If winners fail to claim before `claim_deadline`, `sweep_unclaimed` allows sweeping unclaimed balances to the protocol treasury to prevent stranded funds.

## Consequences

### Positive
- Isolates financial custody from gameplay bugs or contract upgrades in `lyricsflip`.
- Eliminates DoS attack vectors inherent in push transfers, ensuring round settlement never halts due to individual recipient failures.
- Deterministic handling of fees and dust shares.

### Negative
- Requires players to sign an extra transaction to withdraw winnings (`claim_winnings`).
- Requires cross-contract authentication and coordination between `lyricsflip` and `lyricsflip-escrow`.

## Alternatives considered

- **Built-in escrow in game contract**: Rejected to adhere to the principle of least privilege and prevent custody risk during game logic updates.
- **Push payments at finalization**: Rejected due to vulnerability to reentrancy, failed external token transfers blocking finalization, and gas limits.

## Status history

- 2024-06-20 — Proposed
- 2024-07-05 — Accepted
- 2024-11-18 — Hardened with lifecycle guards and treasury sweep (LF-259, LF-260)
