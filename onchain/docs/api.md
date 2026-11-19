# Soroban contract API reference

This document summarizes the public contract interfaces for `lyricsflip` and `lyricsflip-nft`.

The canonical source of truth remains the Rust contract code in `onchain/contracts/lyricsflip/src/lib.rs` and `onchain/contracts/lyricsflip-nft/src/lib.rs`.

## Conventions

- `caller` and `from`/`approver` are the wallets that must sign the transaction.
- State changes that affect gameplay or ownership are noted under the relevant function.
- Events listed here are the public events emitted by the contracts.
- Examples use the Stellar CLI syntax for contract deployment and invocation.

## `lyricsflip` contract

### `__constructor(env: Env, owner: Address)`
- Signer: deployer identity only.
- State changes: sets contract owner and grants the owner the admin role.
- Errors: `AlreadyInitialized`.
- Events: none.
- Example:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/lyricsflip.wasm \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- --owner <OWNER_ADDRESS>
```

### `get_round(env: Env, round_id: u64) -> Round`
- Signer: none.
- State changes: none.
- Errors: `NonExistingRound` if the id does not exist. Every other function that looks up a round by id can raise the same error.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-round --round_id 1
```

### `get_round_cards(env: Env, round_id: u64) -> Vec<u64>`
- Signer: none.
- State changes: none.
- Errors: none beyond invalid storage.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-round-cards --round_id 1
```

### `get_round_players(env: Env, round_id: u64) -> Vec<Address>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-round-players --round_id 1
```

### `get_players_round_count(env: Env, round_id: u64) -> u32`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-players-round-count --round_id 1
```

### `get_round_scores(env: Env, round_id: u64) -> Map<Address, u64>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-round-scores --round_id 1
```

### `finalize_round(env: Env, caller: Address, round_id: u64)`
- Signer: any round participant.
- State changes: marks the round completed, records final score winners, increments `rounds_won` for winners, marks round finalization.
- Errors: `NotAParticipant`, `RoundCancelled`, `RoundAlreadyFinalized`, `RoundNotReady`.
- Events: `RoundCompleted { round_id, winners, scores }`, then one `CardRevealed { round_id, index, card_id }` per round card (LF-278).
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- finalize-round --caller <PLAYER_ADDRESS> --round_id 1
```

### `get_cards_count(env: Env) -> u64`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-cards-count
```

### `get_round_count(env: Env) -> u64`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-round-count
```

### `get_genre_card_count(env: Env, genre: Genre) -> u32`
- Signer: none.
- State changes: none.
- Errors: `EmptyGenreCards` when the genre has no cards.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-genre-card-count --genre 1
```

### `get_rounds(env: Env, start: u64, limit: u32) -> Vec<Round>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-rounds --start 1 --limit 10
```

### `get_open_rounds(env: Env, start: u32, limit: u32) -> Vec<u64>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-open-rounds --start 0 --limit 10
```

### `get_max_players(env: Env) -> u32`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-max-players
```

### `get_nft_contract(env: Env) -> Option<Address>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-nft-contract
```

### `is_milestone_claimed(env: Env, player: Address, milestone: Milestone) -> bool`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- is-milestone-claimed --player <PLAYER_ADDRESS> --milestone 0
```

### `get_cards_per_round(env: Env) -> u32`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-cards-per-round
```

### `get_card(env: Env, card_id: u64) -> Card`
- Signer: none.
- State changes: none.
- Errors: `NonExistingCard` if the id has no stored card.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-card --card_id 1
```

### `get_question(env: Env, caller: Address, round_id: u64) -> QuestionCard`
- Signer: caller wallet (must be a round participant).
- State changes: none.
- Errors: `NotAParticipant`, `RoundNotStarted`, `NoActiveCard`, `NoMoreCards`.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- get-question --caller <PLAYER_ADDRESS> --round_id 1
```

### `get_cards_of_genre(env: Env, genre: Genre, seed: u64) -> Vec<Card>`
- Signer: none.
- State changes: none.
- Errors: `EmptyGenreCards` when the genre is empty.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-cards-of-genre --genre 1 --seed 123
```

