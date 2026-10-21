# LyricsFlip on-chain contracts (Soroban)

Two Soroban smart contracts, ported from the project's earlier Cairo/Starknet
contracts:

- `contracts/lyricsflip` — game logic (rounds, cards, wagering scaffolding, answers)
- `contracts/lyricsflip-nft` — minter-gated NFT rewards

## Prerequisites

- Rust (version pinned in `../.tool-versions`)
- The `wasm32v1-none` target — **not** `wasm32-unknown-unknown`. Recent
  soroban-sdk releases require it on Rust 1.84+:

  ```bash
  rustup target add wasm32v1-none
  ```
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) (`stellar`) for deploying and invoking contracts, if you don't already have it.

## Round scoring and finalization

Each correct answer earns the time-adjusted base points multiplied by the card
difficulty (1 = easy, 2 = medium, 3 = hard). Existing stored cards are lazily
migrated with difficulty 2. The contract also tracks total answer time for
tie-breaks. `get_round_scores(round_id)` returns each player's accumulated
points.

`create_round_with_filter` accepts optional genre and decade filters plus an
optional difficulty. Decades are supplied as their first year (for example,
1990); filtered selection checks at most 500 cards and fails if too few cards
match. The existing `create_round` entry point retains its genre-only behavior.

A round can be finalized when either:

- every required player/card answer in the round has been submitted, or
- the round deadline has passed (`round.end_time`)

`finalize_round(round_id)` is callable by any round participant and rejects early or duplicate finalization attempts. Once a round has been finalized, it cannot be finalized again; the second call fails and does not change `rounds_won` or emit another `RoundCompleted` event.

Winner selection follows the LF-005 rule:

- highest point score wins
- when several players are tied on score, the lowest total answer time wins
- if the score and total answer time are both tied, the tied players are co-winners
- if every player has a score of `0`, there are no winners

`PlayerStats.rounds_won` increments by exactly `1` for every winner when a round is finalized; non-winners and zero-score rounds do not change it. `RoundCompleted { round_id, winners, scores }` emits the finalized round id, the winning addresses, and the final score map for every player in the round.

When a round is finalized it is marked `is_completed`, and `end_time` is set
to the finalization time, or kept at the deadline if the round timed out.

## Round lifecycle, limits and timing

- **Player cap:** `join_round` fails with `RoundFull` once a round has
  `get_max_players()` players (default `8`; the owner can change it with
  `set_max_players(caller, value)`, minimum 2).
- **Round deadline:** a round's `end_time` is `start_time + round_duration`.
  The duration is snapshotted onto the round at creation. By default, it scales dynamically
  as `cards_per_round × (answer_window + round_buffer)` (default buffer `15s`; e.g., 20 cards
  yield `600s`), or can be overridden globally by the owner via `set_round_duration(caller, value)`
  (`set_round_buffer(caller, value)` tunes the latency buffer). After it, `submit_answer` fails
  with `RoundCompleted`, and the round can be finalized.
- **Card answer window:** players have `round.answer_window` (default `15s`, snapshotted at
  creation, owner-configurable via `set_answer_window(caller, value)` within `[5, 180]s`) after
  `next_card` to answer. **Late answers are accepted but scored as wrong**
  (they break the streak), so the player still counts as having answered and
  the round can finalize early.
- **Leaving:** `leave_round(caller, round_id)` removes a non-admin player
  before the round starts, clears their ready flag, refunds their wager and
  emits `RoundLeft { round_id, player, refunded }`.
- **Cancelling:** `cancel_round(caller, round_id)` works before start. The
  round admin can call it at any time; anyone else can call it once the lobby
  has been open for `round.lobby_timeout` (default `600s`, snapshotted at creation,
  owner-configurable via `set_lobby_timeout(caller, value)` within `[30, 86400]s`). It sets
  `is_cancelled`, drops the round from `get_open_rounds`, refunds every player and emits
  `RoundCancelled { round_id, cancelled_by, refunded_players, refund_per_player }`.
  A cancelled round can't be joined, started, or finalized (`RoundCancelled`).

