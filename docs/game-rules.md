# Game Rules & Glossary

This document is the single source of truth for LyricsFlip game rules. Every rule below is
backed by a named function or constant in the contract. Source files:

- [`contracts/game/src/lib.rs`](../contracts/game/src/lib.rs) — entry points and constants
- [`contracts/game/src/types.rs`](../contracts/game/src/types.rs) — data structures
- [`contracts/game/src/events.rs`](../contracts/game/src/events.rs) — emitted events

If this document and the contract disagree, the contract wins — please open an issue.

Related issues: LF-005 (`rounds_won` tracking), LF-013 (scoring), LF-014 (payouts),
LF-259–LF-262 (escrow lifecycle), LF-177 (card difficulty — **planned**),
LF-246 (this rewrite).

## Rounds

There are no fixed game modes. A round is a generic container for **1 to 8 players**.

- `get_max_players()` returns the current maximum number of players per round
  (default **8**).
- `set_max_players(admin, n)` updates the maximum. The contract rejects values below
  **2** (`MIN_PLAYERS`) or above the hard cap of **8** (`MAX_PLAYERS`).
- A round with a single player is a solo practice round; any number of players from 2 to
  `get_max_players()` compete in the same round.

> **Planned:** tournaments and brackets are not implemented. Tracked in LF-135.

## Round Lifecycle

1. **Created** — `create_round(...)` stores the round with its players, cards, and
   `start_time`. The round deadline is `start_time + ROUND_DURATION_SECONDS`.
2. **Active** — players submit answers via `submit_answer(...)` while
   `ledger.timestamp() < start_time + ROUND_DURATION_SECONDS`.
3. **Completed** — `complete_round(...)` (or `settle_round(...)` when a pool is
   involved) scores the answers, selects winners, updates `PlayerStats`, and emits
   `RoundCompleted { round_id, winners, scores }`.

`ROUND_DURATION_SECONDS` is **300** (5 minutes) — see
[`lib.rs`](../contracts/game/src/lib.rs).

## Card Timer

- Each card has an answer window of `CARD_ANSWER_WINDOW_SECONDS` = **15** seconds,
  measured from the moment the card is presented to the player.
- An answer submitted **after** the window is still **accepted** and recorded, but it is
  **scored as wrong** (zero points). It is never rejected outright.
- A player who never submits an answer for a card scores zero for that card.

## Scoring

Points depend only on **how quickly** a correct answer arrives. Cards have no difficulty
(see *Planned* below).

| Constant | Value | Meaning |
| --- | --- | --- |
| `FIRST_LEDGER_GRACE_SECONDS` | **6** | Answers within this many seconds earn full points. |
| `MAX_CORRECT_POINTS` | **100** | Points for a correct answer inside the grace window. |
| `POINTS_DECAY_PER_SECOND` | **5** | Points lost for each second beyond the grace window. |
| `MIN_CORRECT_POINTS` | **10** | Floor — a correct answer never scores less than this. |
| `CARD_ANSWER_WINDOW_SECONDS` | **15** | Answers after this are scored as wrong. |

All constants are defined in [`lib.rs`](../contracts/game/src/lib.rs).

The score for one correct answer is:

```
elapsed = answer_time - card_presented_time
if elapsed <= FIRST_LEDGER_GRACE_SECONDS:
    points = MAX_CORRECT_POINTS
else:
    points = max(MAX_CORRECT_POINTS - (elapsed - FIRST_LEDGER_GRACE_SECONDS) * POINTS_DECAY_PER_SECOND,
                 MIN_CORRECT_POINTS)
```

- Incorrect answers, missing answers, and answers after `CARD_ANSWER_WINDOW_SECONDS`
  award **zero** points for that card.
- The round score is the sum of points across all cards in the round.

> **Planned:** card difficulty (easy/medium/hard multipliers) is not implemented.
> Tracked in LF-177.

## Streaks

- Consecutive correct answers update the player's **streak** in `PlayerStats`.
- Streaks **do not** change the points awarded for a card. They are a statistic only.
- An incorrect or missing answer resets the streak to zero.

## Winner Selection

Winners are chosen by `complete_round(...)` / `settle_round(...)` in this order:

1. **Highest round score** wins.
2. If scores tie, the player with the **lowest total answer time** wins.
3. If both score and total answer time tie, the round has **shared co-winners** — every
   tied player is recorded as a winner.
4. If **every** player scores zero, the round has **no winners** and the escrow owner
   cancels the escrow round, refunding every depositor in full with no protocol fee.

Each winner's `rounds_won` in `PlayerStats` is incremented by **1** (see LF-005).
Shared co-winners **each** receive the increment — a tie does not divide the win.

### Decision Table

The table below is the normative specification for `determine_round_winners` and
`finalize_round`. Every row has a corresponding test in
[`contracts/game/src/lib.rs`](../contracts/game/src/lib.rs).

| # | Scenario | Winner selection | `rounds_won` | Pot payout |
| --- | --- | --- | --- | --- |
| 1 | One player has the strictly highest score | That player alone | +1 to the winner | Entire payout to the winner |
| 2 | Two or more players tie on the highest score, but one has a strictly lower total answer time | The fastest of the tied players alone | +1 to that player | Entire payout to that player |
| 3 | Two or more players tie on both the highest score **and** total answer time | All tied players are co-winners | +1 to **each** co-winner | Payout split **evenly**; integer-division dust goes to the co-winners with the **lowest player index**, one token each, in index order |
| 4 | Every player scores zero | No winners | No change | No payout; the pool stays in escrow (refund path is LF-135) |
| 5 | A player never submits any answer | Scores zero and total answer time counts only submitted answers (0s if none) | Only changes if they win | Only paid if they win |
| 6 | A player answers every card correctly but slowly, another answers fewer cards quickly | Highest **total score** wins; slowness only breaks ties, it never overrides a higher score | +1 to the higher scorer | Entire payout to the higher scorer |
| 7 | Solo round (one player) with a non-zero score | The solo player wins | +1 | Entire payout to the solo player |
| 8 | Solo round (one player) with a zero score | No winners (row 4 applies) | No change | No payout |
| 9 | A winner has left / is no longer a registered player at finalization | The winner is still recorded in `winners` and still gets `rounds_won`; the payout is skipped for that entry and remains in escrow | +1 to the departed winner | Departed winner's share is **not** transferred; it stays in escrow |