### `get_cards_of_artist(env: Env, artist: String, seed: u64) -> Vec<Card>`
- Signer: none.
- State changes: none.
- Errors: `ArtistCardsIsZero` when the artist has no cards.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-cards-of-artist --artist "Adele" --seed 123
```

### `get_cards_of_a_year(env: Env, year: u64, seed: u64) -> Vec<Card>`
- Signer: none.
- State changes: none.
- Errors: `EmptyYearCards` when no cards match the year.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-cards-of-a-year --year 1999 --seed 123
```

### `get_player_stat(env: Env, player: Address) -> PlayerStats`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-player-stat --player <PLAYER_ADDRESS>
```

### `is_paused(env: Env) -> bool`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- is-paused
```

### `is_admin(env: Env, role: Role, address: Address) -> bool`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- is-admin --role 0 --address <PLAYER_ADDRESS>
```

### `pause(env: Env, caller: Address)`
- Signer: owner.
- State changes: sets `Paused`. Halts new rounds, joins and reward claims; refund and cancel paths stay open.
- Errors: `NotAuthorized`.
- Events: `Paused {}`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- pause --caller <OWNER_ADDRESS>
```

### `unpause(env: Env, caller: Address)`
- Signer: owner.
- State changes: clears `Paused`, resuming normal operation.
- Errors: `NotAuthorized`.
- Events: `Unpaused {}`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- unpause --caller <OWNER_ADDRESS>
```

### `create_round(env: Env, caller: Address, genre: Option<Genre>, seed: u64) -> u64`
- Signer: caller wallet.
- State changes: creates a round, stores players and round cards, pushes round onto the open-round list.
- Errors: `NonExistingGenre` if a genre is missing, `AmountExceedsLimit`, `LimitMustBeGreaterThanZero` if the genre's card pool is exhausted.
- Events: `RoundCreated { round_id, admin, created_time }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- create-round --caller <PLAYER_ADDRESS> --genre 1 --seed 123
```

### `create_round_with_filter(env: Env, caller: Address, filter: RoundFilter, difficulty: Option<u32>, seed: u64) -> u64`
- Signer: caller wallet.
- State changes: same as `create_round`, but cards are drawn from the subset matching `filter.genre`/`filter.decade` and the optional `difficulty`.
- Errors: `InvalidCardDifficulty`, `InvalidDecade`, `EmptyGenreCards`, `AmountExceedsLimit`, `InvalidCardsPerRound`.
- Events: `RoundCreated { round_id, admin, created_time }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- create-round-with-filter --caller <PLAYER_ADDRESS> \
     --filter '{"genre": 1, "decade": 1990}' --difficulty 2 --seed 123
```

### `start_round(env: Env, caller: Address, round_id: u64)`
- Signer: round admin or any participant.
- State changes: marks the player ready; when all players are ready it sets `is_started`, `start_time`, `end_time`, and removes the round from open rounds.
- Errors: `RoundCancelled`, `AlreadyReady`, `NotAuthorized`.
- Events: `PlayerReady`, then `RoundStarted` when the lobby is fully ready.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- start-round --caller <PLAYER_ADDRESS> --round_id 1
```

### `join_round(env: Env, caller: Address, round_id: u64)`
- Signer: wallet of the joining player.
- State changes: appends the player to the round, subject to capacity and pending status.
- Errors (in check order): `Paused`, `NonExistingRound`, `RoundCancelled`, `RoundAlreadyStarted`, `RoundAlreadyJoined`, `RoundFull`, `InvalidInvite`.
- Events: `RoundJoined`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- join-round --caller <PLAYER_ADDRESS> --round_id 1
```

### `leave_round(env: Env, caller: Address, round_id: u64)`
- Signer: active non-admin participant.
- State changes: removes the player, clears ready state, refunds the wager stub.
- Errors: `AdminCannotLeave`, `NotAParticipant`, `RoundCancelled` and pending-state rejections.
- Events: `RoundLeft`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- leave-round --caller <PLAYER_ADDRESS> --round_id 1
```

