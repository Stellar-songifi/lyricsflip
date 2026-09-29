# Answer privacy on-chain (LF-008)

`Card` currently stores `title`, `artist`, and `year` in plaintext, and
`get_card`, `get_round_cards`, and `next_card` all return them. On a public
ledger that means anyone can read the solution for the current card, and
`next_card` hands the answer to the caller at the exact moment the question
appears. A guessing game needs answers that stay hidden until they are
revealed.

This document compares three approaches and records the one we implement.

## (a) Store only `sha256(answer || salt)` on-chain, reveal the salt after the round

The contract stores a commitment `sha256(answer || salt)` per card instead of
the plaintext answer. The salt is kept off-chain (or in a separate, gated
storage entry) and revealed once the round is over. `submit_answer` hashes the
submitted guess with the salt and compares it to the stored commitment.

- **Pros:** no trusted party; the commitment is verifiable by anyone; the
  answer is genuinely hidden while the round is active; cheap to store.
- **Cons:** the contract can no longer score a guess without the salt, so the
  salt must be available at answer time — which reintroduces the leak unless
  the salt is only revealed after the round. That forces a two-phase flow
  (commit during the round, reveal after) and complicates `submit_answer`,
  which must currently validate immediately.
- **Verdict:** strong for a pure commit–reveal game, but a poor fit for the
  current synchronous `submit_answer` scoring model.

## (b) Commit–reveal by the round admin

The round admin commits `sha256(answer || salt)` when creating the round and
reveals `(answer, salt)` when the round ends. Players answer against the
commitment; the contract verifies the reveal before finalizing.

- **Pros:** no backend; the admin is already a trusted role in the round
  lifecycle; the reveal is auditable on-chain.
- **Cons:** the admin can grief by never revealing, which would strand the
  round; it also adds a second transaction per round and a new failure mode
  (`RoundNotRevealed`) that every caller must handle.
- **Verdict:** workable, but it moves trust from the contract to the admin and
  adds a round-finalization dependency we do not need yet.

## (c) Backend oracle that signs question cards

A backend holds the answers and signs a `QuestionCard` (lyric + options) for
`next_card`. The contract verifies the signature and stores only the signed
card; the answer never touches public storage.

- **Pros:** answers never appear on-chain at all; the existing synchronous
  `submit_answer` flow is preserved; the oracle can rotate answers without a
  contract upgrade.
- **Cons:** introduces an off-chain trust assumption and a signing key that
  must be managed; the contract must verify signatures on every `next_card`.
- **Verdict:** the strongest privacy guarantee, but the largest operational
  surface for this issue.

## Chosen approach

We implement a **redaction-first** variant of (a): the contract keeps the
plaintext answer in storage for scoring, but **no public view returns it while
the card's round is active**.

- `next_card` returns a `QuestionCard { lyric, options }` — the lyric and the
  multiple-choice options, never the answer.
- `get_card` is admin-only. Non-admins receive a redacted card (no `title`,
  `artist`, or `year`) while the round is active; the full card is only
  returned once the round is completed.
- `get_round_cards` returns redacted cards for active rounds.
- `submit_answer` is unchanged: it still validates against the stored answer,
  so scoring and tests keep working.

This satisfies the acceptance criteria — no public view leaks the answer for
an active round — without introducing an oracle or a second reveal
transaction. A future issue can layer the `sha256(answer || salt)` commitment
from (a) on top of this redaction boundary if we want the answer to be absent
from storage entirely.
