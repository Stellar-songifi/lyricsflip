# ADR-0004: Soulbound NFT badges and transferability

- **Status:** Accepted
- **Date:** 2024-06-25
- **Tracking issue:** LF-169
- **Deciders:** Product team, Contracts team
- **Related ADRs:** ADR-0001

## Context

LyricsFlip awards on-chain NFT badges to recognize player achievements (e.g., winning streaks, decade mastery, milestone rounds won).

Standard NFT interfaces (such as SEP-721 or ERC-721) implement `transfer`, `transfer_from`, and `approve` methods that allow token owners to sell or transfer assets to arbitrary addresses. If achievement badges were transferable:
- Badges could be purchased on secondary marketplaces, completely decoupling badges from real player accomplishments.
- Leaderboards, profile showcases, and tournament qualification tiers based on badges would lose integrity.
- Malicious actors could exploit bot accounts to farm and sell achievement credentials.

## Decision

We will implement achievement badges as **soulbound (non-transferable) tokens** in `lyricsflip-nft`:

- **Blocked transfers and approvals**: The public functions `transfer`, `transfer_from`, `approve`, and `approve_for_all` unconditionally panic with custom error `Error::NonTransferable` (code 11).
- **Minter gating**: Only the designated minter address (the `lyricsflip` game contract or admin) can execute `mint`.
- **Owner-authorized burn**: Badge owners retain the ability to permanently destroy their badges via `burn(env, owner, token_id)`, enabling voluntary forfeiture or revocation of compromised badges.

## Consequences

### Positive
- Badges serve as verifiable, immutable attestations of genuine in-game accomplishments.
- Prevents secondary market speculation and credential farming.
- Preserves the integrity of in-game leaderboard galleries and profile displays.

### Negative
- Users who change wallet addresses cannot self-transfer their earned badges to a new wallet without administrative migration.

## Alternatives considered

- **Fully transferable NFTs**: Rejected because commercial trading undermines the meritocratic value of achievement badges.
- **Transferable with royalties**: Rejected because royalties do not resolve badge falsification or prestige trading.

## Status history

- 2024-06-25 — Proposed
- 2024-07-10 — Accepted
