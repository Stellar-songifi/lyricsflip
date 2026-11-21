# LyricsFlip Issue Backlog

This file tracks known issues, features, and improvements for the LyricsFlip project. Each entry has a unique `LF-NNN` identifier, an area tag, a priority, a task list, and acceptance criteria.

For the full list of all 125+ tracked issues, see the [GitHub Issues](https://github.com/Stellar-songifi/lyricsflip/issues) tab.

---

## Frontend / Backend

### LF-197 · Three incompatible real-time protocols

**Area:** Frontend / Backend · **Priority:** P1 · **Type:** Bug · **Effort:** M  
**Files:** `frontend/src/hooks/use-multiplayer-room.ts`, `frontend/src/types/realtime.ts`, `backend/src/game/game.gateway.ts`, `backend/src/game/types/realtime.ts`, `docs/realtime-protocol.md`

**Description**

The frontend, backend, and documentation used incompatible event names and payload shapes. This change aligns all implementations to `docs/realtime-protocol.md` as the single source of truth.

**Tasks**

- [x] Treat `docs/realtime-protocol.md` as the source of truth for all real-time events.
- [x] Unify event definitions across frontend and backend in matching `realtime.ts` type modules.
- [x] Update `GameGateway` and `useMultiplayerRoom` hook to use spec names (`room:join`, `room:ready`, `answer:submitted`, `room:state`, `player:joined`, `player:left`, `player:ready`, `card:next`, `timer:tick`, `score:update`, `round:completed`) with backwards-compatible legacy aliases.
- [x] Add contract tests booting the gateway and driving it with client requests.

**Acceptance criteria**

- [x] The protocol has one definition, used by both sides, and the integration tests pass.

**Related:** Closes [#683](https://github.com/Stellar-songifi/lyricsflip/issues/683)

---

## Frontend

### LF-198 · The wager modal must use real escrow

**Area:** Frontend · **Priority:** P2 · **Type:** Feature · **Effort:** M  
**Files:** `frontend/src/components/organisms/wager-modal.tsx`, `frontend/src/components/organisms/wager-summary-modal.tsx`, `frontend/src/lib/utils.ts`, `frontend/src/lib/stellar/client.ts`

**Description**

The wager modal now connects directly to real escrow parameters, converting stakes to stroops via `bigint` math, validating wallet balances against min/max limits and fee reserves, displaying true configured round rules instead of arbitrary odds/duration, and detailing the escrow deposit in the summary modal prior to signing.

**Tasks**

- [ ] Pass the stake, converted to stroops (7 decimals) with `bigint` math, to `create_round`.
- [ ] Remove the fields with no contract meaning (odds, duration), or map them to configured values.
- [ ] Show the wager token's balance and the min/max limits, and disable submission when the balance is too low.
- [ ] Show the escrow transfer in the summary modal before the player signs.

**Acceptance criteria**

- [ ] Creating a 5 XLM wager round moves 5 XLM into the contract (testnet).
- [ ] No form field is silently ignored.

**Related:** Closes [#684](https://github.com/Stellar-songifi/lyricsflip/issues/684) · Reopened by [#890](https://github.com/Stellar-songifi/lyricsflip/issues/890) (LF-304): the stake is not sent on-chain until LF-256 adds wager arguments to `create_round`.
### LF-196 · Make `useRoundEvents` reliable

**Area:** Frontend · **Priority:** P2 · **Type:** Bug · **Effort:** S  
**Files:** `frontend/src/hooks/use-round-events.ts`

**Description**

`useRoundEvents` looks back only one day (17,280 ledgers), so lobbies older than that show no players. It also:
- builds state only from events, never from `get_round_players`
- keeps polling every 4 s after an error, with no backoff
- ignores `RoundLeft` and `RoundCancelled`, so players who left stay listed.

**Tasks**

- [x] Seed state from `getRoundPlayers` and `getRound`, then apply events on top.
- [x] Handle `RoundLeft` and `RoundCancelled`.
- [x] Back off exponentially on errors, and stop polling once the round is started or cancelled. Hand over to LF-195 for in-game events.
- [x] Unit-test the hook with a mocked `rpc.Server`.

**Acceptance criteria**

- [x] A lobby created more than a day ago shows the correct players.
- [x] A player who leaves disappears from the list.

**Related:** Closes [#682](https://github.com/Stellar-songifi/lyricsflip/issues/682)

---

### LF-200 · Pre-check XLM balance and offer Friendbot on testnet

**Area:** Frontend · **Priority:** P2 · **Type:** Feature · **Effort:** S  
**Files:** `frontend/src/lib/stellar/hooks/useXlmBalance.ts`, `frontend/src/components/molecules/wallet-status-banner.tsx`

**Description**

New wallets that don't exist on-chain, or don't hold enough XLM for fees, fail with opaque simulation errors (`account not found`, `txInsufficientBalance`). This issue wires up a friendly UX path so a brand-new testnet player never has to leave the app.

**Tasks**

- [x] Detect an unfunded account (`useXlmBalance` → `isUnfunded`, Horizon 404) and show a `WalletStatusBanner` with a **Fund with Friendbot** button on testnet.
- [x] Detect low balance (`isBelowMinFee`) and show a banner with a top-up prompt / Friendbot button on testnet.
- [x] Before every mutating transaction, compare the balance with the minimum fee threshold and surface a friendly error (`assertSufficientBalance` in `toast.ts` → `withTxToast`).
- [x] Map known Horizon / Soroban RPC error strings (`account not found`, `txInsufficientBalance`, `source account not found`, etc.) in `parseContractError` via a new `parseHorizonRpcError` helper in `errors.ts`.
- [x] Expose `isBelowRequired(required: bigint)` on `useXlmBalance` for future wager pre-checks.
- [x] Render `WalletStatusBanner` in `app/layout.tsx` below the `Navbar` so it appears on every route.

**Acceptance criteria**

- A brand-new testnet wallet can go from connecting to playing without leaving the app:
  1. Connect an unfunded wallet → orange banner appears immediately with **Fund with Friendbot**.
  2. Click **Fund with Friendbot** → Friendbot is called, banner disappears once balance is confirmed.
  3. Any transaction attempted with a zero or insufficient balance shows a friendly toast error instead of an opaque SDK exception.
  4. The same banner also warns about wallet network mismatches (existing behaviour preserved).
- Mainnet / non-testnet wallets: Friendbot button is **not** shown; only the balance warning text appears.

**Related:** Closes [#686](https://github.com/Stellar-songifi/lyricsflip/issues/686)

---

### LF-199 · Claim-winnings and refund UI

**Area:** Frontend · **Priority:** P2 · **Type:** Feature · **Effort:** S  
**Files:** `frontend/src/components/organisms/game-result-modal.tsx`, `frontend/src/components/organisms/game-result-popup.tsx`, `frontend/src/components/organisms/unclaimed-winnings.tsx`, `frontend/src/app/profile/page.tsx`

**Description**

After finalization, winners need a **Claim** button, losers should see what they lost, and a cancelled round should show its refund. The profile page should list rounds with unclaimed winnings.

**Tasks**

- [x] Add a Claim button to the result modal and popup, with pending, success, and error toasts.
- [x] Winner can claim winnings with pull-payment contract call (`claimWinnings`/`claimEarnings`), and the button disappears once the claim succeeds.
- [x] Display clear breakdown for losers showing the wager amount lost.
- [x] Display refund breakdown and messaging for cancelled rounds.
- [x] Add an "Unclaimed winnings" section to `/profile` listing won rounds with real-time claim actions and toast feedback.

**Acceptance criteria**

- [x] A winner can claim from the results screen and from the profile page, and the button disappears once the claim succeeds.

**Related:** Closes [#685](https://github.com/Stellar-songifi/lyricsflip/issues/685)

---

## On-chain

### LF-176 · Removing or updating a card breaks rounds that use it

**Area:** On-chain · **Priority:** P1 · **Type:** Bug · **Effort:** M  
**Files:** `onchain/contracts/lyricsflip/src/lib.rs`, `onchain/contracts/lyricsflip/src/types.rs`, `onchain/contracts/lyricsflip/src/errors.rs`

**Description**

`remove_card` deleted the stored `Card` entry outright, so any active round that had already drawn that card panicked with `NonExistingCard` on `submit_answer`/`get_question`/`next_card`, locking players' wagers. `update_card` could silently change a card's `title`/`artist`/`year` while a round was using it, corrupting answer grading.

**Tasks**

- [x] Make `remove_card` a soft delete: keep the stored `Card` entry, drop it from every index, and set `DataKey::CardDisabled(card_id)` so `get_card` reports `NonExistingCard` and the card is never drawn again. Ids are not reused.
- [x] Split card reads: private `read_card` (raw, used by all in-round paths) vs public `get_card` (panics `NonExistingCard` once disabled).
- [x] Add a `DataKey::CardLiveRounds(card_id)` reverse index, maintained on `create_round_internal` and cleared on `finalize_round`/`cancel_round`.
- [x] Guard `update_card`: reject changes to `title`/`artist`/`year` with `Error::CardInActiveRound` (44) while any referencing round is still live (finalized/cancelled/completed rounds and rounds past their deadline are ignored, so an abandoned round can never permanently freeze a card).
- [x] Acceptance test: create a round, remove one of its cards mid-round, play the round to the end and finalize it.

**Acceptance criteria**

- A round that draws a card which is later removed still grades answers and finalizes without panicking; the player's wager is not locked.
- `get_card` on a removed card returns `NonExistingCard`; a removed card cannot be resurrected by `update_card`.
- `update_card` rejects answer-field changes while a live round references the card and allows them once the round is finalized.

**Related:** Closes [#662](https://github.com/Stellar-songifi/lyricsflip/issues/662)