Wagers are not escrowed yet (LF-013), so refunds currently report
`round.wager_amount` without moving tokens. The token transfer goes into
`refund_wager` once escrow lands.

## NFT rewards

The game contract is the NFT contract's minter. The owner registers the NFT
contract with `set_nft_contract(caller, nft_contract)`; players then call
`claim_reward(caller, milestone)`, and the game contract mints through a
cross-contract call to `mint`. Each milestone can be claimed once per player
(`MilestoneAlreadyClaimed`); `is_milestone_claimed(player, milestone)` reports
whether it has been claimed.

| Milestone | Value | Requirement |
| --- | --- | --- |
| `FirstWin` | 0 | `rounds_won >= 1` |
| `Streak5` | 1 | `max_streak >= 5` |
| `TenWins` | 2 | `rounds_won >= 10` |

### `lyricsflip-nft` interface

The contract follows the [SEP-0050](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md)
non-fungible interface, with method names and events matching OpenZeppelin's
`stellar-non-fungible`. It stays hand-written rather than depending on that
library, to avoid tying the workspace's `soroban-sdk` version to the
library's.

The full function list, signatures, events and error codes are generated from
the contract source into [`docs/api.md`](docs/api.md). Regenerate it with
`./scripts/gen-api-docs.sh` after changing any public interface.

Highlights: `mint` is minter-only and records an achievement `kind`;
`token_kind` exposes it; `tokens_of_owner` paginates an owner's tokens (≤ 50
per page); all transfer and approval entry points panic with
`NonTransferable` (LF-169); `set_base_uri` and `set_minter` are owner-only.

#### LF-168 – Token kind

Every minted badge records which achievement / milestone it represents via a
`kind: u32` parameter on `mint`.  The kind is stored under
`DataKey::TokenKind(token_id)` and exposed through the `token_kind` view.

`token_uri` now returns `<base_uri><kind>.json` (e.g.
`https://assets.lyricsflip.io/nft/0.json`).  This means every token of the
same kind shares one metadata URL with its own artwork and description, without
requiring an off-chain id→kind mapping.

Metadata files live in `metadata/`:

| File | Kind | Milestone |
| --- | --- | --- |
| `metadata/0.json` | 0 | `FirstWin` — first round won |
| `metadata/1.json` | 1 | `Streak5` — correct-answer streak of 5 |
| `metadata/2.json` | 2 | `TenWins` — ten rounds won |

`metadata/template.json` is the generic template for future kinds.

The `NftInterface` trait in the game contract and the cross-contract call in
`claim_reward` have been updated to pass `milestone as u32` as the `kind`
argument.

#### LF-169 – Soulbound badges (ADR)

**Decision: all tokens in this contract are soulbound.**

Achievement badges cannot be transferred, approved, or delegated.  Calling
`transfer`, `transfer_from`, `approve`, or `approve_for_all` always panics with
`Error::NonTransferable` (code 11).  `get_approved` always returns `None` and
`is_approved_for_all` always returns `false`.

Rationale:

1. Every token in this contract is an on-chain achievement badge — a record that
   a specific wallet reached a specific milestone.  Allowing trading would make a
   "top players" badge gallery meaningless.
2. Making soulbound the invariant for the whole contract is simpler to reason
   about and test than a per-kind flag.
3. A future contract (or a new contract) can introduce transferable collectibles
   if that use case arises; having them in the same contract would complicate the
   storage layout and the access rules.

#### LF-170 – Per-owner token index

The previous approach — iterating `owner_of(1..token_count)` — required O(N)
RPC simulations and was unusable beyond a few hundred mints.

The contract now maintains a dense index per owner:

| Storage key | Value | Purpose |
| --- | --- | --- |
| `OwnerTokenCount(owner)` | `u32` | Number of tokens currently held |
| `OwnerTokenAt((owner, i))` | `u128` | Token id at index position `i` (0-based) |
| `OwnerTokenPosition((owner, token_id))` | `u32` | Position of `token_id` in the owner's index |