### `cancel_round(env: Env, caller: Address, round_id: u64)`
- Signer: round admin, or any player after lobby timeout.
- State changes: marks round cancelled, removes it from open rounds, refunds players.
- Errors: `LobbyTimeoutNotReached`, `RoundCancelled`.
- Events: `RoundCancelled`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- cancel-round --caller <PLAYER_ADDRESS> --round_id 1
```

### `next_card(env: Env, round_id: u64) -> Card`
- Signer: none (read-like action, but it mutates stored round state).
- State changes: advances `next_card_index` and sets the current card start time.
- Errors: `RoundNotStarted`, `RoundCompleted`.
- Events: `CardDrawn { round_id, index }` (no card id; see `CardRevealed`).
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- next-card --round_id 1
```

### `set_cards_per_round(env: Env, caller: Address, value: u32)`
- Signer: admin wallet.
- State changes: updates the configured cards-per-round value.
- Errors: `InvalidCardsPerRound` and admin authorization failures.
- Events: `CardsPerRoundUpdated { value }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <ADMIN_IDENTITY> \
  --network testnet \
  -- set-cards-per-round --caller <ADMIN_ADDRESS> --value 5
```

### `add_card(env: Env, caller: Address, card: Card) -> u64`
- Signer: admin wallet.
- State changes: inserts a card into the canonical catalogue and indexes it by genre, artist, year.
- Errors: `InvalidCardTitle`, `InvalidCardArtist`, `InvalidCardLyrics`, `LyricsTooLong`, `InvalidCardYear`, `InvalidCardDifficulty`, and admin authorization failures.
- Events: `CardAdded`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <ADMIN_IDENTITY> \
  --network testnet \
  -- add-card --caller <ADMIN_ADDRESS> --card '{"card_id":0,"genre":1,"artist":"Adele","title":"Hello","year":2015,"lyrics":"Hello, it's me"}'
```

### `add_cards(env: Env, caller: Address, cards: Vec<Card>) -> Vec<u64>`
- Signer: admin wallet.
- State changes: inserts a batch of cards.
- Errors: `BatchTooLarge` and validation failures.
- Events: per-card `CardAdded` events.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <ADMIN_IDENTITY> \
  --network testnet \
  -- add-cards --caller <ADMIN_ADDRESS> --cards '[{"card_id":0,"genre":1,"artist":"Adele","title":"Hello","year":2015,"lyrics":"Hello, it\'s me"}]'
```

### `update_card(env: Env, caller: Address, card_id: u64, card: Card)`
- Signer: admin wallet.
- State changes: replaces the canonical card metadata and reindexes the card.
- Errors: `DuplicateCard`, `InvalidCardTitle`, `InvalidCardArtist`, `InvalidCardLyrics`, `LyricsTooLong`, `InvalidCardYear`, `InvalidCardDifficulty`, admin authorization failures.
- Errors: `DuplicateCard`, `CardInActiveRound` (LF-176: title/artist/year cannot change while a non-finalized round still references the card), validation failures, admin authorization failures.
- Events: `CardUpdated { card_id, genre }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <ADMIN_IDENTITY> \
  --network testnet \
  -- update-card --caller <ADMIN_ADDRESS> --card_id 1 --card '{"card_id":1,"genre":1,"artist":"Adele","title":"Hello","year":2015,"lyrics":"Hello, it\'s me"}'
```

### `remove_card(env: Env, caller: Address, card_id: u64)`
- Signer: admin wallet.
- State changes: soft-removes the card (LF-176). The card is dropped from every index and from all future draws and `get_card`, but its stored entry is kept so rounds that already drew it can still be read and graded. The id is never reused.
- Errors: `NonExistingCard` and admin authorization failures.
- Events: `CardRemoved { card_id }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <ADMIN_IDENTITY> \
  --network testnet \
  -- remove-card --caller <ADMIN_ADDRESS> --card_id 1
```

### `set_role(env: Env, caller: Address, recipient: Address, role: Role, is_enable: bool)`
- Signer: owner wallet.
- State changes: flips the admin flag for `recipient`.
- Errors: owner-only failures.
- Events: `RoleUpdated { account, role, enabled }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- set-role --caller <OWNER_ADDRESS> --recipient <PLAYER_ADDRESS> --role 0 --is_enable true
```

