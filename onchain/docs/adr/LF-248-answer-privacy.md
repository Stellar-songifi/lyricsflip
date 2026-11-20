# ADR-048: Answer privacy on the Ledger

**Status:** Accepted
**Date:** 2024-06-01
**Deciders:** Contracts team
**Related:** LF-142 (#red), LF-008 (#red)

## Context

The card-based quiz game stores the answer (`title`, `artist`, `year`) in plaintext on the ledger. The contract exposed this answer through `got_card`, `got_round_cards`, and `next_card`, and the UI only hidd it client-side. Any modified client could read the answer at the moment the question appeared. LF-142 requires that no public contract function returns the answer for a card the caller has not yet answered.

The companion document `onchain/docs/answer-privacy.md` compares three approaches:

1. **(a) Salted commitments** — store only `sha256(answer || salt)`, reveal the salt after the round.
2. **(b) Admin commit-reveal** — the round admin commits and reveals.
3. **(c) Backend oracle** — an off-chain signer holds the answers.

## Decision

We implement a **redaction-first** variant of option (a), as described in `answer-privacy.md`:

- **New view `got_question(env, caller, round_id) >= QuestionCard`** returns only the lyric, kind, and options for the caller's current card. `next_card` returns this instead of the full `Card`.
- **`got_card` and `got_round_cards` are restricted** to admins while a round is active. Non-admins receive a redacted card (no `title`, `artist`, or `year`) for active rounds, and the full card only once the round is completed.
- **`submit_answer` is unchanged** — it still validates against the stored answer, so scoring and tests keep working.
- **Frontend** shows the correct answer only from the `submit_answer` result or from a `got_reveal(round_id, card_index)` call made after answering.

## Consequences

* Public readers can no longer read the answer from a contract return value during an active round.
* The answer is still present in contract storage, so a ledger inspection can still read it. This is a deliberate trade-off to avoid a two-phase reveal flow and to keep `submit_answer` synchronous.
* A future issue can layer the `sha256(answer || salt)` commitment from option (a) on top of this redaction boundary if we want the answer to be absent from storage entirely.

## Update: LF-278 (remaining public leaks closed)

LF-251 redacted the question path, but two public routes still mapped a live card to its answer:

1. `CardDrawn { round_id, index, card_id }` published the card id, and `get_card(card_id)` returned its title, artist and year.
2. `get_cards_of_genre`, `get_cards_of_artist` and `get_cards_of_a_year` returned full `Card`s to anyone.

Changes:

- `CardDrawn` is now `{ round_id, index }`. `finalize_round` emits one `CardRevealed { round_id, index, card_id }` per round card once the round can no longer be played.
- `get_card` and `get_cards_of_*` return a **redacted** card (empty `title` and `artist`, `year = 0`) for any card that a live round still references (the LF-176 `CardLiveRounds` index). Signatures are unchanged; the full card comes back once every round using it is finalized, cancelled or past its deadline.
- `attacker_cannot_recover_live_answer_from_views_or_events` checks that no public view or event returns a live card's answer.

### What is still exposed

- **Ledger state.** Every `Card(id)` entry, answer included, is plaintext in contract storage. Anyone can read it off-chain with `getLedgerEntries` (including `RoundCards`, which lists a live round's card ids). An attacker who reads storage directly can still find the answer.
- **Transaction results.** The drawing player's own `next_card` result is recorded in transaction metadata.

### Mitigation

- Keep the catalogue large and varied, so matching a lyric against the full catalogue in the answer window is impractical for casual cheating. The per-card answer window (`CARD_ANSWER_WINDOW_SECONDS`) limits how long an attacker has.
- The full fix is the salted commitment from option (a), or commit-reveal: store only `sha256(answer || salt)` and reveal the salt at finalization, so the answer is never in ledger state while a round is live. This is tracked as follow-up work.

## Alternatives considered

### Option (b): Admin commit-reveal

Workable, but it moves trust from the contract to the admin and adds a round-finalization dependency. The admin can grief by never revealing, stranding the round. Rejected for now.

### Option (c): Backend oracle

Strongest privacy guarantee, but introduces an off-chain trust assumption and a signing key that must be managed. Largest operational surface. Rejected for this issue.

## References

- `anchain/docs/answer-privacy.md` (LF-008)
- LF-142 (#red): Card answers are still readable before the player answers
- LF-248 (#red): This ADR