Insertions append to the end (O(1)).  Removals use **swap-remove**: the last
entry is moved into the vacated slot, the last slot is deleted, and the count is
decremented — all O(1).

`tokens_of_owner(owner, start, limit)` returns a paginated slice of the index
in a single contract call.  `limit` is clamped to `MAX_TOKENS_PER_PAGE` (50).

Per-token metadata follows the JSON template in `metadata/template.json`, served
at `<base_uri><kind>.json`.

Events: `NftMinted { token_id, kind, recipient }`, `MinterUpdated`.
Transfer and approval events are not emitted because those operations are
disabled.

## Ownership, roles and upgrades

Both contracts support a two-step ownership transfer: the owner calls
`transfer_ownership(caller, new_owner)`, then the new owner calls
`accept_ownership(caller)` (`OwnershipTransferStarted` / `OwnershipTransferred`
events; `owner()` and `pending_owner()` views). On `lyricsflip`, the new owner
is also granted the admin role, and `set_role` is owner-only regardless of the
owner's own admin flag, so the owner cannot lock themselves out. `set_role`
emits `RoleUpdated { address, role, enabled }`. Admin flags and the enumerable
admin index (`get_admins() -> Vec<Address>`) reside in persistent storage (LF-156)
so instance storage holds only global configuration, and revoked admins have their
keys deleted rather than storing false tombstones.

Soroban does not provide an API to enumerate old instance-storage keys. The v3-to-v4
`migrate(caller)` step moves the owner admin entry; to eagerly clear other legacy
entries, the owner must call `migrate_legacy_admins(caller, candidates)` in batches,
using addresses collected from historical `RoleUpdated` events (include revoked
addresses too). Each batch removes matching legacy keys and moves active grants into
persistent storage. `is_admin` also migrates an omitted legacy entry lazily when that
address is checked.

Both contracts expose `version() -> u32` (contract code version), `schema_version() -> u32` (storage schema version, defaulting to 1 for unmigrated legacy state), an owner-only `upgrade(caller, new_wasm_hash)`, and an owner-only `migrate(caller)` hook.

### Upgrade then migrate sequence

When deploying a new contract release that introduces changes to storage structures or layouts (LF-157), execute the two-step upgrade sequence:

1. **Upgrade WASM code:** Replace the running contract WASM with the new bytecode. The `upgrade` invocation verifies owner authorization, invokes `env.deployer().update_current_contract_wasm(new_wasm_hash)`, and emits `ContractUpgraded { owner, new_wasm_hash, old_version, new_version }`.
2. **Migrate storage layout:** Invoke `migrate` to step stored records through sequential schema versions until reaching `SCHEMA_VERSION`. Code version and schema version are tracked independently. The hook updates `DataKey::SchemaVersion`, emits `SchemaMigrated { caller, old_schema_version, new_schema_version }`, and is strictly **idempotent** (calling `migrate` multiple times after migration is a safe no-op).

```bash
# 1. Build and upload new WASM bytecode
cargo build --target wasm32v1-none --release
HASH=$(stellar contract upload \
  --wasm target/wasm32v1-none/release/lyricsflip.wasm \
  --source <OWNER_IDENTITY> --network testnet)

# 2. Step 1: Upgrade contract code in place (keeps all existing storage)
stellar contract invoke --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> --network testnet \
  -- upgrade --caller <OWNER_ADDRESS> --new_wasm_hash $HASH

# 3. Step 2: Migrate storage layout to current SCHEMA_VERSION (idempotent)
stellar contract invoke --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> --network testnet \
  -- migrate --caller <OWNER_ADDRESS>
```

`fixtures/upgrade_v2.wasm` (built from `contracts/upgrade-fixture`) is the stand-in v2 code used by automated upgrade fixture integration tests to verify state preservation, schema migration, and idempotency.