### `owner(env: Env) -> Address`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- owner
```

### `pending_owner(env: Env) -> Option<Address>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- pending-owner
```

### `version() -> u32`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- version
```

### `transfer_ownership(env: Env, caller: Address, new_owner: Address)`
- Signer: current owner.
- State changes: stores the pending owner and emits the ownership-transfer start event.
- Errors: owner-only failures.
- Events: `OwnershipTransferStarted { owner, pending_owner }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- transfer-ownership --caller <OWNER_ADDRESS> --new_owner <NEW_OWNER_ADDRESS>
```

### `accept_ownership(env: Env, caller: Address)`
- Signer: pending owner.
- State changes: swaps the owner and sets the admin role on the new owner.
- Errors: `NotPendingOwner`.
- Events: `OwnershipTransferred { old_owner, new_owner }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <NEW_OWNER_IDENTITY> \
  --network testnet \
  -- accept-ownership --caller <NEW_OWNER_ADDRESS>
```

### `upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>)`
- Signer: owner wallet.
- State changes: replaces the contract wasm in place while preserving storage.
- Errors: owner-only failures.
- Events: none.
- Example:

```bash
HASH=$(stellar contract upload \
  --wasm target/wasm32v1-none/release/lyricsflip.wasm \
  --source <OWNER_IDENTITY> \
  --network testnet)
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- upgrade --caller <OWNER_ADDRESS> --new_wasm_hash $HASH
```

### `submit_answer(env: Env, caller: Address, round_id: u64, answer: Answer) -> bool`
- Signer: player wallet.
- State changes: records the answer, updates score and current streak, and may finalize round scoring after answer processing.
- Errors: `NotAParticipant`, `RoundNotStarted`, `RoundAlreadyFinalized`, `RoundCompleted`, `NoActiveCard`, `AlreadyAnswered`.
- Events: `AnswerSubmitted { round_id, player, correct, points }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- submit-answer --caller <PLAYER_ADDRESS> --round_id 1 --answer '{"title":"Hello"}'
```

### `set_max_players(env: Env, caller: Address, value: u32)`
- Signer: owner wallet.
- State changes: stores the new maximum round size.
- Errors: `InvalidMaxPlayers` and owner-only failures.
- Events: none in the documented public events.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- set-max-players --caller <OWNER_ADDRESS> --value 8
```

### `set_nft_contract(env: Env, caller: Address, nft_contract: Address)`
- Signer: owner wallet.
- State changes: stores the NFT reward contract address.
- Errors: owner-only failures.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- set-nft-contract --caller <OWNER_ADDRESS> --nft_contract <NFT_CONTRACT_ID>
```

### `claim_reward(env: Env, caller: Address, milestone: Milestone) -> u128`
- Signer: the player claiming the reward.
- State changes: marks the milestone as claimed and mints an NFT via the registered minter contract.
- Errors: `NftContractNotSet`, `MilestoneAlreadyClaimed`, `MilestoneNotReached`.
- Events: `RewardClaimed { player, milestone, token_id }`.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <PLAYER_IDENTITY> \
  --network testnet \
  -- claim-reward --caller <PLAYER_ADDRESS> --milestone 0
```

### `build_question_card(env: Env, card: Card, seed: u64, kind: QuestionKind) -> QuestionCard`
- Signer: none.
- State changes: none; returns a shuffled multiple-choice prompt plus one correct answer and distractors.
- Errors: `NotEnoughDistinctCards` if the catalogue lacks enough distinct candidates.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <LYRICSFLIP_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- build-question-card --card '{"card_id":1,"genre":1,"artist":"Adele","title":"Hello","year":2015,"lyrics":"Hello, it\'s me"}' --seed 123 --kind 0
```

## `lyricsflip-nft` contract

