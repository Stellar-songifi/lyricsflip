# ADR-0002: Randomness source for card selection and option shuffling

- **Status:** Accepted
- **Date:** 2024-06-10
- **Tracking issue:** LF-143, LF-009, LF-298
- **Deciders:** Contracts team, DevOps team
- **Related ADRs:** ADR-0001

## Context

LyricsFlip requires randomness for two core gameplay mechanics:
1. **Card selection**: Drawing an unbiased, non-repeating subset of `cards_per_round` from the card catalogue for each round.
2. **Option shuffling**: Shuffling the correct answer among three distractor answers on each question card.

The legacy Starknet (Cairo) implementation used a SHA-256 hash derived from `(seed, ledger sequence, ledger timestamp, i)` where `seed` was provided as an argument by the transaction caller, and shuffled options via a linear-congruential generator (LCG). This allowed a caller to simulate multiple seeds locally and submit only the seed that selected favorable cards or predictable answer positions, creating a major cheating vector (LF-009).

## Decision

We will use Soroban's native pseudo-random number generator, `env.prng()`, as the sole source of randomness across contracts:

- **Eliminate client seeds**: Remove client-supplied seed arguments from `create_round`, `create_solo_round`, and card drawing entry points.
- **Contract PRNG draws**: Card selection draws indices using `env.prng().gen_range(0..catalogue_size)` while skipping duplicates until the target count is satisfied.
- **Fisher–Yates shuffling**: Question option shuffling uses Fisher–Yates driven by `env.prng()`, replacing custom LCG implementations.

## Consequences

### Positive
- Callers cannot bias, predict, or manipulate card selection or option placement.
- Eliminates off-chain oracle dependencies, VRF subscriptions, and multi-transaction commit-reveal schemes.
- Reduces parameter validation overhead in smart contracts.

### Negative
- `env.prng()` output is pseudo-random and deterministic within a given ledger transaction context. Because transaction simulation occurs before submission, miners/validators could theoretically preview selections, but in practice the per-block transaction submission window and automated round deadlines provide sufficient fairness for card guessing rounds.

## Alternatives considered

- **Custom Linear Congruential Generator (LCG) with caller seeds**: Rejected due to vulnerability to caller manipulation and predictable periodicity.
- **Off-chain VRF (e.g., Chainlink / oracle beacon)**: Rejected due to added latency, multi-transaction round setup overhead, and external dependency costs.

## Status history

- 2024-06-10 — Proposed
- 2024-06-25 — Accepted
- 2024-11-15 — Finalized implementation in LF-298