## Build & test

```bash
cargo test                                    # unit tests, native target
cargo build --target wasm32v1-none --release  # produces deployable .wasm files
```

WASM output:

```
target/wasm32v1-none/release/lyricsflip.wasm
target/wasm32v1-none/release/lyricsflip_nft.wasm
```

## Deploy and seed (automated)

Two helper scripts live in `scripts/` and cover the full set-up flow for a
fresh testnet deployment.

### Prerequisites

1. Stellar CLI installed (`stellar`).
2. A funded identity called `me` on the target network:

   ```bash
   stellar keys generate --global me --network testnet --fund
   ```

3. Rust with the `wasm32v1-none` target (see above).
4. `jq` installed (required by `seed-cards.sh`).

### `scripts/deploy.sh`

Builds both WASMs, deploys them, wires the NFT minter to the game contract,
sets `cards_per_round`, and writes the two contract IDs into
`frontend/.env.local`.

```bash
cd onchain
./scripts/deploy.sh testnet   # or mainnet / futurenet
```

### `scripts/seed-cards.sh`

Reads `seed/songs.json` (≥ 5 cards per genre, using original and
public-domain lyric snippets) and calls `add_card` for every entry.  Run
after `deploy.sh` so the contract IDs are already in `frontend/.env.local`.

```bash
cd onchain
./scripts/seed-cards.sh testnet
```

### Manual deployment (alternative)

If you prefer to deploy by hand:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/lyricsflip.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet \
  -- --owner <OWNER_ADDRESS>

stellar contract deploy \
  --wasm target/wasm32v1-none/release/lyricsflip_nft.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet \
  -- --owner <OWNER_ADDRESS> --minter <LYRICSFLIP_CONTRACT_ID> \
     --token_name "LyricsFlip" --token_symbol "LFLIP" --base_uri "https://..."