### `__constructor(env: Env, owner: Address, minter: Address, token_name: String, token_symbol: String, base_uri: String)`
- Signer: deployer identity only.
- State changes: stores owner, permitted minter, token metadata, and initial token count.
- Errors: `AlreadyInitialized`, `BaseUriTooLong`.
- Events: none.
- Example:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/lyricsflip_nft.wasm \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- --owner <OWNER_ADDRESS> --minter <LYRICSFLIP_CONTRACT_ID> \
     --token_name "LyricsFlip" --token_symbol "LFLIP" --base_uri "https://example.com/metadata/"
```

### `mint(env: Env, caller: Address, recipient: Address, kind: u32) -> u128`
- Signer: the minter contract or designated minter wallet.
- State changes: increments the token count, assigns ownership, updates the recipient balance, and records `kind` (the `Milestone` discriminant this badge represents; see LF-168).
- Errors: `NotMinter`, `TokenAlreadyExists`.
- Events: `NftMinted { token_id, recipient }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <MINTER_IDENTITY> \
  --network testnet \
  -- mint --caller <LYRICSFLIP_CONTRACT_ID> --recipient <PLAYER_ADDRESS> --kind 0
```

### `owner_of(env: Env, token_id: u128) -> Address`
- Signer: none.
- State changes: none.
- Errors: `TokenDoesNotExist`.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- owner-of --token_id 1
```

### `token_kind(env: Env, token_id: u128) -> u32`
- Signer: none.
- State changes: none.
- Errors: `TokenDoesNotExist` (via `owner_of`).
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- token-kind --token_id 1
```

### `balance(env: Env, owner: Address) -> u32`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- balance --owner <PLAYER_ADDRESS>
```

### `tokens_of_owner(env: Env, owner: Address, start: u32, limit: u32) -> Vec<u128>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- tokens-of-owner --owner <PLAYER_ADDRESS> --start 0 --limit 50
```

### `transfer(env: Env, from: Address, to: Address, token_id: u128)`
- Signer: none (always rejected before auth is checked).
- State changes: none. Achievement badges are soulbound (LF-169) — this always panics.
- Errors: `NonTransferable`.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- transfer --from <PLAYER_ADDRESS> --to <RECIPIENT_ADDRESS> --token_id 1
```

### `transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u128)`
- Signer: none (always rejected before auth is checked).
- State changes: none. Achievement badges are soulbound (LF-169) — this always panics.
- Errors: `NonTransferable`.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <SPENDER_IDENTITY> \
  --network testnet \
  -- transfer-from --spender <SPENDER_ADDRESS> --from <OWNER_ADDRESS> --to <RECIPIENT_ADDRESS> --token_id 1
```

### `burn(env: Env, owner: Address, token_id: u128)`
- Signer: `owner` wallet.
- State changes: removes the token's ownership and approval records and decrements the owner's balance.
- Errors: `IncorrectOwner`, `InsufficientBalance` (defensive — the balance check can't actually fail given the preceding ownership check).
- Events: `Burn { token_id, owner }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- burn --owner <OWNER_ADDRESS> --token_id 1
```

### `burn_from(env: Env, spender: Address, owner: Address, token_id: u128)`
- Signer: `spender` wallet. Must be `owner`, the contract owner (badge revocation), an approved spender for the token, or an approved operator for all of `owner`'s tokens.
- State changes: same as `burn`.
- Errors: `InsufficientApproval`, `IncorrectOwner`.
- Events: `Burn { token_id, owner }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <SPENDER_IDENTITY> \
  --network testnet \
  -- burn-from --spender <SPENDER_ADDRESS> --owner <OWNER_ADDRESS> --token_id 1
```

### `approve(env: Env, approver: Address, approved: Address, token_id: u128, live_until_ledger: u32)`
- Signer: none (always rejected).
- State changes: none. Achievement badges are soulbound (LF-169) — this always panics.
- Errors: `NonTransferable` always; `InvalidLiveUntilLedger` and the `Approve` event exist in the contract's types but are unreachable while the soulbound panic fires first.
- Events: none reachable.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- approve --approver <OWNER_ADDRESS> --approved <SPENDER_ADDRESS> --token_id 1 --live_until_ledger 1000000
```

