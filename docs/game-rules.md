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

## Tournaments

Tournaments are a backend-run bracket layered on top of ordinary on-chain rounds. The
contract has no tournament concept; the backend (`backend/src/tournament/**`) owns the
bracket and schedules each match as a regular round.

- A tournament has **participants** (seeded into the bracket) and **matches**. Each match
  is a single-elimination pairing of two participants.
- Every match is created as a **private round** using the LF-264 allowlist, so only the
  two matched participants can join it.
- When a match's round is finalized, the backend reads the indexed `RoundCompleted`
  event, records the winner, and advances them into the next bracket slot
automatically — no manual database edits are required.
- The bracket generator supports **single elimination** first; an 8-player bracket runs
  through three rounds (quarterfinals, semifinals, final) to a single winner.
- Winner selection within a match follows the normal round rules below (score, then total
  answer time, then shared co-winners).

> **Planned:** frontend bracket pages are tracked separately.

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
`Open → Locked → Settled`, or `Open|Locked → Cancelled`.