Notes:

- **Ties are common.** Total answer time comes from ledger timestamps, which advance in
  roughly 5s steps, so row 3 is the normal outcome for equally fast players.
- **Dust rule.** With `n` co-winners and payout `P`, each receives `P / n`; the remaining
  `P % n` tokens are handed out one at a time to co-winners in ascending player-index
  order. This matches the escrow split in `finalize_round`.
- **Non-answering players** are never rejected from the round; they simply score zero
  (row 5) and can still win a round in which everyone scores zero only if row 4 did not
  apply — it always does, so they never win a zero-score round.

## Fees & Payouts

- `settle_round(...)` splits the round pool into a **payout** and a **protocol fee**.
- The fee is transferred to the treasury at settlement, never on the first claim.
- Winners have a configurable claim deadline (90 days by default). After the deadline,
  `sweep_unclaimed(...)` sends all remaining winner shares to the treasury.
- The fee rate is read and charged when the round is settled; later fee changes do not
  affect a round after settlement.
- `MAX_FEE_BPS` = **1000** basis points (**10%**). `set_fee_bps(admin, bps)` rejects
  values above this cap.
- The fee is sent to the configured treasury address at settlement.
- Admin changes emit `FeeUpdated` and `TreasuryUpdated` events.

Escrow lifecycle is implemented by `onchain/contracts/lyricsflip-escrow`: rounds move
`Open → Locked → Settled`, or `Open|Locked → Cancelled`; deposits are rejected after
locking, and cancellation/refund paths return each depositor's recorded amount.

## Worked Example

Three players — **Ada**, **Bo**, and **Cy** — play a 3-card round. The pool is
**1,000** tokens, the fee is **500 bps (5%)**, and the treasury is `T`.

### Answers

| Player | Card 1 | Card 2 | Card 3 |
| --- | --- | --- | --- |
| Ada | correct @ 4s | correct @ 9s | wrong |
| Bo | correct @ 6s | correct @ 12s | wrong |
| Cy | correct @ 10s | wrong | wrong |

### Scoring (time decay)

- **Ada:** Card 1 = 100 (within 6s). Card 2 = 100 − (9−6)×5 = **85**. Card 3 = 0.
  Total = **185**. Total answer time = 4 + 9 = **13s**.
- **Bo:** Card 1 = 100 (exactly 6s). Card 2 = 100 − (12−6)×5 = **70**. Card 3 = 0.
  Total = **170**. Total answer time = 6 + 12 = **18s**.
- **Cy:** Card 1 = 100 − (10−6)×5 = **80**. Cards 2 and 3 = 0. Total = **80**.
  Total answer time = **10s**.

### Winner

Ada has the highest score (**185**), so Ada wins outright. `RoundCompleted` is emitted
with `winners = [Ada]` and `scores = {Ada: 185, Bo: 170, Cy: 80}`. Ada's `rounds_won`
increases by 1.

### Tie-break illustration

Suppose Ada and Bo had both scored **185**. Ada's total answer time is **13s** and Bo's
is **18s**, so Ada still wins on the lower total answer time (decision table row 2). If
both had scored 185 *and* both had a total answer time of 13s, they would be **shared
co-winners** (row 3): each would gain +1 `rounds_won`, and the 950-token payout would be
split 475 / 475. Had the payout been 951, Ada (lower index) would receive 476 and Bo 475.

### Fee & payout

- Fee = 1,000 × 500 / 10,000 = **50** tokens, sent to the snapshotted treasury `T`.
- Payout = 1,000 − 50 = **950** tokens, sent to Ada.

## Glossary

| UI term | Meaning | Contract behaviour |
| --- | --- | --- |
| **Odds** | Not a contract concept. | **Remove from the UI.** There is no contract value to map it to. |
| **Pot / Pool** | Total tokens staked for a round. | Escrowed balance tracked per depositor; `settle_round` splits it into payout + fee. |
| **Potential win** | Amount a player would receive if they win. | `pool − fee`, split equally with deterministic remainder distribution. |
| **Difficulty** | How hard a card is. | **Not implemented** (LF-177). Cards have no difficulty; points depend only on answer time. |
| **Duration** | How long a player has to answer a card. | `CARD_ANSWER_WINDOW_SECONDS` = **15s**. Late answers are accepted but scored as wrong. |
| **Round deadline** | When the round closes. | `start_time + ROUND_DURATION_SECONDS` = **300s**. |
| **Streak** | Consecutive correct answers. | Tracked in `PlayerStats` only; does **not** affect points. |

## References

- LF-005 — `rounds_won` tracking (not escrow)
- LF-013 — scoring
- LF-014 — payouts and fees
- LF-259 — escrow cancellation and refunds
- LF-260 — no-winner full refunds
- LF-261 — claim deadlines, sweeps, and typed escrow events
- LF-262 — escrow storage TTL extension
- LF-177 — card difficulty (**planned**)
- LF-246 — this document rewrite
- LF-271 — tie-breaking and edge-case decision table