### `approve_for_all(env: Env, owner: Address, operator: Address, live_until_ledger: u32)`
- Signer: none (always rejected).
- State changes: none. Achievement badges are soulbound (LF-169) — this always panics.
- Errors: `NonTransferable` always; the `ApproveForAll` event exists in the contract's types but is unreachable while the soulbound panic fires first.
- Events: none reachable.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- approve-for-all --owner <OWNER_ADDRESS> --operator <OPERATOR_ADDRESS> --live_until_ledger 1000000
```

### `get_approved(env: Env, token_id: u128) -> Option<Address>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- get-approved --token_id 1
```

### `is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- is-approved-for-all --owner <OWNER_ADDRESS> --operator <OPERATOR_ADDRESS>
```

### `token_name(env: Env) -> String`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- token-name
```

### `token_symbol(env: Env) -> String`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- token-symbol
```

### `base_uri(env: Env) -> String`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- base-uri
```

### `token_uri(env: Env, token_id: u128) -> String`
- Signer: none.
- State changes: none.
- Errors: `TokenDoesNotExist`.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- token-uri --token_id 1
```

### `token_count(env: Env) -> u128`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- token-count
```

### `owner(env: Env) -> Address`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- owner
```

### `minter(env: Env) -> Address`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- minter
```

### `pending_owner(env: Env) -> Option<Address>`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- pending-owner
```

### `version() -> u32`
- Signer: none.
- State changes: none.
- Errors: none.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <READONLY_IDENTITY> \
  --network testnet \
  -- version
```

### `set_base_uri(env: Env, caller: Address, base_uri: String)`
- Signer: owner wallet.
- State changes: updates the metadata base URL.
- Errors: `BaseUriTooLong`, `NotOwner`.
- Events: none.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- set-base-uri --caller <OWNER_ADDRESS> --base_uri "https://example.com/metadata/"
```

### `pause(env: Env, caller: Address)`
- Signer: owner wallet.
- State changes: sets `Paused`.
- Errors: `NotOwner`.
- Events: `Paused { owner }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- pause --caller <OWNER_ADDRESS>
```

### `unpause(env: Env, caller: Address)`
- Signer: owner wallet.
- State changes: clears `Paused`.
- Errors: `NotOwner`.
- Events: `Unpaused { owner }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- unpause --caller <OWNER_ADDRESS>
```

### `set_minter(env: Env, caller: Address, new_minter: Address)`
- Signer: owner wallet.
- State changes: rotates the allowed minter and emits the minter-change event.
- Errors: `NotOwner`.
- Events: `MinterUpdated { old_minter, new_minter }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- set-minter --caller <OWNER_ADDRESS> --new_minter <NEW_MINTER_ADDRESS>
```

### `transfer_ownership(env: Env, caller: Address, new_owner: Address)`
- Signer: owner wallet.
- State changes: records a pending owner.
- Errors: owner-only failures.
- Events: `OwnershipTransferStarted { owner, pending_owner }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- transfer-ownership --caller <OWNER_ADDRESS> --new_owner <NEW_OWNER_ADDRESS>
```

### `accept_ownership(env: Env, caller: Address)`
- Signer: pending owner.
- State changes: adopts the new owner and clears the pending owner slot.
- Errors: `NotPendingOwner`.
- Events: `OwnershipTransferred { old_owner, new_owner }`.
- Example:

```bash
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <NEW_OWNER_IDENTITY> \
  --network testnet \
  -- accept-ownership --caller <NEW_OWNER_ADDRESS>
```

### `upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>)`
- Signer: owner wallet.
- State changes: swaps the wasm underlying the contract while preserving storage.
- Errors: owner-only failures.
- Events: none.
- Example:

```bash
HASH=$(stellar contract upload \
  --wasm target/wasm32v1-none/release/lyricsflip_nft.wasm \
  --source <OWNER_IDENTITY> \
  --network testnet)
stellar contract invoke \
  --id <NFT_CONTRACT_ID> \
  --source <OWNER_IDENTITY> \
  --network testnet \
  -- upgrade --caller <OWNER_ADDRESS> --new_wasm_hash $HASH
```