```

Put the resulting contract IDs into the frontend's
`NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID` / `NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID`
environment variables (see `frontend/src/lib/stellar/stellarConfig.ts`).

## Views for lobbies and catalogue size

`get_cards_count`, `get_round_count` and `get_genre_card_count` return catalogue
and round totals. `get_rounds(start, limit)` and `get_open_rounds(start, limit)`
paginate rounds (ids begin at 1; `start` is an offset for open rounds). Both
paginated views clamp `limit` to `MAX_PAGE_LIMIT` (50) and return an empty list
once `start` is past the end. See [`docs/api.md`](docs/api.md) for exact
signatures and return types.

## Card catalogue

Admins manage cards with `add_card`, `add_cards`, `update_card` and
`remove_card`. `add_card`/`add_cards` return the assigned id(s) and ignore the
`card_id` field of the input. Ids are never reused after a removal.

Every card is validated: `title`, `artist` and `lyrics` must be non-empty,
`lyrics` at most `MAX_LYRICS_LEN` (1000) bytes, and `year` between 1900 and
the current year (derived from the ledger timestamp). A card with the same
`title` + `artist` as an existing card is rejected as `DuplicateCard`.

The global, genre, artist and year indexes are each stored as a count plus one
ledger entry per item (`CardAt(i)`, `GenreCardAt((genre, i))`, …) and removals
swap the last item into the gap. Adding a card therefore reads and writes the
same number of entries (13 writes, about 1.9 KB) whether it is the first or
the thousandth card in its genre; see `test::add_card_cost_does_not_grow_with_index_size`.

Rounds are capped at `MAX_ROUND_PLAYERS` (8) players so the per-round player
list stays bounded.

### Batch size

`add_cards` accepts at most `MAX_CARDS_PER_BATCH` (**20**) cards. A full batch
on a fresh catalogue measures about 19.2M instructions, 152 write entries and
24 KB written, against the Mainnet per-transaction limits of 400M
instructions and 200 write entries (as bundled with soroban-sdk 27). Each card
costs roughly 7 new ledger entries, so write entries are the binding limit and
batches above ~25 cards would not fit. `test::add_cards_max_batch_fits_budget`
runs a full batch with Mainnet limits enforced.

## Events

See [`docs/api.md`](docs/api.md) for which function emits which event
alongside its full signature, errors, and a CLI example. The table below is a
quick numeric/topic reference across both contracts.

Topics are listed in order after the event name, which soroban-sdk adds as the
first topic (snake_case, e.g. `card_added`). Data is a map of the remaining
fields. The complete event list — with topics and data fields — is generated in
[`docs/api.md`](docs/api.md).
fields.

| Event | Emitted by | Topics | Data |
| --- | --- | --- | --- |
| `RoundCreated` | `create_round` | `round_id: u64`, `admin: Address` | `created_time: u64` |
| `RoundJoined` | `join_round` | `round_id: u64`, `player: Address` | `joined_time: u64` |
| `PlayerReady` | `start_round` | `round_id: u64`, `player: Address` | `ready_time: u64` |
| `RoundStarted` | `start_round` (last player ready) | `round_id: u64`, `admin: Address` | `start_time: u64` |
| `CardDrawn` | `next_card` | `round_id: u64` | `index: u32` (position in the round), `card_id: u64` |
| `AnswerSubmitted` | `submit_answer` (first answer per card) | `round_id: u64`, `player: Address` | `correct: bool` |
| `RoundCompleted` | `finalize_round` | `round_id: u64` | `winners: Vec<Address>`, `scores: Map<Address, u64>` |
| `CardAdded` | `add_card`, `add_cards` (one per card) | `card_id: u64`, `genre: Genre` | – |
| `CardUpdated` | `update_card` | `card_id: u64`, `genre: Genre` (new genre) | – |
| `CardRemoved` | `remove_card` | `card_id: u64` | – |
| `RoleUpdated` | `set_role` | `account: Address` | `role: Role`, `enabled: bool` |
| `CardsPerRoundUpdated` | `set_cards_per_round` | – | `value: u32` |
| `AnswerWindowUpdated` | `set_answer_window` | – | `value: u64` |
| `LobbyTimeoutUpdated` | `set_lobby_timeout` | – | `value: u64` |
| `RoundDurationUpdated` | `set_round_duration` | – | `value: u64` |
| `RoundBufferUpdated` | `set_round_buffer` | – | `value: u64` |
## TTL policy (LF-012)

Soroban persistent and instance storage entries are **archived** when their
time-to-live (TTL) expires; archived entries become unreadable until an
explicit restore transaction is sent. To keep active game data available on
testnet and mainnet, both contracts extend TTLs on every significant read or
write.

### Constants (both contracts)

| Constant | Value | Meaning |
| --- | --- | --- |
| `DAY_IN_LEDGERS` | 17 280 | Approximate ledger count per day (≈ 5 s/ledger on mainnet) |
| `BUMP_AMOUNT` | `30 × DAY_IN_LEDGERS` | Target TTL set on each extension (~30 days) |
| `LIFETIME_THRESHOLD` | `7 × DAY_IN_LEDGERS` | Only extend when remaining TTL falls below this (~7 days) |

### What gets bumped

**Instance storage** (owner, global counters, timing configuration) is bumped in every
public entry point that reads or writes it — constructors, admin mutations
(`add_card`, `set_cards_per_round`), and read-only views
(`get_cards_count`, `get_round_count`, `get_cards_per_round`).

**Persistent storage** is bumped per-key on write, and on read for the
following hot keys:

| Key | Bumped on |
| --- | --- |
| `Admin(address)` | `set_role`, `accept_ownership` (write), `is_admin` (read) |
| `Admins` | `set_role`, `accept_ownership` (write), `get_admins` (read) |
| `Card(id)` | `add_card` (write), `get_card` (read) |
| `GenreCards / ArtistCards / YearCards` | `add_card` (write), `get_cards_of_*` (read) |
| `Round(id)` | every write (`create_round`, `start_round`, `next_card`, …) and every read (`read_round`) |
| `RoundPlayers / RoundCards` | write and read helpers |
| `RoundReady / RoundReadyCount` | `start_round` write |
| `RoundScores / RoundAnswerTimes` | `submit_answer` write |
| `RoundCardStartedAt` | `next_card` write |
| `RoundPlayerAnswered` | `submit_answer` write |
| `RoundFinalized` | `finalize_round` write |
| `OpenRounds` | `create_round` / `start_round` write |
| `PlayerStats` | `start_round` / `submit_answer` / `finalize_round` write, `get_player_stat` read |
| `TokenOwner(id)` *(NFT)* | `mint` write, `owner_of` read |
| `TokenKind(id)` *(NFT)* | `mint` write, `token_kind` read (LF-168) |
| `OwnerTokenCount(owner)` *(NFT)* | `mint` write via `index_add` (LF-170) |
| `OwnerTokenAt((owner, i))` *(NFT)* | `mint` write via `index_add` (LF-170) |
| `OwnerTokenPosition((owner, token_id))` *(NFT)* | `mint` write via `index_add` (LF-170) |
| `TokenOwner(id)` *(NFT)* | `mint` write, `owner_of` read, `do_transfer` write |
| `Balance(owner)` *(NFT)* | `add_balance` write, `balance` read |
| `Approval(id)` *(NFT)* | `approve` write, `get_approved` read |
| `ApprovalForAll(owner, operator)` *(NFT)* | `approve_for_all` write, `is_approved_for_all` read |

### Survival tests

`test::ttl_survival_game_entries_survive_ledger_advance` advances the ledger
sequence past the default TTL and verifies that entries touched during gameplay
(cards, rounds, player stats) are still readable. The equivalent NFT tests
`test::ttl_survival_token_owner_survives_ledger_advance` and
`test::ttl_survival_transfer_survives_ledger_advance` cover `TokenOwner`,
`Balance`, and approvals surviving ledger advances for transfers.

## Error codes

See [`docs/api.md`](docs/api.md) for which function can raise which error. The
table below is a quick numeric-code reference across both contracts, kept in
sync by `onchain/scripts/check-api-docs.sh` (LF-182, runs in CI).

Contract errors reach clients as `Error(Contract, #<code>)`, and the frontend
maps on the numeric code (`frontend/src/lib/stellar/errors.ts`). **Codes are
stable: never renumber or reuse one.** New variants take the next free number
and must be added in `errors.ts` and in the `error_codes_are_stable` test of
the contract, which fails CI on any renumbering.

The complete, generated list of error codes for both contracts lives in
[`docs/api.md`](docs/api.md).
Every variant is currently referenced by the contract. The ones marked
*defensive* guard states that can't happen in practice.

### `lyricsflip`

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `AlreadyInitialized` | Constructor ran on an already-initialized contract (*defensive*) |
| 2 | `NonExistingRound` | No round with the given id |
| 3 | `RoundAlreadyStarted` | Tried to join a round that has already started |
| 4 | `NonExistingGenre` | `create_round` was called without a genre |
| 5 | `RoundAlreadyJoined` | Caller is already a player in the round |
| 6 | `InvalidCardsPerRound` | `set_cards_per_round` was called with 0 |
| 7 | `ArtistCardsIsZero` | No cards exist for the requested artist |
| 8 | `EmptyYearCards` | No cards exist for the requested year |
| 9 | `EmptyGenreCards` | No cards exist for the requested genre |
| 10 | `RoundNotStarted` | Action requires a started round |
| 11 | `RoundCompleted` | Round has no cards left / is already finished |
| 12 | `NotAParticipant` | Caller is not a player in the round |
| 13 | `AlreadyReady` | Caller already signalled ready for the round |
| 14 | `NotAuthorized` | Caller lacks the required owner/admin/round role |
| 15 | `AmountExceedsLimit` | Asked for more random cards than exist (e.g. cards-per-round larger than the catalogue) |
| 16 | `LimitMustBeGreaterThanZero` | Random selection over an empty set (no cards added yet) |
| 17 | `NonExistingCard` | No card with the given id |
| 18 | `RoundNotReady` | `finalize_round` before all answers are in or the deadline has passed |
| 19 | `RoundAlreadyFinalized` | Round was already finalized |
| 20 | `NotEnoughDistinctCards` | `build_question_card` can't find 3 distinct distractors (fewer than 4 distinct values in the catalogue) |
| 21 | `RoundFull` | Round already has `max_players` players |
| 22 | `InvalidMaxPlayers` | `set_max_players` was called with a value below 2 |
| 23 | `NftContractNotSet` | `claim_reward` before the owner set the NFT contract |
| 24 | `MilestoneNotReached` | Player's stats don't meet the milestone yet |
| 25 | `MilestoneAlreadyClaimed` | Player already claimed that milestone |
| 26 | `InvalidCardTitle` | Card `title` is empty |
| 27 | `InvalidCardArtist` | Card `artist` is empty |
| 28 | `InvalidCardLyrics` | Card `lyrics` is empty |
| 29 | `InvalidCardYear` | Card `year` is before 1900 or after the current year |
| 30 | `LyricsTooLong` | Card `lyrics` exceed `MAX_LYRICS_LEN` bytes |
| 31 | `DuplicateCard` | Another card already has this `title` + `artist` |
| 32 | `BatchTooLarge` | `add_cards` got more than `MAX_CARDS_PER_BATCH` cards |
| 33 | `NotPendingOwner` | Caller of `accept_ownership` is not the pending owner |
| 34 | `NoMoreCards` | All cards have been drawn; call `finalize_round` |
| 35 | `RoundCancelled` | Round was cancelled |
| 36 | `InvalidCardDifficulty` | Card difficulty or round difficulty is not between 1 and 3 |
| 37 | `InvalidDecade` | Round decade is not a valid decade start year |
| 38 | `NoActiveCard` | `submit_answer` called before any card is drawn (`next_card` not called) |
| 39 | `AlreadyAnswered` | Player submitted more than one answer for the same card |
| 40 | `Paused` | Contract is currently paused |
| 41 | `InvalidAnswerWindow` | `set_answer_window` called with value outside [5, 180]s |
| 42 | `InvalidLobbyTimeout` | `set_lobby_timeout` called with value outside [30, 86400]s |
| 43 | `InvalidRoundDuration` | `set_round_duration` or `set_round_buffer` called with out-of-bounds value |
| 44 | `CardInActiveRound` | `update_card` tried to change a card's title/artist/year while a non-finalized round still references it (LF-176) |
| 45 | `TooManyOpenRounds` | `create_round` rejected because the caller already has `MAX_OPEN_ROUNDS_PER_ADDRESS` open public lobbies (LF-175) |

### `lyricsflip-nft`

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `AlreadyInitialized` | Constructor ran on an already-initialized contract (*defensive*) |
| 2 | `NotMinter` | Caller of `mint` is not the configured minter |
| 3 | `TokenAlreadyExists` | Token id collision on mint (*defensive*) |
| 4 | `TokenDoesNotExist` | `owner_of` or `token_uri` was called for an unminted token |
| 5 | `IncorrectOwner` | `from` does not own the token being transferred |
| 6 | `InsufficientApproval` | Spender/approver is neither the owner nor approved |
| 7 | `InvalidLiveUntilLedger` | Approval expiry is already in the past |
| 8 | `NotOwner` | Caller of an owner-only function is not the owner |
| 9 | `NotPendingOwner` | Caller of `accept_ownership` is not the pending owner |
| 10 | `BaseUriTooLong` | `base_uri` is longer than 200 bytes |
| 11 | `NonTransferable` | Achievement badges are soulbound; `transfer`, `transfer_from`, `approve`, and `approve_for_all` always panic with this code (LF-169) |
| 11 | `InsufficientBalance` | Balance is insufficient or missing for transfer |
