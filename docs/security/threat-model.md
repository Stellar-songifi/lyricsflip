# LyricsFlip Threat Model — Anti-Cheat Analytics

> **Status:** Active  
> **Issue:** LF-357  
> **Last updated:** 2026-11-22

---

## 1. Background

LyricsFlip rounds are executed on the Stellar network via a Soroban smart
contract. Because the full song catalogue is readable from the contract's
ledger state at any time, a bot can:

1. Subscribe to `RoundStarted` contract events.
2. Query the current catalogue from ledger state.
3. Submit answers for every card in the **first ledger** after the round
   starts (~5 s), without ever needing to read the displayed lyrics.

[LF-251](https://github.com/Stellar-songifi/lyricsflip/issues/251) and
[LF-278](https://github.com/Stellar-songifi/lyricsflip/issues/278) added
on-chain rate limiting and answer timing enforcement. This document covers
the complementary **off-chain analytics layer** introduced in LF-357 that
detects residual suspicious play by analysing indexed answer data.

---

## 2. Threat actors and attack vectors

| Actor | Vector | Notes |
|---|---|---|
| Catalogue bot | Reads answers from ledger state, submits in first ledger | Primary threat; detectable via first-ledger timing heuristic |
| Answer oracle bot | Pre-computes correct answers from known song metadata | Indistinguishable from a human unless combined with speed signals |
| Collusion ring | Multiple addresses sharing answers via side-channel | Harder to detect off-chain; out of scope for LF-357 |
| Replay bot | Replays known correct answers from prior rounds | Detectable by cross-round accuracy pattern combined with low latency |

---

## 3. Data sources

The indexer writes the following tables from on-chain events:

| Table | Key columns | Used for |
|---|---|---|
| `chain_round` | `round_id`, `created_ledger`, `started_at` | Round start reference point |
| `chain_answer` | `round_id`, `player`, `card_index`, `correct`, `ledger` | Per-answer timing + correctness |
| `chain_round_result` | `round_id`, `player`, `correct_answers`, `total_answers`, `streak_after` | Per-player round aggregate |
| `player_flags` | `address`, `round_id`, `reasons`, `accuracy`, `median_answer_time_s`, `status` | Persisted flag history + moderation state |

> **Timing note:** On-chain data does not carry wall-clock millisecond
> timestamps. Timing is estimated by multiplying the ledger delta
> (answer ledger − round start ledger) by the Stellar average ledger close
> time of **~5 seconds**. This provides second-level resolution, which is
> sufficient for the heuristics below.

---

## 4. Heuristics

All heuristics are implemented in
`backend/src/anti-cheat/providers/anti-cheat.service.ts` and emit values from
the `AntiCheatFlagReason` enum. Multiple reasons can be raised for a single
player in a single round; they are stored as an array in `player_flags.reasons`.

### 4.1 `HIGH_ACCURACY_LOW_LATENCY` (primary bot signal)

**Trigger:** Accuracy > 95 % **and** median answer time < 6 s across **≥ 20 cards**.

**Rationale:**  
Human players occasionally score very high, but consistently fast *and* very
accurate play across a full game is statistically unlikely without automation.
The 20-card minimum prevents false positives from short rounds where luck
could yield a perfect score.

**Thresholds:**

| Parameter | Value | Source |
|---|---|---|
| Minimum cards | 20 | LF-357 spec |
| Accuracy threshold | > 95 % | LF-357 spec |
| Median answer time | < 6 s | LF-357 spec |

**False-positive risk:** Low for the combined signal. High accuracy alone
(e.g. a skilled human who knows every song) will not trigger unless the
median time is also sub-6 s.

---

### 4.2 `FIRST_LEDGER_ANSWER` (catalogue-read bot signal)

**Trigger:** A correct answer is submitted in the **same ledger** as the round
was created, or the **immediately following ledger** (ledger delta ≤ 1, i.e.
≤ ~5 s after round start).

**Rationale:**  
A human player needs time to read the UI, understand the question, and select
an answer. The minimum realistic human interaction time is several seconds.
Submitting a correct answer within the first ledger strongly suggests the
answer was computed before the UI was shown, consistent with reading the
catalogue from ledger state.

**False-positive risk:** Near-zero for a correct answer in ledger delta = 0.
Could theoretically fire for a player who guesses immediately and is correct,
but this is captured only when `correct = true`.

---

### 4.3 `IMPOSSIBLE_RESPONSE_TIME` (sub-human speed)

**Trigger:** Any **correct** answer arrives with a ledger delta of 0 from the
round start **and** the inferred response time is under 400 ms.

**Rationale:**  
Since each ledger closes in ~5 s, a delta of 0 means the answer arrived
in the same 5-second ledger window as the round started. No human can read
a lyric snippet and submit a correct answer in under 400 ms. This mirrors
the `MIN_HUMAN_RESPONSE_MS = 400` constant from
`backend/src/quick-game/anti-cheat.ts`.

**False-positive risk:** Near-zero. Even a human clicking instantly after the
ledger opens cannot physically reach this threshold.

---

### 4.4 `PERFECT_STREAK` (scripted perfect play)

**Trigger:** All answers in the round are correct **and** there are ≥ 10 answers
**and** the average answer time per card (from ledger deltas) is under 1.5 s.

**Rationale:**  
A perfect streak of 10+ answers at an average of under 1.5 s per card is
consistent with automated answer submission. This mirrors the streak heuristic
in `backend/src/quick-game/anti-cheat.ts`
(`SUSPICIOUS_STREAK_LENGTH = 10`, `SUSPICIOUS_STREAK_AVG_MS = 1500`) but
applied to on-chain indexed data rather than the in-memory Quick Game state.

**False-positive risk:** Low. Requires a simultaneous perfect score and
very fast timing.

---

## 5. Evaluation pipeline

```
IndexerService
  │  emits 'round.completed' { roundId }
  ▼
AntiCheatService.handleRoundCompleted()
  │  loads chain_round, chain_answer[], chain_round_result[]
  │  for each player:
  │    computeReasons() → AntiCheatFlagReason[]
  │    if reasons.length > 0:
  │      INSERT/UPDATE player_flags (idempotent on (address, round_id))
  ▼
ModerationService
  │  Admin polls GET /admin/anti-cheat/flags?status=pending
  │  Admin acts: PATCH /admin/anti-cheat/flags/:id { status: 'hidden' | ... }
  ▼
LeaderboardService.getLeaderboard()
  │  for each entry in result page:
  │    ModerationService.getAddressStatus(address)
  │  filters out 'hidden' and 'banned' entries from public response
  │  sets LeaderboardEntryDto.flagStatus = status | null
```

---

## 6. Moderation queue

Flags raised by the heuristics are written to `player_flags` and are
immediately visible in the admin moderation queue.

### Moderation statuses

| Status | Meaning | Leaderboard visibility |
|---|---|---|
| `pending` | Awaiting admin review | Visible (not yet actioned) |
| `reviewed` | Admin examined, no action | Visible |
| `hidden` | Admin suppressed from leaderboard | **Hidden** from public response |
| `banned` | Address blocked from new rounds | **Hidden** from public response |

### Admin endpoints

All endpoints require a valid JWT and the `admin` role.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/anti-cheat/flags` | List moderation queue (filterable by status/address) |
| `PATCH` | `/admin/anti-cheat/flags/:id` | Apply a moderation decision |
| `GET` | `/admin/anti-cheat/addresses/:address/status` | Query flag status for a specific address |
| `PATCH` | `/admin/anti-cheat/evaluate/:roundId` | Manually re-evaluate a round |

---

## 7. Acceptance criteria mapping

| Criterion (LF-357) | Implementation |
|---|---|
| Flag addresses with accuracy > 95 %, median time < 6 s, ≥ 20 cards | `HIGH_ACCURACY_LOW_LATENCY` heuristic in `AntiCheatService` |
| Other heuristics | `FIRST_LEDGER_ANSWER`, `IMPOSSIBLE_RESPONSE_TIME`, `PERFECT_STREAK` |
| Admin moderation queue | `ModerationService` + `AntiCheatController` (`/admin/anti-cheat/flags`) |
| Flag on leaderboard entries | `LeaderboardEntryDto.flagStatus`; hidden/banned entries suppressed from public response |
| Scripted bot flagged within one round on testnet | `FIRST_LEDGER_ANSWER` and `HIGH_ACCURACY_LOW_LATENCY` both fire on the first completed round for a bot that answers in ledger 0 with 100 % accuracy |

---

## 8. Limitations and future work

- **Timing resolution:** Ledger-delta timing is coarse (~5 s buckets). A
  more precise signal would require the client to submit a signed timestamp
  alongside each answer, but that is spoofable. The current approach is
  harder to game because it is derived from immutable on-chain data.

- **Collusion:** Two bots alternating correct answers to split accuracy below
  the threshold are not detected by the current heuristics. This would require
  cross-player correlation.

- **Off-chain (Quick Game) mode:** The existing `detectFlags()` function in
  `quick-game/anti-cheat.ts` already catches `IMPOSSIBLE_RESPONSE_TIME` and
  `PERFECT_STREAK` in memory. Future work: persist those flags to `player_flags`
  to unify the moderation queue.

- **Automated enforcement:** The `BANNED` status currently only hides the
  entry from the leaderboard. Blocking a banned address from submitting
  transactions to the contract requires an on-chain enforcement step (a
  contract-level ban list), which is tracked in a future issue.
