# ADR-0001: Answer privacy on the ledger

- **Status:** Accepted
- **Date:** 2024-06-01
- **Tracking issue:** LF-142, LF-248
- **Deciders:** Contracts team
- **Related ADRs:** None

## Context

The card-based quiz game stores answers (`title`, `artist`, `year`) on the blockchain ledger. In the initial port, the contract exposed answers through `get_card`, `get_round_cards`, and `next_card`, relying on frontend clients to hide them. Any modified client or automated script could read the answer the moment a question appeared. Issue LF-142 requires that no public contract function returns the answer for a card the caller has not yet answered.

The companion analysis document [`onchain/docs/answer-privacy.md`](../../onchain/docs/answer-privacy.md) compared three architectural approaches:
1. **Salted commitments**: Store only `sha256(answer || salt)` and reveal after the round.
2. **Admin commit-reveal**: Round admin commits and reveals answers per round.
3. **Backend oracle**: An off-chain authority signs and validates answers.

## Decision

We will implement a **redaction-first** model that prevents contract view calls and events from leaking active round answers:

- **Redacted question views**: `got_question(env, caller, round_id)` and `next_card` return only the lyric snippet, category, and four options (`QuestionCard`), omitting the answer.
- **Access-restricted cards**: `get_card` and `get_round_cards` redact title, artist, and year for any card currently referenced by a live round (`CardLiveRounds` reverse index). Full card data is returned only once referenced rounds finalize, cancel, or expire.
- **Synchronous validation**: `submit_answer` continues validating directly against internal state so gameplay remains synchronous and responsive without two-phase reveals.

## Consequences

### Positive
- Public callers and frontend scripts can no longer retrieve answers via RPC views or events during active gameplay.
- Gameplay and scoring remain synchronous without multi-block commit-reveal delays.

### Negative
- Raw contract storage (`getLedgerEntries`) still stores card answers in plaintext on-chain. Mitigated by maintaining a large catalogue and enforcing strict per-card answer time limits (`CARD_ANSWER_WINDOW_SECONDS`). Full cryptographic shielding (salted commitments) remains a planned future enhancement.

## Alternatives considered

- **Admin commit-reveal**: Strands rounds if the admin disconnects or griefs by withholding reveals.
- **Off-chain oracle**: Introduces centralized custody and external signing dependencies.

## Status history

- 2024-06-01 — Proposed
- 2024-06-15 — Accepted (LF-248)
- 2024-10-10 — Updated with event redaction (LF-278)
