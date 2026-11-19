import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * Ported from `onchain/src/utils/types.cairo`. `felt252`/`ByteArray` fields
 * become `String`; Starknet's `u8` fields become `u32` since Soroban has no
 * native u8 contract type.
 */
export interface Card {
  artist: string;
  card_id: u64;
  difficulty: u32;
  genre: Genre;
  lyrics: string;
  title: string;
  year: u64;
}

/**
 * Mirrors Cairo's single `ADMIN_ROLE` selector. Kept as an enum (instead of
 * dropping the parameter entirely) so `set_role`/`is_admin` keep the same
 * call shape as the original `ILyricsFlip` interface.
 */
export enum Role {
  Admin = 0,
}

/**
 * Explicit discriminants make this a "simple" contracttype enum, which
 * soroban-sdk encodes as a plain `u32` (and the JS SDK decodes to a plain
 * `number`) rather than the `{tag, values}` shape used for enums with
 * associated data (see `Answer` below). Keep `frontend/src/lib/stellar/types.ts`'s
 * `GENRE_VALUES` ordering in sync with these values.
 */
export enum Genre {
  HipHop = 0,
  Pop = 1,
  Rock = 2,
  RnB = 3,
  Electronic = 4,
  Classical = 5,
  Jazz = 6,
  Country = 7,
  Blues = 8,
  Reggae = 9,
  Afrobeat = 10,
  Gospel = 11,
  Folk = 12,
}


export interface Round {
  admin: string;
  /**
 * LF-158: Snapshotted answer window (seconds per card).
 */
answer_window: u64;
  end_time: u64;
  genre: Genre;
  is_cancelled: boolean;
  is_completed: boolean;
  /**
 * LF-162: true when the round requires an invite code to join.
 */
is_private: boolean;
  is_started: boolean;
  /**
 * LF-158: Snapshotted lobby timeout (seconds before non-admin can cancel).
 */
lobby_timeout: u64;
  next_card_index: u32;
  /**
 * LF-158: Snapshotted round duration (seconds from start to deadline).
 */
round_duration: u64;
  round_id: u64;
  /**
 * LF-163: solo rounds skip OpenRounds and start in the same call.
 */
solo: boolean;
  start_time: u64;
  wager_amount: i128;
}

export type Answer = {tag: "Artist", values: readonly [string]} | {tag: "Year", values: readonly [u64]} | {tag: "Title", values: readonly [string]};


/**
 * Position of a card in the global, genre, artist and year indexes.
 */
export interface CardPos {
  all: u32;
  artist: u32;
  genre: u32;
  year: u32;
}

export type DataKey = {tag: "Owner", values: void} | {tag: "PendingOwner", values: void} | {tag: "Admin", values: readonly [string]} | {tag: "Admins", values: void} | {tag: "RoundCount", values: void} | {tag: "CardsCount", values: void} | {tag: "CardsPerRound", values: void} | {tag: "Card", values: readonly [u64]} | {tag: "LastCardId", values: void} | {tag: "CardKey", values: readonly [Buffer]} | {tag: "CardPos", values: readonly [u64]} | {tag: "CardAt", values: readonly [u32]} | {tag: "GenreCardCount", values: readonly [Genre]} | {tag: "GenreCardAt", values: readonly [readonly [Genre, u32]]} | {tag: "ArtistCardCount", values: readonly [string]} | {tag: "ArtistCardAt", values: readonly [readonly [string, u32]]} | {tag: "YearCardCount", values: readonly [u64]} | {tag: "YearCardAt", values: readonly [readonly [u64, u32]]} | {tag: "Round", values: readonly [u64]} | {tag: "RoundPlayers", values: readonly [u64]} | {tag: "RoundCards", values: readonly [u64]} | {tag: "RoundScores", values: readonly [u64]} | {tag: "RoundAnswerTimes", values: readonly [u64]} | {tag: "RoundCardStartedAt", values: readonly [readonly [u64, u64]]} | {tag: "RoundPlayerAnswered", values: readonly [readonly [u64, string, u64]]} | {tag: "RoundFinalized", values: readonly [u64]} | {tag: "RoundInviteHash", values: readonly [u64]} | {tag: "PlayerStats", values: readonly [string]} | {tag: "RoundReady", values: readonly [readonly [u64, string]]} | {tag: "RoundReadyCount", values: readonly [u64]} | {tag: "OpenRounds", values: void} | {tag: "MaxPlayers", values: void} | {tag: "RoundCreatedAt", values: readonly [u64]} | {tag: "NftContract", values: void} | {tag: "MilestoneClaimed", values: readonly [readonly [string, Milestone]]} | {tag: "Paused", values: void} | {tag: "PlayerCardIndex", values: readonly [readonly [u64, string]]} | {tag: "PlayerCardStartedAt", values: readonly [readonly [u64, string, u64]]} | {tag: "SchemaVersion", values: void} | {tag: "AnswerWindow", values: void} | {tag: "LobbyTimeout", values: void} | {tag: "RoundDuration", values: void} | {tag: "RoundBuffer", values: void} | {tag: "CardDisabled", values: readonly [u64]} | {tag: "CardLiveRounds", values: readonly [u64]} | {tag: "OpenRoundsOf", values: readonly [string]};


/**
 * Schema v3 round layout (pre LF-162/163): `Round` without `is_private` and
 * `solo`. `read_round` lazily re-encodes stored v3 entries as `Round`.
 */
export interface RoundV3 {
  admin: string;
  answer_window: u64;
  end_time: u64;
  genre: Genre;
  is_cancelled: boolean;
  is_completed: boolean;
  is_started: boolean;
  lobby_timeout: u64;
  next_card_index: u32;
  round_duration: u64;
  round_id: u64;
  start_time: u64;
  wager_amount: i128;
}

/**
 * NFT reward milestones a player can claim once each via `claim_reward`.
 */
export enum Milestone {
  FirstWin = 0,
  Streak5 = 1,
  TenWins = 2,
}


export interface LegacyCard {
  artist: string;
  card_id: u64;
  genre: Genre;
  lyrics: string;
  title: string;
  year: u64;
}


export interface LegacyRound {
  admin: string;
  end_time: u64;
  genre: Genre;
  is_cancelled: boolean;
  is_completed: boolean;
  is_started: boolean;
  next_card_index: u32;
  round_id: u64;
  start_time: u64;
  wager_amount: i128;
}


export interface PlayerStats {
  current_streak: u64;
  max_streak: u64;
  rounds_won: u64;
  total_rounds: u64;
}


export interface AnswerResult {
  correct: boolean;
  correct_option: u32;
  next: Array<Card>;
  points: u64;
}


export interface QuestionCard {
  /**
 * Which attribute the options represent (Title / Artist / Year).
 */
kind: QuestionKind;
  lyric: string;
  option_four: string;
  option_one: string;
  option_three: string;
  option_two: string;
  timestamp: u64;
}

/**
 * Specifies what the player is asked to identify in a `QuestionCard`.
 * Using explicit discriminants keeps the on-chain ABI stable and makes the
 * JS SDK decode to a plain `number` (same encoding rule as `Genre`/`Role`).
 * Keep `frontend/src/lib/stellar/types.ts`'s `QUESTION_KIND_VALUES` in sync.
 */
export enum QuestionKind {
  Title = 0,
  Artist = 1,
  Year = 2,
}

/**
 * Contract error codes. Clients (see `frontend/src/lib/stellar/errors.ts`)
 * map on the numeric values, so they are part of the public ABI: never
 * renumber or reuse a code. New variants take the next free number, and the
 * table in `onchain/README.md` plus `test::error_codes_are_stable` must be
 * updated alongside.
 */
export const Errors = {
  /**
   * Defensive only: `__constructor` runs exactly once per deployment, so
   * this is unreachable in practice.
   */
  1: {message:"AlreadyInitialized"},
  /**
   * No round exists with the given id.
   */
  2: {message:"NonExistingRound"},
  /**
   * The round has already been started and can no longer be joined.
   */
  3: {message:"RoundAlreadyStarted"},
  /**
   * No genre exists with the given id.
   */
  4: {message:"NonExistingGenre"},
  /**
   * The calling player has already joined this round.
   */
  5: {message:"RoundAlreadyJoined"},
  /**
   * `cards_per_round` must be greater than zero.
   */
  6: {message:"InvalidCardsPerRound"},
  /**
   * A round must contain at least one artist card.
   */
  7: {message:"ArtistCardsIsZero"},
  /**
   * The year-cards pool for the round is empty.
   */
  8: {message:"EmptyYearCards"},
  /**
   * The genre-cards pool for the round is empty.
   */
  9: {message:"EmptyGenreCards"},
  /**
   * The round has not been started yet.
   */
  10: {message:"RoundNotStarted"},
  /**
   * The round has already been completed.
   */
  11: {message:"RoundCompleted"},
  /**
   * The caller is not a participant of this round.
   */
  12: {message:"NotAParticipant"},
  /**
   * The calling player has already marked themselves ready.
   */
  13: {message:"AlreadyReady"},
  /**
   * The caller is not authorized to perform this action.
   */
  14: {message:"NotAuthorized"},
  /**
   * The requested amount exceeds the configured limit.
   */
  15: {message:"AmountExceedsLimit"},
  /**
   * The limit must be greater than zero.
   */
  16: {message:"LimitMustBeGreaterThanZero"},
  /**
   * No card exists with the given id.
   */
  17: {message:"NonExistingCard"},
  /**
   * The round is not ready to be started or finalized yet.
   */
  18: {message:"RoundNotReady"},
  /**
   * The round has already been finalized.
   */
  19: {message:"RoundAlreadyFinalized"},
  /**
   * The round does not contain enough distinct cards to start.
   */
  20: {message:"NotEnoughDistinctCards"},
  /**
   * The round is full and cannot accept more players.
   */
  21: {message:"RoundFull"},
  /**
   * `max_players` is invalid (e.g. zero or below the current player count).
   */
  22: {message:"InvalidMaxPlayers"},
  /**
   * The NFT contract address has not been configured.
   */
  23: {message:"NftContractNotSet"},
  /**
   * The milestone has not been reached yet.
   */
  24: {message:"MilestoneNotReached"},
  /**
   * The milestone reward has already been claimed.
   */
  25: {message:"MilestoneAlreadyClaimed"},
  /**
   * The card title is invalid (empty or too long).
   */
  26: {message:"InvalidCardTitle"},
  /**
   * The card artist is invalid (empty or too long).
   */
  27: {message:"InvalidCardArtist"},
  /**
   * The card lyrics are invalid (empty or too long).
   */
  28: {message:"InvalidCardLyrics"},
  /**
   * The card year is invalid.
   */
  29: {message:"InvalidCardYear"},
  /**
   * The card lyrics exceed the maximum allowed length.
   */
  30: {message:"LyricsTooLong"},
  /**
   * A card with the same content already exists in the round.
   */
  31: {message:"DuplicateCard"},
  /**
   * The batch of cards exceeds the maximum allowed size.
   */
  32: {message:"BatchTooLarge"},
  /**
   * The caller is not the pending owner of the contract.
   */
  33: {message:"NotPendingOwner"},
  /**
   * The deck has no cards left to draw; call `finalize_round`.
   */
  34: {message:"NoMoreCards"},
  /**
   * The round was cancelled and cannot accept further actions.
   */
  35: {message:"RoundCancelled"},
  /**
   * Card difficulty or round difficulty is not between 1 and 3.
   */
  36: {message:"InvalidCardDifficulty"},
  /**
   * Round decade is not a valid decade start year.
   */
  37: {message:"InvalidDecade"},
  /**
   * `submit_answer` was called before any card was drawn.
   */
  38: {message:"NoActiveCard"},
  /**
   * The player has already answered this card in this round.
   */
  39: {message:"AlreadyAnswered"},
  /**
   * The contract is paused by the owner (LF-174).
   */
  40: {message:"Paused"},
  /**
   * LF-158: The answer window is invalid (outside [MIN_ANSWER_WINDOW_SECONDS, MAX_ANSWER_WINDOW_SECONDS]).
   */
  41: {message:"InvalidAnswerWindow"},
  /**
   * LF-158: The lobby timeout is invalid (outside [MIN_LOBBY_TIMEOUT_SECONDS, MAX_LOBBY_TIMEOUT_SECONDS]).
   */
  42: {message:"InvalidLobbyTimeout"},
  /**
   * LF-158: The round duration or buffer is invalid.
   */
  43: {message:"InvalidRoundDuration"},
  /**
   * LF-176: `update_card` would change the title/artist/year of a card
   * that an unfinalized round still references. Wait for the round to
   * finalize (or be cancelled) before editing the card.
   */
  44: {message:"CardInActiveRound"},
  /**
   * LF-175: the caller already has `MAX_OPEN_ROUNDS_PER_ADDRESS` public
   * lobbies open. Start, cancel, or let one expire before creating another.
   */
  45: {message:"TooManyOpenRounds"},
  /**
   * LF-154: `set_max_players` got a value above `MAX_ROUND_PLAYERS`.
   */
  46: {message:"MaxPlayersTooHigh"}
}


























export interface Client {
  /**
   * Construct and simulate a owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current owner.
   */
  owner: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Owner-only. Halts new rounds, joins and reward claims. Refund and
   * cancel paths stay open so escrowed funds can always leave.
   */
  pause: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a migrate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Owner-only. Migrates stored state step-by-step from the stored
   * schema version up to `SCHEMA_VERSION`. Strictly idempotent: calling it
   * multiple times after migration is a no-op.
   */
  migrate: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Owner-only. Resumes normal operation.
   */
  unpause: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Owner-only. Replaces this contract's code in place, keeping all
   * storage. Emits `ContractUpgraded`.
   */
  upgrade: ({caller, new_wasm_hash}: {caller: string, new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the contract version.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a add_card transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a card and returns its id. The `card_id` field of `card` is
   * ignored; the stored card carries the assigned id.
   */
  add_card: ({caller, card}: {caller: string, card: Card}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_card transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the card. A soft-removed card (LF-176) is reported as
   * `NonExistingCard`: it is gone from the catalogue even though rounds
   * that already drew it keep a readable copy for grading.
   */
  get_card: ({card_id}: {card_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Card>>

  /**
   * Construct and simulate a is_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns whether admin.
   */
  is_admin: ({role, address}: {role: Role, address: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Owner-only. The owner may manage roles even after revoking their own
   * admin flag, so they can never lock themselves out.
   */
  set_role: ({caller, recipient, role, is_enable}: {caller: string, recipient: string, role: Role, is_enable: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a add_cards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds up to `MAX_CARDS_PER_BATCH` cards in one call and returns their
   * ids in order. The whole batch fails if any card is invalid.
   */
  add_cards: ({caller, cards}: {caller: string, cards: Array<Card>}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a get_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the round.
   */
  get_round: ({round_id}: {round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Round>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns whether the contract is currently paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a next_card transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Advances to the next card.
   * 
   * Returns `Error::NoMoreCards` (LF-003) when the deck is exhausted so
   * callers can distinguish "deck empty, call finalize_round" from "round
   * already finalized". The `is_completed` flag is set only by
   * `finalize_round`, so players can still answer the last drawn card
   * after this function returns it.
   */
  next_card: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Card>>

  /**
   * Construct and simulate a get_admins transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current list of admin addresses (LF-156).
   */
  get_admins: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_rounds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns up to `limit` rounds (clamped to `MAX_PAGE_LIMIT`) starting at
   * round id `start`, in ascending id order. Round ids begin at 1, so a
   * `start` of 0 is treated as 1. Returns an empty list past the end.
   */
  get_rounds: ({start, limit}: {start: u64, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Round>>>

  /**
   * Construct and simulate a join_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Joins round. For a private round (LF-162), `invite_code` must be a
   * string whose sha256 equals the round's stored `RoundInviteHash`.
   */
  join_round: ({caller, round_id, invite_code}: {caller: string, round_id: u64, invite_code: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a leave_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Leaves a round that hasn't started yet and refunds the caller's wager.
   * The round admin can't leave; they cancel the round instead.
   */
  leave_round: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a remove_card transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Soft-removes a card (LF-176): drops it from every index and from all
   * future draws and views, but keeps the stored `Card` entry so rounds
   * that already drew the card can still read and grade it. The id is
   * never reused; `get_card` reports `NonExistingCard` afterwards.
   */
  remove_card: ({caller, card_id}: {caller: string, card_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Starts round.
   */
  start_round: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a update_card transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replaces the contents of `card_id`, moving it between the genre,
   * artist and year indexes as needed.
   * 
   * LF-176: rejects changes to the answer fields (title, artist, year)
   * while an unfinalized round still references the card, so an in-flight
   * round can never be scored against edited answers. Genre, difficulty
   * and lyrics edits stay allowed: they don't change the correct answer.
   */
  update_card: ({caller, card_id, card}: {caller: string, card_id: u64, card: Card}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancels a round that hasn't started and refunds every player. Callable
   * by the round admin at any time before start, or by anyone once the
   * lobby has been open for `LOBBY_TIMEOUT_SECONDS`.
   */
  cancel_round: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_reward transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mints the NFT for `milestone` to `caller` through a cross-contract
   * call. This contract must be the NFT contract's minter. Each milestone
   * can be claimed once per player.
   */
  claim_reward: ({caller, milestone}: {caller: string, milestone: Milestone}, options?: MethodOptions) => Promise<AssembledTransaction<u128>>

  /**
   * Construct and simulate a create_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a round. `invite_hash` (LF-162) makes the round private: only
   * a joiner that presents a code whose sha256 matches may enter.
   */
  create_round: ({caller, genre, seed, invite_hash}: {caller: string, genre: Option<Genre>, seed: u64, invite_hash: Option<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_question transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * LF-142: returns only the lyric, kind and options for the caller's
   * current card in `round_id`, never the title/artist/year. Replaces
   * `next_card`'s old `Card` return so a modified client cannot read the
   * answer from the contract's own return values.
   */
  get_question: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<QuestionCard>>

  /**
   * Construct and simulate a pending_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the pending owner.
   */
  pending_owner: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a submit_answer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submits a round answer.
   */
  submit_answer: ({caller, round_id, answer}: {caller: string, round_id: u64, answer: Answer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a finalize_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Finalizes a round.
   */
  finalize_round: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a schema_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the stored storage schema version. Unmigrated / legacy deployments default to 1.
   */
  schema_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a answer_and_next transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  answer_and_next: ({caller, round_id, choice}: {caller: string, round_id: u64, choice: Answer}, options?: MethodOptions) => Promise<AssembledTransaction<AnswerResult>>

  /**
   * Construct and simulate a get_cards_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Number of live (added and not removed) cards.
   */
  get_cards_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_max_players transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the max players.
   */
  get_max_players: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_open_rounds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ids of rounds that are created but not yet started (i.e. joinable),
   * oldest first. `start` is an offset into that list and `limit` is
   * clamped to `MAX_PAGE_LIMIT`.
   */
  get_open_rounds: ({start, limit}: {start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a get_player_stat transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the player stat.
   */
  get_player_stat: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<PlayerStats>>

  /**
   * Construct and simulate a get_round_cards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the round cards.
   * 
   * LF-142: while a round is active (started and not finalized), only an
   * admin may read the card ids, so a modified client cannot look up the
   * answers ahead of time. After finalization the list is public again.
   */
  get_round_cards: ({caller, round_id}: {caller: string, round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a get_round_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the round count.
   */
  get_round_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a set_max_players transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the max players.
   */
  set_max_players: ({caller, value}: {caller: string, value: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accept_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Completes an ownership transfer and grants the new owner the admin
   * role. The previous owner keeps any admin role they had.
   */
  accept_ownership: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_nft_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the nft contract.
   */
  get_nft_contract: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_round_buffer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the owner-configured per-card latency buffer in seconds,
   * defaulting to `DEFAULT_ROUND_BUFFER_SECONDS` (10s).
   */
  get_round_buffer: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_round_scores transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the round scores.
   */
  get_round_scores: ({round_id}: {round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Map<string, u64>>>

  /**
   * Construct and simulate a set_nft_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the nft contract.
   */
  set_nft_contract: ({caller, nft_contract}: {caller: string, nft_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_round_buffer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the latency buffer added per card (in seconds) for dynamic deadline calculation.
   */
  set_round_buffer: ({caller, value}: {caller: string, value: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_solo_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * LF-163: create and start a solo round in one call, return the first
   * question. Skipped from OpenRounds so it never appears in the
   * multiplayer lobby. Exactly ONE require_auth: create_round_internal
   * performs it, so we do not call it again here, and the first card is
   * drawn inline (next_card would require_auth a second time).
   */
  create_solo_round: ({caller, genre, seed}: {caller: string, genre: Option<Genre>, seed: u64}, options?: MethodOptions) => Promise<AssembledTransaction<QuestionCard>>

  /**
   * Construct and simulate a get_answer_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the owner-configured answer window in seconds, defaulting to
   * `CARD_ANSWER_WINDOW_SECONDS` (15s).
   */
  get_answer_window: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_lobby_timeout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the owner-configured lobby timeout in seconds, defaulting to
   * `LOBBY_TIMEOUT_SECONDS` (600s).
   */
  get_lobby_timeout: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_round_players transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the round players.
   */
  get_round_players: ({round_id}: {round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a set_answer_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the answer window in seconds.
   */
  set_answer_window: ({caller, value}: {caller: string, value: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_lobby_timeout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the lobby timeout in seconds.
   */
  set_lobby_timeout: ({caller, value}: {caller: string, value: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_cards_of_genre transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the cards of genre.
   */
  get_cards_of_genre: ({genre, seed}: {genre: Genre, seed: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Card>>>

  /**
   * Construct and simulate a get_round_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the owner-configured fixed round duration override in seconds,
   * or `None` if dynamic deadline calculation is used.
   */
  get_round_duration: (options?: MethodOptions) => Promise<AssembledTransaction<Option<u64>>>

  /**
   * Construct and simulate a set_round_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets an optional fixed round duration in seconds. Passing `None` or `Some(0)`
   * resets the contract to use dynamic deadline calculation:
   * `cards_per_round * (answer_window + buffer)`.
   */
  set_round_duration: ({caller, value}: {caller: string, value: Option<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Step one of an ownership transfer; `new_owner` must then call
   * `accept_ownership`. Calling again replaces the pending owner.
   */
  transfer_ownership: ({caller, new_owner}: {caller: string, new_owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a build_question_card transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Builds a question card.
   */
  build_question_card: ({card, seed, kind}: {card: Card, seed: u64, kind: QuestionKind}, options?: MethodOptions) => Promise<AssembledTransaction<QuestionCard>>

  /**
   * Construct and simulate a get_cards_of_a_year transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the cards of a year.
   */
  get_cards_of_a_year: ({year, seed}: {year: u64, seed: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Card>>>

  /**
   * Construct and simulate a get_cards_of_artist transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the cards of artist.
   */
  get_cards_of_artist: ({artist, seed}: {artist: string, seed: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Card>>>

  /**
   * Construct and simulate a get_cards_per_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the cards per round.
   */
  get_cards_per_round: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_cards_per_round transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the cards per round.
   */
  set_cards_per_round: ({caller, value}: {caller: string, value: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_genre_card_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the genre card count.
   */
  get_genre_card_count: ({genre}: {genre: Genre}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a is_milestone_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns whether milestone claimed.
   */
  is_milestone_claimed: ({player, milestone}: {player: string, milestone: Milestone}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a migrate_legacy_admins transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Owner-only batch migration for legacy admin keys that cannot be
   * enumerated from instance storage. Pass candidate addresses from the
   * contract's historical `RoleUpdated` events; use multiple calls for
   * large histories. Active legacy grants are moved to persistent storage
   * and the admin index, while legacy false tombstones are deleted.
   */
  migrate_legacy_admins: ({caller, candidates}: {caller: string, candidates: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_players_round_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the players round count.
   */
  get_players_round_count: ({round_id}: {round_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a create_round_with_filter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a round using optional genre, decade and difficulty filters.
   */
  create_round_with_filter: ({caller, filter, difficulty, seed}: {caller: string, filter: RoundFilter, difficulty: Option<u32>, seed: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner}: {owner: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({owner}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAABpSZXR1cm5zIHRoZSBjdXJyZW50IG93bmVyLgAAAAAABW93bmVyAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAHxPd25lci1vbmx5LiBIYWx0cyBuZXcgcm91bmRzLCBqb2lucyBhbmQgcmV3YXJkIGNsYWltcy4gUmVmdW5kIGFuZApjYW5jZWwgcGF0aHMgc3RheSBvcGVuIHNvIGVzY3Jvd2VkIGZ1bmRzIGNhbiBhbHdheXMgbGVhdmUuAAAABXBhdXNlAAAAAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAALBPd25lci1vbmx5LiBNaWdyYXRlcyBzdG9yZWQgc3RhdGUgc3RlcC1ieS1zdGVwIGZyb20gdGhlIHN0b3JlZApzY2hlbWEgdmVyc2lvbiB1cCB0byBgU0NIRU1BX1ZFUlNJT05gLiBTdHJpY3RseSBpZGVtcG90ZW50OiBjYWxsaW5nIGl0Cm11bHRpcGxlIHRpbWVzIGFmdGVyIG1pZ3JhdGlvbiBpcyBhIG5vLW9wLgAAAAdtaWdyYXRlAAAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAA=",
        "AAAAAAAAACVPd25lci1vbmx5LiBSZXN1bWVzIG5vcm1hbCBvcGVyYXRpb24uAAAAAAAAB3VucGF1c2UAAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAGJPd25lci1vbmx5LiBSZXBsYWNlcyB0aGlzIGNvbnRyYWN0J3MgY29kZSBpbiBwbGFjZSwga2VlcGluZyBhbGwKc3RvcmFnZS4gRW1pdHMgYENvbnRyYWN0VXBncmFkZWRgLgAAAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAB1SZXR1cm5zIHRoZSBjb250cmFjdCB2ZXJzaW9uLgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAHJBZGRzIGEgY2FyZCBhbmQgcmV0dXJucyBpdHMgaWQuIFRoZSBgY2FyZF9pZGAgZmllbGQgb2YgYGNhcmRgIGlzCmlnbm9yZWQ7IHRoZSBzdG9yZWQgY2FyZCBjYXJyaWVzIHRoZSBhc3NpZ25lZCBpZC4AAAAAAAhhZGRfY2FyZAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAEY2FyZAAAB9AAAAAEQ2FyZAAAAAEAAAAG",
        "AAAAAAAAALhSZXR1cm5zIHRoZSBjYXJkLiBBIHNvZnQtcmVtb3ZlZCBjYXJkIChMRi0xNzYpIGlzIHJlcG9ydGVkIGFzCmBOb25FeGlzdGluZ0NhcmRgOiBpdCBpcyBnb25lIGZyb20gdGhlIGNhdGFsb2d1ZSBldmVuIHRob3VnaCByb3VuZHMKdGhhdCBhbHJlYWR5IGRyZXcgaXQga2VlcCBhIHJlYWRhYmxlIGNvcHkgZm9yIGdyYWRpbmcuAAAACGdldF9jYXJkAAAAAQAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAQAAB9AAAAAEQ2FyZA==",
        "AAAAAAAAABZSZXR1cm5zIHdoZXRoZXIgYWRtaW4uAAAAAAAIaXNfYWRtaW4AAAACAAAAAAAAAARyb2xlAAAH0AAAAARSb2xlAAAAAAAAAAdhZGRyZXNzAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAAHdPd25lci1vbmx5LiBUaGUgb3duZXIgbWF5IG1hbmFnZSByb2xlcyBldmVuIGFmdGVyIHJldm9raW5nIHRoZWlyIG93bgphZG1pbiBmbGFnLCBzbyB0aGV5IGNhbiBuZXZlciBsb2NrIHRoZW1zZWx2ZXMgb3V0LgAAAAAIc2V0X3JvbGUAAAAEAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAABHJvbGUAAAfQAAAABFJvbGUAAAAAAAAACWlzX2VuYWJsZQAAAAAAAAEAAAAA",
        "AAAAAAAAAIBBZGRzIHVwIHRvIGBNQVhfQ0FSRFNfUEVSX0JBVENIYCBjYXJkcyBpbiBvbmUgY2FsbCBhbmQgcmV0dXJucyB0aGVpcgppZHMgaW4gb3JkZXIuIFRoZSB3aG9sZSBiYXRjaCBmYWlscyBpZiBhbnkgY2FyZCBpcyBpbnZhbGlkLgAAAAlhZGRfY2FyZHMAAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABWNhcmRzAAAAAAAD6gAAB9AAAAAEQ2FyZAAAAAEAAAPqAAAABg==",
        "AAAAAAAAABJSZXR1cm5zIHRoZSByb3VuZC4AAAAAAAlnZXRfcm91bmQAAAAAAAABAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAH0AAAAAVSb3VuZAAAAA==",
        "AAAAAAAAADFSZXR1cm5zIHdoZXRoZXIgdGhlIGNvbnRyYWN0IGlzIGN1cnJlbnRseSBwYXVzZWQuAAAAAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAUJBZHZhbmNlcyB0byB0aGUgbmV4dCBjYXJkLgoKUmV0dXJucyBgRXJyb3I6Ok5vTW9yZUNhcmRzYCAoTEYtMDAzKSB3aGVuIHRoZSBkZWNrIGlzIGV4aGF1c3RlZCBzbwpjYWxsZXJzIGNhbiBkaXN0aW5ndWlzaCAiZGVjayBlbXB0eSwgY2FsbCBmaW5hbGl6ZV9yb3VuZCIgZnJvbSAicm91bmQKYWxyZWFkeSBmaW5hbGl6ZWQiLiBUaGUgYGlzX2NvbXBsZXRlZGAgZmxhZyBpcyBzZXQgb25seSBieQpgZmluYWxpemVfcm91bmRgLCBzbyBwbGF5ZXJzIGNhbiBzdGlsbCBhbnN3ZXIgdGhlIGxhc3QgZHJhd24gY2FyZAphZnRlciB0aGlzIGZ1bmN0aW9uIHJldHVybnMgaXQuAAAAAAAJbmV4dF9jYXJkAAAAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAH0AAAAARDYXJk",
        "AAAAAAAAADVSZXR1cm5zIHRoZSBjdXJyZW50IGxpc3Qgb2YgYWRtaW4gYWRkcmVzc2VzIChMRi0xNTYpLgAAAAAAAApnZXRfYWRtaW5zAAAAAAAAAAAAAQAAA+oAAAAT",
        "AAAAAAAAAMxSZXR1cm5zIHVwIHRvIGBsaW1pdGAgcm91bmRzIChjbGFtcGVkIHRvIGBNQVhfUEFHRV9MSU1JVGApIHN0YXJ0aW5nIGF0CnJvdW5kIGlkIGBzdGFydGAsIGluIGFzY2VuZGluZyBpZCBvcmRlci4gUm91bmQgaWRzIGJlZ2luIGF0IDEsIHNvIGEKYHN0YXJ0YCBvZiAwIGlzIHRyZWF0ZWQgYXMgMS4gUmV0dXJucyBhbiBlbXB0eSBsaXN0IHBhc3QgdGhlIGVuZC4AAAAKZ2V0X3JvdW5kcwAAAAAAAgAAAAAAAAAFc3RhcnQAAAAAAAAGAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6gAAB9AAAAAFUm91bmQAAAA=",
        "AAAAAAAAAINKb2lucyByb3VuZC4gRm9yIGEgcHJpdmF0ZSByb3VuZCAoTEYtMTYyKSwgYGludml0ZV9jb2RlYCBtdXN0IGJlIGEKc3RyaW5nIHdob3NlIHNoYTI1NiBlcXVhbHMgdGhlIHJvdW5kJ3Mgc3RvcmVkIGBSb3VuZEludml0ZUhhc2hgLgAAAAAKam9pbl9yb3VuZAAAAAAAAwAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAAAAAAAC2ludml0ZV9jb2RlAAAAA+gAAAAQAAAAAA==",
        "AAAAAAAAAIJMZWF2ZXMgYSByb3VuZCB0aGF0IGhhc24ndCBzdGFydGVkIHlldCBhbmQgcmVmdW5kcyB0aGUgY2FsbGVyJ3Mgd2FnZXIuClRoZSByb3VuZCBhZG1pbiBjYW4ndCBsZWF2ZTsgdGhleSBjYW5jZWwgdGhlIHJvdW5kIGluc3RlYWQuAAAAAAALbGVhdmVfcm91bmQAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAAA",
        "AAAAAAAAAQlTb2Z0LXJlbW92ZXMgYSBjYXJkIChMRi0xNzYpOiBkcm9wcyBpdCBmcm9tIGV2ZXJ5IGluZGV4IGFuZCBmcm9tIGFsbApmdXR1cmUgZHJhd3MgYW5kIHZpZXdzLCBidXQga2VlcHMgdGhlIHN0b3JlZCBgQ2FyZGAgZW50cnkgc28gcm91bmRzCnRoYXQgYWxyZWFkeSBkcmV3IHRoZSBjYXJkIGNhbiBzdGlsbCByZWFkIGFuZCBncmFkZSBpdC4gVGhlIGlkIGlzCm5ldmVyIHJldXNlZDsgYGdldF9jYXJkYCByZXBvcnRzIGBOb25FeGlzdGluZ0NhcmRgIGFmdGVyd2FyZHMuAAAAAAAAC3JlbW92ZV9jYXJkAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAA==",
        "AAAAAAAAAA1TdGFydHMgcm91bmQuAAAAAAAAC3N0YXJ0X3JvdW5kAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAA==",
        "AAAAAAAAAXZSZXBsYWNlcyB0aGUgY29udGVudHMgb2YgYGNhcmRfaWRgLCBtb3ZpbmcgaXQgYmV0d2VlbiB0aGUgZ2VucmUsCmFydGlzdCBhbmQgeWVhciBpbmRleGVzIGFzIG5lZWRlZC4KCkxGLTE3NjogcmVqZWN0cyBjaGFuZ2VzIHRvIHRoZSBhbnN3ZXIgZmllbGRzICh0aXRsZSwgYXJ0aXN0LCB5ZWFyKQp3aGlsZSBhbiB1bmZpbmFsaXplZCByb3VuZCBzdGlsbCByZWZlcmVuY2VzIHRoZSBjYXJkLCBzbyBhbiBpbi1mbGlnaHQKcm91bmQgY2FuIG5ldmVyIGJlIHNjb3JlZCBhZ2FpbnN0IGVkaXRlZCBhbnN3ZXJzLiBHZW5yZSwgZGlmZmljdWx0eQphbmQgbHlyaWNzIGVkaXRzIHN0YXkgYWxsb3dlZDogdGhleSBkb24ndCBjaGFuZ2UgdGhlIGNvcnJlY3QgYW5zd2VyLgAAAAAAC3VwZGF0ZV9jYXJkAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAAAAAARjYXJkAAAH0AAAAARDYXJkAAAAAA==",
        "AAAAAAAAALpDYW5jZWxzIGEgcm91bmQgdGhhdCBoYXNuJ3Qgc3RhcnRlZCBhbmQgcmVmdW5kcyBldmVyeSBwbGF5ZXIuIENhbGxhYmxlCmJ5IHRoZSByb3VuZCBhZG1pbiBhdCBhbnkgdGltZSBiZWZvcmUgc3RhcnQsIG9yIGJ5IGFueW9uZSBvbmNlIHRoZQpsb2JieSBoYXMgYmVlbiBvcGVuIGZvciBgTE9CQllfVElNRU9VVF9TRUNPTkRTYC4AAAAAAAxjYW5jZWxfcm91bmQAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACHJvdW5kX2lkAAAABgAAAAA=",
        "AAAAAAAAAKhNaW50cyB0aGUgTkZUIGZvciBgbWlsZXN0b25lYCB0byBgY2FsbGVyYCB0aHJvdWdoIGEgY3Jvc3MtY29udHJhY3QKY2FsbC4gVGhpcyBjb250cmFjdCBtdXN0IGJlIHRoZSBORlQgY29udHJhY3QncyBtaW50ZXIuIEVhY2ggbWlsZXN0b25lCmNhbiBiZSBjbGFpbWVkIG9uY2UgcGVyIHBsYXllci4AAAAMY2xhaW1fcmV3YXJkAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAltaWxlc3RvbmUAAAAAAAfQAAAACU1pbGVzdG9uZQAAAAAAAAEAAAAK",
        "AAAAAAAAAINDcmVhdGVzIGEgcm91bmQuIGBpbnZpdGVfaGFzaGAgKExGLTE2MikgbWFrZXMgdGhlIHJvdW5kIHByaXZhdGU6IG9ubHkKYSBqb2luZXIgdGhhdCBwcmVzZW50cyBhIGNvZGUgd2hvc2Ugc2hhMjU2IG1hdGNoZXMgbWF5IGVudGVyLgAAAAAMY3JlYXRlX3JvdW5kAAAABAAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAVnZW5yZQAAAAAAA+gAAAfQAAAABUdlbnJlAAAAAAAAAAAAAARzZWVkAAAABgAAAAAAAAALaW52aXRlX2hhc2gAAAAD6AAAA+4AAAAgAAAAAQAAAAY=",
        "AAAAAAAAAPZMRi0xNDI6IHJldHVybnMgb25seSB0aGUgbHlyaWMsIGtpbmQgYW5kIG9wdGlvbnMgZm9yIHRoZSBjYWxsZXIncwpjdXJyZW50IGNhcmQgaW4gYHJvdW5kX2lkYCwgbmV2ZXIgdGhlIHRpdGxlL2FydGlzdC95ZWFyLiBSZXBsYWNlcwpgbmV4dF9jYXJkYCdzIG9sZCBgQ2FyZGAgcmV0dXJuIHNvIGEgbW9kaWZpZWQgY2xpZW50IGNhbm5vdCByZWFkIHRoZQphbnN3ZXIgZnJvbSB0aGUgY29udHJhY3QncyBvd24gcmV0dXJuIHZhbHVlcy4AAAAAAAxnZXRfcXVlc3Rpb24AAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACHJvdW5kX2lkAAAABgAAAAEAAAfQAAAADFF1ZXN0aW9uQ2FyZA==",
        "AAAAAAAAAF1Qb3J0ZWQgZnJvbSB0aGUgQ2Fpcm8gYCNbY29uc3RydWN0b3JdYDogc2V0cyB0aGUgb3duZXIgYW5kIGdyYW50cyB0aGVtCnRoZSAob25seSkgYWRtaW4gcm9sZS4AAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAA=",
        "AAAAAAAAABpSZXR1cm5zIHRoZSBwZW5kaW5nIG93bmVyLgAAAAAADXBlbmRpbmdfb3duZXIAAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAABdTdWJtaXRzIGEgcm91bmQgYW5zd2VyLgAAAAANc3VibWl0X2Fuc3dlcgAAAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAAAAAAZhbnN3ZXIAAAAAB9AAAAAGQW5zd2VyAAAAAAABAAAAAQ==",
        "AAAAAAAAABJGaW5hbGl6ZXMgYSByb3VuZC4AAAAAAA5maW5hbGl6ZV9yb3VuZAAAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAAA",
        "AAAAAAAAAFhSZXR1cm5zIHRoZSBzdG9yZWQgc3RvcmFnZSBzY2hlbWEgdmVyc2lvbi4gVW5taWdyYXRlZCAvIGxlZ2FjeSBkZXBsb3ltZW50cyBkZWZhdWx0IHRvIDEuAAAADnNjaGVtYV92ZXJzaW9uAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAPYW5zd2VyX2FuZF9uZXh0AAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAAAAAAZjaG9pY2UAAAAAB9AAAAAGQW5zd2VyAAAAAAABAAAH0AAAAAxBbnN3ZXJSZXN1bHQ=",
        "AAAAAAAAAC1OdW1iZXIgb2YgbGl2ZSAoYWRkZWQgYW5kIG5vdCByZW1vdmVkKSBjYXJkcy4AAAAAAAAPZ2V0X2NhcmRzX2NvdW50AAAAAAAAAAABAAAABg==",
        "AAAAAAAAABhSZXR1cm5zIHRoZSBtYXggcGxheWVycy4AAAAPZ2V0X21heF9wbGF5ZXJzAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAKFJZHMgb2Ygcm91bmRzIHRoYXQgYXJlIGNyZWF0ZWQgYnV0IG5vdCB5ZXQgc3RhcnRlZCAoaS5lLiBqb2luYWJsZSksCm9sZGVzdCBmaXJzdC4gYHN0YXJ0YCBpcyBhbiBvZmZzZXQgaW50byB0aGF0IGxpc3QgYW5kIGBsaW1pdGAgaXMKY2xhbXBlZCB0byBgTUFYX1BBR0VfTElNSVRgLgAAAAAAAA9nZXRfb3Blbl9yb3VuZHMAAAAAAgAAAAAAAAAFc3RhcnQAAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6gAAAAY=",
        "AAAAAAAAABhSZXR1cm5zIHRoZSBwbGF5ZXIgc3RhdC4AAAAPZ2V0X3BsYXllcl9zdGF0AAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAfQAAAAC1BsYXllclN0YXRzAA==",
        "AAAAAAAAAOdSZXR1cm5zIHRoZSByb3VuZCBjYXJkcy4KCkxGLTE0Mjogd2hpbGUgYSByb3VuZCBpcyBhY3RpdmUgKHN0YXJ0ZWQgYW5kIG5vdCBmaW5hbGl6ZWQpLCBvbmx5IGFuCmFkbWluIG1heSByZWFkIHRoZSBjYXJkIGlkcywgc28gYSBtb2RpZmllZCBjbGllbnQgY2Fubm90IGxvb2sgdXAgdGhlCmFuc3dlcnMgYWhlYWQgb2YgdGltZS4gQWZ0ZXIgZmluYWxpemF0aW9uIHRoZSBsaXN0IGlzIHB1YmxpYyBhZ2Fpbi4AAAAAD2dldF9yb3VuZF9jYXJkcwAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACHJvdW5kX2lkAAAABgAAAAEAAAPqAAAABg==",
        "AAAAAAAAABhSZXR1cm5zIHRoZSByb3VuZCBjb3VudC4AAAAPZ2V0X3JvdW5kX2NvdW50AAAAAAAAAAABAAAABg==",
        "AAAAAAAAABVTZXRzIHRoZSBtYXggcGxheWVycy4AAAAAAAAPc2V0X21heF9wbGF5ZXJzAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAFdmFsdWUAAAAAAAAEAAAAAA==",
        "AAAAAAAAAHpDb21wbGV0ZXMgYW4gb3duZXJzaGlwIHRyYW5zZmVyIGFuZCBncmFudHMgdGhlIG5ldyBvd25lciB0aGUgYWRtaW4Kcm9sZS4gVGhlIHByZXZpb3VzIG93bmVyIGtlZXBzIGFueSBhZG1pbiByb2xlIHRoZXkgaGFkLgAAAAAAEGFjY2VwdF9vd25lcnNoaXAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA",
        "AAAAAAAAABlSZXR1cm5zIHRoZSBuZnQgY29udHJhY3QuAAAAAAAAEGdldF9uZnRfY29udHJhY3QAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAHRSZXR1cm5zIHRoZSBvd25lci1jb25maWd1cmVkIHBlci1jYXJkIGxhdGVuY3kgYnVmZmVyIGluIHNlY29uZHMsCmRlZmF1bHRpbmcgdG8gYERFRkFVTFRfUk9VTkRfQlVGRkVSX1NFQ09ORFNgICgxMHMpLgAAABBnZXRfcm91bmRfYnVmZmVyAAAAAAAAAAEAAAAG",
        "AAAAAAAAABlSZXR1cm5zIHRoZSByb3VuZCBzY29yZXMuAAAAAAAAEGdldF9yb3VuZF9zY29yZXMAAAABAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAD7AAAABMAAAAG",
        "AAAAAAAAABZTZXRzIHRoZSBuZnQgY29udHJhY3QuAAAAAAAQc2V0X25mdF9jb250cmFjdAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAMbmZ0X2NvbnRyYWN0AAAAEwAAAAA=",
        "AAAAAAAAAFVTZXRzIHRoZSBsYXRlbmN5IGJ1ZmZlciBhZGRlZCBwZXIgY2FyZCAoaW4gc2Vjb25kcykgZm9yIGR5bmFtaWMgZGVhZGxpbmUgY2FsY3VsYXRpb24uAAAAAAAAEHNldF9yb3VuZF9idWZmZXIAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABXZhbHVlAAAAAAAABgAAAAA=",
        "AAAAAAAAAUJMRi0xNjM6IGNyZWF0ZSBhbmQgc3RhcnQgYSBzb2xvIHJvdW5kIGluIG9uZSBjYWxsLCByZXR1cm4gdGhlIGZpcnN0CnF1ZXN0aW9uLiBTa2lwcGVkIGZyb20gT3BlblJvdW5kcyBzbyBpdCBuZXZlciBhcHBlYXJzIGluIHRoZQptdWx0aXBsYXllciBsb2JieS4gRXhhY3RseSBPTkUgcmVxdWlyZV9hdXRoOiBjcmVhdGVfcm91bmRfaW50ZXJuYWwKcGVyZm9ybXMgaXQsIHNvIHdlIGRvIG5vdCBjYWxsIGl0IGFnYWluIGhlcmUsIGFuZCB0aGUgZmlyc3QgY2FyZCBpcwpkcmF3biBpbmxpbmUgKG5leHRfY2FyZCB3b3VsZCByZXF1aXJlX2F1dGggYSBzZWNvbmQgdGltZSkuAAAAAAARY3JlYXRlX3NvbG9fcm91bmQAAAAAAAADAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABWdlbnJlAAAAAAAD6AAAB9AAAAAFR2VucmUAAAAAAAAAAAAABHNlZWQAAAAGAAAAAQAAB9AAAAAMUXVlc3Rpb25DYXJk",
        "AAAAAAAAAGhSZXR1cm5zIHRoZSBvd25lci1jb25maWd1cmVkIGFuc3dlciB3aW5kb3cgaW4gc2Vjb25kcywgZGVmYXVsdGluZyB0bwpgQ0FSRF9BTlNXRVJfV0lORE9XX1NFQ09ORFNgICgxNXMpLgAAABFnZXRfYW5zd2VyX3dpbmRvdwAAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAGRSZXR1cm5zIHRoZSBvd25lci1jb25maWd1cmVkIGxvYmJ5IHRpbWVvdXQgaW4gc2Vjb25kcywgZGVmYXVsdGluZyB0bwpgTE9CQllfVElNRU9VVF9TRUNPTkRTYCAoNjAwcykuAAAAEWdldF9sb2JieV90aW1lb3V0AAAAAAAAAAAAAAEAAAAG",
        "AAAAAAAAABpSZXR1cm5zIHRoZSByb3VuZCBwbGF5ZXJzLgAAAAAAEWdldF9yb3VuZF9wbGF5ZXJzAAAAAAAAAQAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAQAAA+oAAAAT",
        "AAAAAAAAACJTZXRzIHRoZSBhbnN3ZXIgd2luZG93IGluIHNlY29uZHMuAAAAAAARc2V0X2Fuc3dlcl93aW5kb3cAAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABXZhbHVlAAAAAAAABgAAAAA=",
        "AAAAAAAAACJTZXRzIHRoZSBsb2JieSB0aW1lb3V0IGluIHNlY29uZHMuAAAAAAARc2V0X2xvYmJ5X3RpbWVvdXQAAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABXZhbHVlAAAAAAAABgAAAAA=",
        "AAAAAAAAABtSZXR1cm5zIHRoZSBjYXJkcyBvZiBnZW5yZS4AAAAAEmdldF9jYXJkc19vZl9nZW5yZQAAAAAAAgAAAAAAAAAFZ2VucmUAAAAAAAfQAAAABUdlbnJlAAAAAAAAAAAAAARzZWVkAAAABgAAAAEAAAPqAAAH0AAAAARDYXJk",
        "AAAAAAAAAHlSZXR1cm5zIHRoZSBvd25lci1jb25maWd1cmVkIGZpeGVkIHJvdW5kIGR1cmF0aW9uIG92ZXJyaWRlIGluIHNlY29uZHMsCm9yIGBOb25lYCBpZiBkeW5hbWljIGRlYWRsaW5lIGNhbGN1bGF0aW9uIGlzIHVzZWQuAAAAAAAAEmdldF9yb3VuZF9kdXJhdGlvbgAAAAAAAAAAAAEAAAPoAAAABg==",
        "AAAAAAAAALRTZXRzIGFuIG9wdGlvbmFsIGZpeGVkIHJvdW5kIGR1cmF0aW9uIGluIHNlY29uZHMuIFBhc3NpbmcgYE5vbmVgIG9yIGBTb21lKDApYApyZXNldHMgdGhlIGNvbnRyYWN0IHRvIHVzZSBkeW5hbWljIGRlYWRsaW5lIGNhbGN1bGF0aW9uOgpgY2FyZHNfcGVyX3JvdW5kICogKGFuc3dlcl93aW5kb3cgKyBidWZmZXIpYC4AAAASc2V0X3JvdW5kX2R1cmF0aW9uAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABXZhbHVlAAAAAAAD6AAAAAYAAAAA",
        "AAAAAAAAAHtTdGVwIG9uZSBvZiBhbiBvd25lcnNoaXAgdHJhbnNmZXI7IGBuZXdfb3duZXJgIG11c3QgdGhlbiBjYWxsCmBhY2NlcHRfb3duZXJzaGlwYC4gQ2FsbGluZyBhZ2FpbiByZXBsYWNlcyB0aGUgcGVuZGluZyBvd25lci4AAAAAEnRyYW5zZmVyX293bmVyc2hpcAAAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAA==",
        "AAAAAAAAABdCdWlsZHMgYSBxdWVzdGlvbiBjYXJkLgAAAAATYnVpbGRfcXVlc3Rpb25fY2FyZAAAAAADAAAAAAAAAARjYXJkAAAH0AAAAARDYXJkAAAAAAAAAARzZWVkAAAABgAAAAAAAAAEa2luZAAAB9AAAAAMUXVlc3Rpb25LaW5kAAAAAQAAB9AAAAAMUXVlc3Rpb25DYXJk",
        "AAAAAAAAABxSZXR1cm5zIHRoZSBjYXJkcyBvZiBhIHllYXIuAAAAE2dldF9jYXJkc19vZl9hX3llYXIAAAAAAgAAAAAAAAAEeWVhcgAAAAYAAAAAAAAABHNlZWQAAAAGAAAAAQAAA+oAAAfQAAAABENhcmQ=",
        "AAAAAAAAABxSZXR1cm5zIHRoZSBjYXJkcyBvZiBhcnRpc3QuAAAAE2dldF9jYXJkc19vZl9hcnRpc3QAAAAAAgAAAAAAAAAGYXJ0aXN0AAAAAAAQAAAAAAAAAARzZWVkAAAABgAAAAEAAAPqAAAH0AAAAARDYXJk",
        "AAAAAAAAABxSZXR1cm5zIHRoZSBjYXJkcyBwZXIgcm91bmQuAAAAE2dldF9jYXJkc19wZXJfcm91bmQAAAAAAAAAAAEAAAAE",
        "AAAAAAAAABlTZXRzIHRoZSBjYXJkcyBwZXIgcm91bmQuAAAAAAAAE3NldF9jYXJkc19wZXJfcm91bmQAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAV2YWx1ZQAAAAAAAAQAAAAA",
        "AAAAAAAAAB1SZXR1cm5zIHRoZSBnZW5yZSBjYXJkIGNvdW50LgAAAAAAABRnZXRfZ2VucmVfY2FyZF9jb3VudAAAAAEAAAAAAAAABWdlbnJlAAAAAAAH0AAAAAVHZW5yZQAAAAAAAAEAAAAE",
        "AAAAAAAAACJSZXR1cm5zIHdoZXRoZXIgbWlsZXN0b25lIGNsYWltZWQuAAAAAAAUaXNfbWlsZXN0b25lX2NsYWltZWQAAAACAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAACW1pbGVzdG9uZQAAAAAAB9AAAAAJTWlsZXN0b25lAAAAAAAAAQAAAAE=",
        "AAAAAAAAAUxPd25lci1vbmx5IGJhdGNoIG1pZ3JhdGlvbiBmb3IgbGVnYWN5IGFkbWluIGtleXMgdGhhdCBjYW5ub3QgYmUKZW51bWVyYXRlZCBmcm9tIGluc3RhbmNlIHN0b3JhZ2UuIFBhc3MgY2FuZGlkYXRlIGFkZHJlc3NlcyBmcm9tIHRoZQpjb250cmFjdCdzIGhpc3RvcmljYWwgYFJvbGVVcGRhdGVkYCBldmVudHM7IHVzZSBtdWx0aXBsZSBjYWxscyBmb3IKbGFyZ2UgaGlzdG9yaWVzLiBBY3RpdmUgbGVnYWN5IGdyYW50cyBhcmUgbW92ZWQgdG8gcGVyc2lzdGVudCBzdG9yYWdlCmFuZCB0aGUgYWRtaW4gaW5kZXgsIHdoaWxlIGxlZ2FjeSBmYWxzZSB0b21ic3RvbmVzIGFyZSBkZWxldGVkLgAAABVtaWdyYXRlX2xlZ2FjeV9hZG1pbnMAAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACmNhbmRpZGF0ZXMAAAAAA+oAAAATAAAAAA==",
        "AAAAAAAAACBSZXR1cm5zIHRoZSBwbGF5ZXJzIHJvdW5kIGNvdW50LgAAABdnZXRfcGxheWVyc19yb3VuZF9jb3VudAAAAAABAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAABA==",
        "AAAAAAAAAERDcmVhdGVzIGEgcm91bmQgdXNpbmcgb3B0aW9uYWwgZ2VucmUsIGRlY2FkZSBhbmQgZGlmZmljdWx0eSBmaWx0ZXJzLgAAABhjcmVhdGVfcm91bmRfd2l0aF9maWx0ZXIAAAAEAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAABmZpbHRlcgAAAAAH0AAAAAtSb3VuZEZpbHRlcgAAAAAAAAAACmRpZmZpY3VsdHkAAAAAA+gAAAAEAAAAAAAAAARzZWVkAAAABgAAAAEAAAAG",
        "AAAAAQAAAKxQb3J0ZWQgZnJvbSBgb25jaGFpbi9zcmMvdXRpbHMvdHlwZXMuY2Fpcm9gLiBgZmVsdDI1MmAvYEJ5dGVBcnJheWAgZmllbGRzCmJlY29tZSBgU3RyaW5nYDsgU3RhcmtuZXQncyBgdThgIGZpZWxkcyBiZWNvbWUgYHUzMmAgc2luY2UgU29yb2JhbiBoYXMgbm8KbmF0aXZlIHU4IGNvbnRyYWN0IHR5cGUuAAAAAAAAAARDYXJkAAAABwAAAAAAAAAGYXJ0aXN0AAAAAAAQAAAAAAAAAAdjYXJkX2lkAAAAAAYAAAAAAAAACmRpZmZpY3VsdHkAAAAAAAQAAAAAAAAABWdlbnJlAAAAAAAH0AAAAAVHZW5yZQAAAAAAAAAAAAAGbHlyaWNzAAAAAAAQAAAAAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAABHllYXIAAAAG",
        "AAAAAwAAAMVNaXJyb3JzIENhaXJvJ3Mgc2luZ2xlIGBBRE1JTl9ST0xFYCBzZWxlY3Rvci4gS2VwdCBhcyBhbiBlbnVtIChpbnN0ZWFkIG9mCmRyb3BwaW5nIHRoZSBwYXJhbWV0ZXIgZW50aXJlbHkpIHNvIGBzZXRfcm9sZWAvYGlzX2FkbWluYCBrZWVwIHRoZSBzYW1lCmNhbGwgc2hhcGUgYXMgdGhlIG9yaWdpbmFsIGBJTHlyaWNzRmxpcGAgaW50ZXJmYWNlLgAAAAAAAAAAAAAEUm9sZQAAAAEAAAAAAAAABUFkbWluAAAAAAAAAA==",
        "AAAAAwAAAVRFeHBsaWNpdCBkaXNjcmltaW5hbnRzIG1ha2UgdGhpcyBhICJzaW1wbGUiIGNvbnRyYWN0dHlwZSBlbnVtLCB3aGljaApzb3JvYmFuLXNkayBlbmNvZGVzIGFzIGEgcGxhaW4gYHUzMmAgKGFuZCB0aGUgSlMgU0RLIGRlY29kZXMgdG8gYSBwbGFpbgpgbnVtYmVyYCkgcmF0aGVyIHRoYW4gdGhlIGB7dGFnLCB2YWx1ZXN9YCBzaGFwZSB1c2VkIGZvciBlbnVtcyB3aXRoCmFzc29jaWF0ZWQgZGF0YSAoc2VlIGBBbnN3ZXJgIGJlbG93KS4gS2VlcCBgZnJvbnRlbmQvc3JjL2xpYi9zdGVsbGFyL3R5cGVzLnRzYCdzCmBHRU5SRV9WQUxVRVNgIG9yZGVyaW5nIGluIHN5bmMgd2l0aCB0aGVzZSB2YWx1ZXMuAAAAAAAAAAVHZW5yZQAAAAAAAA0AAAAAAAAABkhpcEhvcAAAAAAAAAAAAAAAAAADUG9wAAAAAAEAAAAAAAAABFJvY2sAAAACAAAAAAAAAANSbkIAAAAAAwAAAAAAAAAKRWxlY3Ryb25pYwAAAAAABAAAAAAAAAAJQ2xhc3NpY2FsAAAAAAAABQAAAAAAAAAESmF6egAAAAYAAAAAAAAAB0NvdW50cnkAAAAABwAAAAAAAAAFQmx1ZXMAAAAAAAAIAAAAAAAAAAZSZWdnYWUAAAAAAAkAAAAAAAAACEFmcm9iZWF0AAAACgAAAAAAAAAGR29zcGVsAAAAAAALAAAAAAAAAARGb2xrAAAADA==",
        "AAAAAQAAAAAAAAAAAAAABVJvdW5kAAAAAAAADwAAAAAAAAAFYWRtaW4AAAAAAAATAAAANUxGLTE1ODogU25hcHNob3R0ZWQgYW5zd2VyIHdpbmRvdyAoc2Vjb25kcyBwZXIgY2FyZCkuAAAAAAAADWFuc3dlcl93aW5kb3cAAAAAAAAGAAAAAAAAAAhlbmRfdGltZQAAAAYAAAAAAAAABWdlbnJlAAAAAAAH0AAAAAVHZW5yZQAAAAAAAAAAAAAMaXNfY2FuY2VsbGVkAAAAAQAAAAAAAAAMaXNfY29tcGxldGVkAAAAAQAAADxMRi0xNjI6IHRydWUgd2hlbiB0aGUgcm91bmQgcmVxdWlyZXMgYW4gaW52aXRlIGNvZGUgdG8gam9pbi4AAAAKaXNfcHJpdmF0ZQAAAAAAAQAAAAAAAAAKaXNfc3RhcnRlZAAAAAAAAQAAAEhMRi0xNTg6IFNuYXBzaG90dGVkIGxvYmJ5IHRpbWVvdXQgKHNlY29uZHMgYmVmb3JlIG5vbi1hZG1pbiBjYW4gY2FuY2VsKS4AAAANbG9iYnlfdGltZW91dAAAAAAAAAYAAAAAAAAAD25leHRfY2FyZF9pbmRleAAAAAAEAAAARExGLTE1ODogU25hcHNob3R0ZWQgcm91bmQgZHVyYXRpb24gKHNlY29uZHMgZnJvbSBzdGFydCB0byBkZWFkbGluZSkuAAAADnJvdW5kX2R1cmF0aW9uAAAAAAAGAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAA/TEYtMTYzOiBzb2xvIHJvdW5kcyBza2lwIE9wZW5Sb3VuZHMgYW5kIHN0YXJ0IGluIHRoZSBzYW1lIGNhbGwuAAAAAARzb2xvAAAAAQAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAMd2FnZXJfYW1vdW50AAAACw==",
        "AAAAAgAAAAAAAAAAAAAABkFuc3dlcgAAAAAAAwAAAAEAAAAAAAAABkFydGlzdAAAAAAAAQAAABAAAAABAAAAAAAAAARZZWFyAAAAAQAAAAYAAAABAAAAAAAAAAVUaXRsZQAAAAAAAAEAAAAQ",
        "AAAAAQAAAEFQb3NpdGlvbiBvZiBhIGNhcmQgaW4gdGhlIGdsb2JhbCwgZ2VucmUsIGFydGlzdCBhbmQgeWVhciBpbmRleGVzLgAAAAAAAAAAAAAHQ2FyZFBvcwAAAAAEAAAAAAAAAANhbGwAAAAABAAAAAAAAAAGYXJ0aXN0AAAAAAAEAAAAAAAAAAVnZW5yZQAAAAAAAAQAAAAAAAAABHllYXIAAAAE",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAALgAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAD5Ob21pbmF0ZWQgYnkgYHRyYW5zZmVyX293bmVyc2hpcGAsIHBlbmRpbmcgYGFjY2VwdF9vd25lcnNoaXBgLgAAAAAADFBlbmRpbmdPd25lcgAAAAEAAAAAAAAABUFkbWluAAAAAAAAAQAAABMAAAAAAAAAOEVudW1lcmFibGUgaW5kZXggb2YgYWxsIGFjdGl2ZSBhZG1pbiBhZGRyZXNzZXMgKExGLTE1NikuAAAABkFkbWlucwAAAAAAAAAAAAAAAAAKUm91bmRDb3VudAAAAAAAAAAAAAAAAAAKQ2FyZHNDb3VudAAAAAAAAAAAAAAAAAANQ2FyZHNQZXJSb3VuZAAAAAAAAAEAAAAAAAAABENhcmQAAAABAAAABgAAAAAAAACDTGFzdCBjYXJkIGlkIGhhbmRlZCBvdXQuIElkcyBhcmUgbmV2ZXIgcmV1c2VkLCBzbyB0aGlzIGRpZmZlcnMgZnJvbQpgQ2FyZHNDb3VudGAgKHRoZSBudW1iZXIgb2YgbGl2ZSBjYXJkcykgb25jZSBjYXJkcyBhcmUgcmVtb3ZlZC4AAAAACkxhc3RDYXJkSWQAAAAAAAEAAABAc2hhMjU2KHRpdGxlLCAweDAwLCBhcnRpc3QpIC0+IGNhcmQgaWQuIFJlamVjdHMgZHVwbGljYXRlIGNhcmRzLgAAAAdDYXJkS2V5AAAAAAEAAAPuAAAAIAAAAAEAAABGV2hlcmUgYSBjYXJkIHNpdHMgaW4gZWFjaCBvZiB0aGUgaW5kZXggbGlzdHMgYmVsb3cgKGZvciBPKDEpIHJlbW92YWwpLgAAAAAAB0NhcmRQb3MAAAAAAQAAAAYAAAABAAAAgEluZGV4ZXMgYXJlIHN0b3JlZCBhcyBhIGNvdW50IHBsdXMgb25lIGVudHJ5IHBlciBpdGVtLCBzbyBhZGRpbmcgYQpjYXJkIGNvc3RzIHRoZSBzYW1lIG5vIG1hdHRlciBob3cgbGFyZ2UgdGhlIGluZGV4IGFscmVhZHkgaXMuAAAABkNhcmRBdAAAAAAAAQAAAAQAAAABAAAAAAAAAA5HZW5yZUNhcmRDb3VudAAAAAAAAQAAB9AAAAAFR2VucmUAAAAAAAABAAAAAAAAAAtHZW5yZUNhcmRBdAAAAAABAAAD7QAAAAIAAAfQAAAABUdlbnJlAAAAAAAABAAAAAEAAAAAAAAAD0FydGlzdENhcmRDb3VudAAAAAABAAAAEAAAAAEAAAAAAAAADEFydGlzdENhcmRBdAAAAAEAAAPtAAAAAgAAABAAAAAEAAAAAQAAAAAAAAANWWVhckNhcmRDb3VudAAAAAAAAAEAAAAGAAAAAQAAAAAAAAAKWWVhckNhcmRBdAAAAAAAAQAAA+0AAAACAAAABgAAAAQAAAABAAAAAAAAAAVSb3VuZAAAAAAAAAEAAAAGAAAAAQAAAAAAAAAMUm91bmRQbGF5ZXJzAAAAAQAAAAYAAAABAAAAAAAAAApSb3VuZENhcmRzAAAAAAABAAAABgAAAAEAAAAAAAAAC1JvdW5kU2NvcmVzAAAAAAEAAAAGAAAAAQAAAAAAAAAQUm91bmRBbnN3ZXJUaW1lcwAAAAEAAAAGAAAAAQAAAAAAAAASUm91bmRDYXJkU3RhcnRlZEF0AAAAAAABAAAD7QAAAAIAAAAGAAAABgAAAAEAAAAAAAAAE1JvdW5kUGxheWVyQW5zd2VyZWQAAAAAAQAAA+0AAAADAAAABgAAABMAAAAGAAAAAQAAAAAAAAAOUm91bmRGaW5hbGl6ZWQAAAAAAAEAAAAGAAAAAQAAAEJMRi0xNjI6IHByZWltYWdlIGhhc2ggZm9yIHByaXZhdGUgcm91bmRzLiBQcmVzZW50IG9ubHkgaWYgcHJpdmF0ZS4AAAAAAA9Sb3VuZEludml0ZUhhc2gAAAAAAQAAAAYAAAABAAAAAAAAAAtQbGF5ZXJTdGF0cwAAAAABAAAAEwAAAAEAAAAAAAAAClJvdW5kUmVhZHkAAAAAAAEAAAPtAAAAAgAAAAYAAAATAAAAAQAAAAAAAAAPUm91bmRSZWFkeUNvdW50AAAAAAEAAAAGAAAAAAAAAIJJZHMgb2Ygcm91bmRzIHRoYXQgaGF2ZSBiZWVuIGNyZWF0ZWQgYnV0IG5vdCB5ZXQgc3RhcnRlZCwgaW4gY3JlYXRpb24Kb3JkZXIuIEJhY2tzIHRoZSBtdWx0aXBsYXllciBsb2JieSdzIGBnZXRfb3Blbl9yb3VuZHNgIHZpZXcuAAAAAAAKT3BlblJvdW5kcwAAAAAAAAAAADVHbG9iYWwgY2FwIG9uIHBsYXllcnMgcGVyIHJvdW5kIChvd25lci1jb25maWd1cmFibGUpLgAAAAAAAApNYXhQbGF5ZXJzAAAAAAABAAAASExlZGdlciB0aW1lc3RhbXAgYXQgd2hpY2ggYSByb3VuZCB3YXMgY3JlYXRlZDsgZHJpdmVzIHRoZSBsb2JieSB0aW1lb3V0LgAAAA5Sb3VuZENyZWF0ZWRBdAAAAAAAAQAAAAYAAAAAAAAAPkFkZHJlc3Mgb2YgdGhlIGBseXJpY3NmbGlwLW5mdGAgY29udHJhY3QgdXNlZCB0byBtaW50IHJld2FyZHMuAAAAAAALTmZ0Q29udHJhY3QAAAAAAQAAADhXaGV0aGVyIGEgcGxheWVyIGhhcyBhbHJlYWR5IGNsYWltZWQgYSBtaWxlc3RvbmUgcmV3YXJkLgAAABBNaWxlc3RvbmVDbGFpbWVkAAAAAQAAA+0AAAACAAAAEwAAB9AAAAAJTWlsZXN0b25lAAAAAAAAAAAAAIBHbG9iYWwgZW1lcmdlbmN5LXBhdXNlIGZsYWcuIFdoaWxlIHNldCwgcm91bmQgY3JlYXRpb24vam9pbmluZyBhbmQKcmV3YXJkIGNsYWltcyBhcmUgYmxvY2tlZDsgcmVmdW5kIGFuZCBjYW5jZWwgcGF0aHMgc3RheSBvcGVuLgAAAAZQYXVzZWQAAAAAAAEAAAA6TEYtMTQxOiBUcmFja3MgdGhlIG5leHQgY2FyZCBpbmRleCBwZXItcGxheWVyIGZvciBhIHJvdW5kLgAAAAAAD1BsYXllckNhcmRJbmRleAAAAAABAAAD7QAAAAIAAAAGAAAAEwAAAAEAAAA+TEYtMTQxOiBMZWRnZXIgdGltZXN0YW1wIHdoZW4gYSBwbGF5ZXIgZHJldyBhIGNhcmQgaW4gYSByb3VuZC4AAAAAABNQbGF5ZXJDYXJkU3RhcnRlZEF0AAAAAAEAAAPtAAAAAwAAAAYAAAATAAAABgAAAAAAAAA6TEYtMTU3OiBTdG9yZWQgc3RvcmFnZSBzY2hlbWEgdmVyc2lvbiBmb3IgbWlncmF0aW9uIGhvb2tzLgAAAAAADVNjaGVtYVZlcnNpb24AAAAAAAAAAAAAO0xGLTE1ODogT3duZXItY29uZmlndXJlZCBhbnN3ZXIgd2luZG93IGluIHNlY29uZHMgcGVyIGNhcmQuAAAAAAxBbnN3ZXJXaW5kb3cAAAAAAAAAMkxGLTE1ODogT3duZXItY29uZmlndXJlZCBsb2JieSB0aW1lb3V0IGluIHNlY29uZHMuAAAAAAAMTG9iYnlUaW1lb3V0AAAAAAAAAFRMRi0xNTg6IE93bmVyLWNvbmZpZ3VyZWQgcm91bmQgZHVyYXRpb24gb3ZlcnJpZGUgaW4gc2Vjb25kcyAob3IgTm9uZS8wIGZvciBkeW5hbWljKS4AAAANUm91bmREdXJhdGlvbgAAAAAAAAAAAABCTEYtMTU4OiBPd25lci1jb25maWd1cmVkIGxhdGVuY3kgYnVmZmVyIGFkZGVkIHBlciBjYXJkIGluIHNlY29uZHMuAAAAAAALUm91bmRCdWZmZXIAAAAAAQAAAMtMRi0xNzY6IHNldCAodHJ1ZSkgd2hlbiBhIGNhcmQgaXMgcmVtb3ZlZC4gVGhlIGBDYXJkYCBlbnRyeSBpcyBrZXB0IHNvCnJvdW5kcyB0aGF0IGFscmVhZHkgZHJldyB0aGUgY2FyZCBjYW4gc3RpbGwgcmVhZCBhbmQgZ3JhZGUgaXQ7IHRoZQpmbGFnIGV4Y2x1ZGVzIHRoZSBjYXJkIGZyb20gYGdldF9jYXJkYCBhbmQgZnJvbSBhbGwgZnV0dXJlIGRyYXdzLgAAAAAMQ2FyZERpc2FibGVkAAAAAQAAAAYAAAABAAAAsUxGLTE3NjogaWRzIG9mIHJvdW5kcyB3aG9zZSBgUm91bmRDYXJkc2AgY3VycmVudGx5IHJlZmVyZW5jZSBhIGNhcmQKYW5kIHRoYXQgaGF2ZSBub3QgYmVlbiBmaW5hbGl6ZWQgb3IgY2FuY2VsbGVkLiBHdWFyZHMgYHVwZGF0ZV9jYXJkYAphZ2FpbnN0IGNoYW5naW5nIGFuc3dlciBmaWVsZHMgbWlkLXJvdW5kLgAAAAAAAA5DYXJkTGl2ZVJvdW5kcwAAAAAAAQAAAAYAAAABAAAAuUxGLTE3NTogbnVtYmVyIG9mIHB1YmxpYyBsb2JieSByb3VuZHMgYW4gYWRkcmVzcyBjdXJyZW50bHkgaGFzIG9wZW4uCkNhcHMgaG93IG1hbnkgZnJlZSAoMC13YWdlcikgbG9iYmllcyBvbmUgYWNjb3VudCBjYW4gcGFyayBpbgpgT3BlblJvdW5kc2A7IGRlY3JlbWVudGVkIG9uIHN0YXJ0LCBjYW5jZWwsIGFuZCBleHBpcnkuAAAAAAAADE9wZW5Sb3VuZHNPZgAAAAEAAAAT",
        "AAAAAQAAAI5TY2hlbWEgdjMgcm91bmQgbGF5b3V0IChwcmUgTEYtMTYyLzE2Myk6IGBSb3VuZGAgd2l0aG91dCBgaXNfcHJpdmF0ZWAgYW5kCmBzb2xvYC4gYHJlYWRfcm91bmRgIGxhemlseSByZS1lbmNvZGVzIHN0b3JlZCB2MyBlbnRyaWVzIGFzIGBSb3VuZGAuAAAAAAAAAAAAB1JvdW5kVjMAAAAADQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA1hbnN3ZXJfd2luZG93AAAAAAAABgAAAAAAAAAIZW5kX3RpbWUAAAAGAAAAAAAAAAVnZW5yZQAAAAAAB9AAAAAFR2VucmUAAAAAAAAAAAAADGlzX2NhbmNlbGxlZAAAAAEAAAAAAAAADGlzX2NvbXBsZXRlZAAAAAEAAAAAAAAACmlzX3N0YXJ0ZWQAAAAAAAEAAAAAAAAADWxvYmJ5X3RpbWVvdXQAAAAAAAAGAAAAAAAAAA9uZXh0X2NhcmRfaW5kZXgAAAAABAAAAAAAAAAOcm91bmRfZHVyYXRpb24AAAAAAAYAAAAAAAAACHJvdW5kX2lkAAAABgAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAMd2FnZXJfYW1vdW50AAAACw==",
        "AAAAAwAAAEZORlQgcmV3YXJkIG1pbGVzdG9uZXMgYSBwbGF5ZXIgY2FuIGNsYWltIG9uY2UgZWFjaCB2aWEgYGNsYWltX3Jld2FyZGAuAAAAAAAAAAAACU1pbGVzdG9uZQAAAAAAAAMAAAAXQXQgbGVhc3Qgb25lIHJvdW5kIHdvbi4AAAAACEZpcnN0V2luAAAAAAAAACdBIHN0cmVhayBvZiBhdCBsZWFzdCA1IGNvcnJlY3QgYW5zd2Vycy4AAAAAB1N0cmVhazUAAAAAAQAAABdBdCBsZWFzdCAxMCByb3VuZHMgd29uLgAAAAAHVGVuV2lucwAAAAAC",
        "AAAAAQAAAAAAAAAAAAAACkxlZ2FjeUNhcmQAAAAAAAYAAAAAAAAABmFydGlzdAAAAAAAEAAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAAAAAAVnZW5yZQAAAAAAB9AAAAAFR2VucmUAAAAAAAAAAAAABmx5cmljcwAAAAAAEAAAAAAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAR5ZWFyAAAABg==",
        "AAAAAQAAAAAAAAAAAAAAC0xlZ2FjeVJvdW5kAAAAAAoAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIZW5kX3RpbWUAAAAGAAAAAAAAAAVnZW5yZQAAAAAAB9AAAAAFR2VucmUAAAAAAAAAAAAADGlzX2NhbmNlbGxlZAAAAAEAAAAAAAAADGlzX2NvbXBsZXRlZAAAAAEAAAAAAAAACmlzX3N0YXJ0ZWQAAAAAAAEAAAAAAAAAD25leHRfY2FyZF9pbmRleAAAAAAEAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAADHdhZ2VyX2Ftb3VudAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAAC1BsYXllclN0YXRzAAAAAAQAAAAAAAAADmN1cnJlbnRfc3RyZWFrAAAAAAAGAAAAAAAAAAptYXhfc3RyZWFrAAAAAAAGAAAAAAAAAApyb3VuZHNfd29uAAAAAAAGAAAAAAAAAAx0b3RhbF9yb3VuZHMAAAAG",
        "AAAAAQAAAAAAAAAAAAAADEFuc3dlclJlc3VsdAAAAAQAAAAAAAAAB2NvcnJlY3QAAAAAAQAAAAAAAAAOY29ycmVjdF9vcHRpb24AAAAAAAQAAAAAAAAABG5leHQAAAPqAAAH0AAAAARDYXJkAAAAAAAAAAZwb2ludHMAAAAAAAY=",
        "AAAAAQAAAAAAAAAAAAAADFF1ZXN0aW9uQ2FyZAAAAAcAAAA+V2hpY2ggYXR0cmlidXRlIHRoZSBvcHRpb25zIHJlcHJlc2VudCAoVGl0bGUgLyBBcnRpc3QgLyBZZWFyKS4AAAAAAARraW5kAAAH0AAAAAxRdWVzdGlvbktpbmQAAAAAAAAABWx5cmljAAAAAAAAEAAAAAAAAAALb3B0aW9uX2ZvdXIAAAAAEAAAAAAAAAAKb3B0aW9uX29uZQAAAAAAEAAAAAAAAAAMb3B0aW9uX3RocmVlAAAAEAAAAAAAAAAKb3B0aW9uX3R3bwAAAAAAEAAAAAAAAAAJdGltZXN0YW1wAAAAAAAABg==",
        "AAAAAwAAASFTcGVjaWZpZXMgd2hhdCB0aGUgcGxheWVyIGlzIGFza2VkIHRvIGlkZW50aWZ5IGluIGEgYFF1ZXN0aW9uQ2FyZGAuClVzaW5nIGV4cGxpY2l0IGRpc2NyaW1pbmFudHMga2VlcHMgdGhlIG9uLWNoYWluIEFCSSBzdGFibGUgYW5kIG1ha2VzIHRoZQpKUyBTREsgZGVjb2RlIHRvIGEgcGxhaW4gYG51bWJlcmAgKHNhbWUgZW5jb2RpbmcgcnVsZSBhcyBgR2VucmVgL2BSb2xlYCkuCktlZXAgYGZyb250ZW5kL3NyYy9saWIvc3RlbGxhci90eXBlcy50c2AncyBgUVVFU1RJT05fS0lORF9WQUxVRVNgIGluIHN5bmMuAAAAAAAAAAAAAAxRdWVzdGlvbktpbmQAAAADAAAAAAAAAAVUaXRsZQAAAAAAAAAAAAAAAAAABkFydGlzdAAAAAAAAQAAAAAAAAAEWWVhcgAAAAI=",
        "AAAABAAAATNDb250cmFjdCBlcnJvciBjb2Rlcy4gQ2xpZW50cyAoc2VlIGBmcm9udGVuZC9zcmMvbGliL3N0ZWxsYXIvZXJyb3JzLnRzYCkKbWFwIG9uIHRoZSBudW1lcmljIHZhbHVlcywgc28gdGhleSBhcmUgcGFydCBvZiB0aGUgcHVibGljIEFCSTogbmV2ZXIKcmVudW1iZXIgb3IgcmV1c2UgYSBjb2RlLiBOZXcgdmFyaWFudHMgdGFrZSB0aGUgbmV4dCBmcmVlIG51bWJlciwgYW5kIHRoZQp0YWJsZSBpbiBgb25jaGFpbi9SRUFETUUubWRgIHBsdXMgYHRlc3Q6OmVycm9yX2NvZGVzX2FyZV9zdGFibGVgIG11c3QgYmUKdXBkYXRlZCBhbG9uZ3NpZGUuAAAAAAAAAAAFRXJyb3IAAAAAAAAuAAAAZURlZmVuc2l2ZSBvbmx5OiBgX19jb25zdHJ1Y3RvcmAgcnVucyBleGFjdGx5IG9uY2UgcGVyIGRlcGxveW1lbnQsIHNvCnRoaXMgaXMgdW5yZWFjaGFibGUgaW4gcHJhY3RpY2UuAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAQAAACJObyByb3VuZCBleGlzdHMgd2l0aCB0aGUgZ2l2ZW4gaWQuAAAAAAAQTm9uRXhpc3RpbmdSb3VuZAAAAAIAAAA/VGhlIHJvdW5kIGhhcyBhbHJlYWR5IGJlZW4gc3RhcnRlZCBhbmQgY2FuIG5vIGxvbmdlciBiZSBqb2luZWQuAAAAABNSb3VuZEFscmVhZHlTdGFydGVkAAAAAAMAAAAiTm8gZ2VucmUgZXhpc3RzIHdpdGggdGhlIGdpdmVuIGlkLgAAAAAAEE5vbkV4aXN0aW5nR2VucmUAAAAEAAAAMVRoZSBjYWxsaW5nIHBsYXllciBoYXMgYWxyZWFkeSBqb2luZWQgdGhpcyByb3VuZC4AAAAAAAASUm91bmRBbHJlYWR5Sm9pbmVkAAAAAAAFAAAALGBjYXJkc19wZXJfcm91bmRgIG11c3QgYmUgZ3JlYXRlciB0aGFuIHplcm8uAAAAFEludmFsaWRDYXJkc1BlclJvdW5kAAAABgAAAC5BIHJvdW5kIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgYXJ0aXN0IGNhcmQuAAAAAAARQXJ0aXN0Q2FyZHNJc1plcm8AAAAAAAAHAAAAK1RoZSB5ZWFyLWNhcmRzIHBvb2wgZm9yIHRoZSByb3VuZCBpcyBlbXB0eS4AAAAADkVtcHR5WWVhckNhcmRzAAAAAAAIAAAALFRoZSBnZW5yZS1jYXJkcyBwb29sIGZvciB0aGUgcm91bmQgaXMgZW1wdHkuAAAAD0VtcHR5R2VucmVDYXJkcwAAAAAJAAAAI1RoZSByb3VuZCBoYXMgbm90IGJlZW4gc3RhcnRlZCB5ZXQuAAAAAA9Sb3VuZE5vdFN0YXJ0ZWQAAAAACgAAACVUaGUgcm91bmQgaGFzIGFscmVhZHkgYmVlbiBjb21wbGV0ZWQuAAAAAAAADlJvdW5kQ29tcGxldGVkAAAAAAALAAAALlRoZSBjYWxsZXIgaXMgbm90IGEgcGFydGljaXBhbnQgb2YgdGhpcyByb3VuZC4AAAAAAA9Ob3RBUGFydGljaXBhbnQAAAAADAAAADdUaGUgY2FsbGluZyBwbGF5ZXIgaGFzIGFscmVhZHkgbWFya2VkIHRoZW1zZWx2ZXMgcmVhZHkuAAAAAAxBbHJlYWR5UmVhZHkAAAANAAAANFRoZSBjYWxsZXIgaXMgbm90IGF1dGhvcml6ZWQgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbi4AAAANTm90QXV0aG9yaXplZAAAAAAAAA4AAAAyVGhlIHJlcXVlc3RlZCBhbW91bnQgZXhjZWVkcyB0aGUgY29uZmlndXJlZCBsaW1pdC4AAAAAABJBbW91bnRFeGNlZWRzTGltaXQAAAAAAA8AAAAkVGhlIGxpbWl0IG11c3QgYmUgZ3JlYXRlciB0aGFuIHplcm8uAAAAGkxpbWl0TXVzdEJlR3JlYXRlclRoYW5aZXJvAAAAAAAQAAAAIU5vIGNhcmQgZXhpc3RzIHdpdGggdGhlIGdpdmVuIGlkLgAAAAAAAA9Ob25FeGlzdGluZ0NhcmQAAAAAEQAAADZUaGUgcm91bmQgaXMgbm90IHJlYWR5IHRvIGJlIHN0YXJ0ZWQgb3IgZmluYWxpemVkIHlldC4AAAAAAA1Sb3VuZE5vdFJlYWR5AAAAAAAAEgAAACVUaGUgcm91bmQgaGFzIGFscmVhZHkgYmVlbiBmaW5hbGl6ZWQuAAAAAAAAFVJvdW5kQWxyZWFkeUZpbmFsaXplZAAAAAAAABMAAAA6VGhlIHJvdW5kIGRvZXMgbm90IGNvbnRhaW4gZW5vdWdoIGRpc3RpbmN0IGNhcmRzIHRvIHN0YXJ0LgAAAAAAFk5vdEVub3VnaERpc3RpbmN0Q2FyZHMAAAAAABQAAAAxVGhlIHJvdW5kIGlzIGZ1bGwgYW5kIGNhbm5vdCBhY2NlcHQgbW9yZSBwbGF5ZXJzLgAAAAAAAAlSb3VuZEZ1bGwAAAAAAAAVAAAAR2BtYXhfcGxheWVyc2AgaXMgaW52YWxpZCAoZS5nLiB6ZXJvIG9yIGJlbG93IHRoZSBjdXJyZW50IHBsYXllciBjb3VudCkuAAAAABFJbnZhbGlkTWF4UGxheWVycwAAAAAAABYAAAAxVGhlIE5GVCBjb250cmFjdCBhZGRyZXNzIGhhcyBub3QgYmVlbiBjb25maWd1cmVkLgAAAAAAABFOZnRDb250cmFjdE5vdFNldAAAAAAAABcAAAAnVGhlIG1pbGVzdG9uZSBoYXMgbm90IGJlZW4gcmVhY2hlZCB5ZXQuAAAAABNNaWxlc3RvbmVOb3RSZWFjaGVkAAAAABgAAAAuVGhlIG1pbGVzdG9uZSByZXdhcmQgaGFzIGFscmVhZHkgYmVlbiBjbGFpbWVkLgAAAAAAF01pbGVzdG9uZUFscmVhZHlDbGFpbWVkAAAAABkAAAAuVGhlIGNhcmQgdGl0bGUgaXMgaW52YWxpZCAoZW1wdHkgb3IgdG9vIGxvbmcpLgAAAAAAEEludmFsaWRDYXJkVGl0bGUAAAAaAAAAL1RoZSBjYXJkIGFydGlzdCBpcyBpbnZhbGlkIChlbXB0eSBvciB0b28gbG9uZykuAAAAABFJbnZhbGlkQ2FyZEFydGlzdAAAAAAAABsAAAAwVGhlIGNhcmQgbHlyaWNzIGFyZSBpbnZhbGlkIChlbXB0eSBvciB0b28gbG9uZykuAAAAEUludmFsaWRDYXJkTHlyaWNzAAAAAAAAHAAAABlUaGUgY2FyZCB5ZWFyIGlzIGludmFsaWQuAAAAAAAAD0ludmFsaWRDYXJkWWVhcgAAAAAdAAAAMlRoZSBjYXJkIGx5cmljcyBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAAAANTHlyaWNzVG9vTG9uZwAAAAAAAB4AAAA5QSBjYXJkIHdpdGggdGhlIHNhbWUgY29udGVudCBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgcm91bmQuAAAAAAAADUR1cGxpY2F0ZUNhcmQAAAAAAAAfAAAANFRoZSBiYXRjaCBvZiBjYXJkcyBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQgc2l6ZS4AAAANQmF0Y2hUb29MYXJnZQAAAAAAACAAAAA0VGhlIGNhbGxlciBpcyBub3QgdGhlIHBlbmRpbmcgb3duZXIgb2YgdGhlIGNvbnRyYWN0LgAAAA9Ob3RQZW5kaW5nT3duZXIAAAAAIQAAADpUaGUgZGVjayBoYXMgbm8gY2FyZHMgbGVmdCB0byBkcmF3OyBjYWxsIGBmaW5hbGl6ZV9yb3VuZGAuAAAAAAALTm9Nb3JlQ2FyZHMAAAAAIgAAADpUaGUgcm91bmQgd2FzIGNhbmNlbGxlZCBhbmQgY2Fubm90IGFjY2VwdCBmdXJ0aGVyIGFjdGlvbnMuAAAAAAAOUm91bmRDYW5jZWxsZWQAAAAAACMAAAA7Q2FyZCBkaWZmaWN1bHR5IG9yIHJvdW5kIGRpZmZpY3VsdHkgaXMgbm90IGJldHdlZW4gMSBhbmQgMy4AAAAAFUludmFsaWRDYXJkRGlmZmljdWx0eQAAAAAAACQAAAAuUm91bmQgZGVjYWRlIGlzIG5vdCBhIHZhbGlkIGRlY2FkZSBzdGFydCB5ZWFyLgAAAAAADUludmFsaWREZWNhZGUAAAAAAAAlAAAANWBzdWJtaXRfYW5zd2VyYCB3YXMgY2FsbGVkIGJlZm9yZSBhbnkgY2FyZCB3YXMgZHJhd24uAAAAAAAADE5vQWN0aXZlQ2FyZAAAACYAAAA4VGhlIHBsYXllciBoYXMgYWxyZWFkeSBhbnN3ZXJlZCB0aGlzIGNhcmQgaW4gdGhpcyByb3VuZC4AAAAPQWxyZWFkeUFuc3dlcmVkAAAAACcAAAAtVGhlIGNvbnRyYWN0IGlzIHBhdXNlZCBieSB0aGUgb3duZXIgKExGLTE3NCkuAAAAAAAABlBhdXNlZAAAAAAAKAAAAGZMRi0xNTg6IFRoZSBhbnN3ZXIgd2luZG93IGlzIGludmFsaWQgKG91dHNpZGUgW01JTl9BTlNXRVJfV0lORE9XX1NFQ09ORFMsIE1BWF9BTlNXRVJfV0lORE9XX1NFQ09ORFNdKS4AAAAAABNJbnZhbGlkQW5zd2VyV2luZG93AAAAACkAAABmTEYtMTU4OiBUaGUgbG9iYnkgdGltZW91dCBpcyBpbnZhbGlkIChvdXRzaWRlIFtNSU5fTE9CQllfVElNRU9VVF9TRUNPTkRTLCBNQVhfTE9CQllfVElNRU9VVF9TRUNPTkRTXSkuAAAAAAATSW52YWxpZExvYmJ5VGltZW91dAAAAAAqAAAAMExGLTE1ODogVGhlIHJvdW5kIGR1cmF0aW9uIG9yIGJ1ZmZlciBpcyBpbnZhbGlkLgAAABRJbnZhbGlkUm91bmREdXJhdGlvbgAAACsAAAC4TEYtMTc2OiBgdXBkYXRlX2NhcmRgIHdvdWxkIGNoYW5nZSB0aGUgdGl0bGUvYXJ0aXN0L3llYXIgb2YgYSBjYXJkCnRoYXQgYW4gdW5maW5hbGl6ZWQgcm91bmQgc3RpbGwgcmVmZXJlbmNlcy4gV2FpdCBmb3IgdGhlIHJvdW5kIHRvCmZpbmFsaXplIChvciBiZSBjYW5jZWxsZWQpIGJlZm9yZSBlZGl0aW5nIHRoZSBjYXJkLgAAABFDYXJkSW5BY3RpdmVSb3VuZAAAAAAAACwAAACLTEYtMTc1OiB0aGUgY2FsbGVyIGFscmVhZHkgaGFzIGBNQVhfT1BFTl9ST1VORFNfUEVSX0FERFJFU1NgIHB1YmxpYwpsb2JiaWVzIG9wZW4uIFN0YXJ0LCBjYW5jZWwsIG9yIGxldCBvbmUgZXhwaXJlIGJlZm9yZSBjcmVhdGluZyBhbm90aGVyLgAAAAARVG9vTWFueU9wZW5Sb3VuZHMAAAAAAAAtAAAAQExGLTE1NDogYHNldF9tYXhfcGxheWVyc2AgZ290IGEgdmFsdWUgYWJvdmUgYE1BWF9ST1VORF9QTEFZRVJTYC4AAAARTWF4UGxheWVyc1Rvb0hpZ2gAAAAAAAAu",
        "AAAABQAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAQAAAAZwYXVzZWQAAAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAACFVucGF1c2VkAAAAAQAAAAh1bnBhdXNlZAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAACUNhcmRBZGRlZAAAAAAAAAEAAAAKY2FyZF9hZGRlZAAAAAAAAgAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAQAAAAAAAAAFZ2VucmUAAAAAAAfQAAAABUdlbnJlAAAAAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAACUNhcmREcmF3bgAAAAAAAAEAAAAKY2FyZF9kcmF3bgAAAAAAAwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACVJvdW5kTGVmdAAAAAAAAAEAAAAKcm91bmRfbGVmdAAAAAAAAwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAAAAAAAAIcmVmdW5kZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0NhcmRSZW1vdmVkAAAAAAEAAAAMY2FyZF9yZW1vdmVkAAAAAQAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0NhcmRVcGRhdGVkAAAAAAEAAAAMY2FyZF91cGRhdGVkAAAAAgAAAAAAAAAHY2FyZF9pZAAAAAAGAAAAAQAAAAAAAAAFZ2VucmUAAAAAAAfQAAAABUdlbnJlAAAAAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC1BsYXllclJlYWR5AAAAAAEAAAAMcGxheWVyX3JlYWR5AAAAAwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAAAAAAAAKcmVhZHlfdGltZQAAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAC1JvbGVVcGRhdGVkAAAAAAEAAAAMcm9sZV91cGRhdGVkAAAAAwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAEcm9sZQAAB9AAAAAEUm9sZQAAAAAAAAAAAAAAB2VuYWJsZWQAAAAAAQAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAC1JvdW5kSm9pbmVkAAAAAAEAAAAMcm91bmRfam9pbmVkAAAAAwAAAAAAAAAIcm91bmRfaWQAAAAGAAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAAAAAAAALam9pbmVkX3RpbWUAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADFJvdW5kQ3JlYXRlZAAAAAEAAAANcm91bmRfY3JlYXRlZAAAAAAAAAMAAAAAAAAACHJvdW5kX2lkAAAABgAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAADGNyZWF0ZWRfdGltZQAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADFJvdW5kU3RhcnRlZAAAAAEAAAANcm91bmRfc3RhcnRlZAAAAAAAAAMAAAAAAAAACHJvdW5kX2lkAAAABgAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADVJld2FyZENsYWltZWQAAAAAAAABAAAADnJld2FyZF9jbGFpbWVkAAAAAAADAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAltaWxlc3RvbmUAAAAAAAfQAAAACU1pbGVzdG9uZQAAAAAAAAAAAAAAAAAACHRva2VuX2lkAAAACgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADlJvdW5kQ2FuY2VsbGVkAAAAAAABAAAAD3JvdW5kX2NhbmNlbGxlZAAAAAAEAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAAAAAAAAxjYW5jZWxsZWRfYnkAAAATAAAAAQAAAD9QbGF5ZXJzIHdob3NlIHdhZ2VyIHdhcyByZWZ1bmRlZCAoZXZlcnlvbmUgc3RpbGwgaW4gdGhlIHJvdW5kKS4AAAAAEHJlZnVuZGVkX3BsYXllcnMAAAPqAAAAEwAAAAAAAAAAAAAAEXJlZnVuZF9wZXJfcGxheWVyAAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADlJvdW5kQ29tcGxldGVkAAAAAAABAAAAD3JvdW5kX2NvbXBsZXRlZAAAAAADAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAAAAAAAAd3aW5uZXJzAAAAA+oAAAATAAAAAAAAAAAAAAAGc2NvcmVzAAAAAAPsAAAAEwAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADlNjaGVtYU1pZ3JhdGVkAAAAAAABAAAAD3NjaGVtYV9taWdyYXRlZAAAAAADAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAAAAAAABJvbGRfc2NoZW1hX3ZlcnNpb24AAAAAAAQAAAAAAAAAAAAAABJuZXdfc2NoZW1hX3ZlcnNpb24AAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0Fuc3dlclN1Ym1pdHRlZAAAAAABAAAAEGFuc3dlcl9zdWJtaXR0ZWQAAAAEAAAAAAAAAAhyb3VuZF9pZAAAAAYAAAABAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAdjb3JyZWN0AAAAAAEAAAAAAAAAAAAAAAZwb2ludHMAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEENvbnRyYWN0VXBncmFkZWQAAAABAAAAEWNvbnRyYWN0X3VwZ3JhZGVkAAAAAAAABAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAAAAAALb2xkX3ZlcnNpb24AAAAABAAAAAAAAAAAAAAAC25ld192ZXJzaW9uAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAElJvdW5kQnVmZmVyVXBkYXRlZAAAAAAAAQAAABRyb3VuZF9idWZmZXJfdXBkYXRlZAAAAAEAAAAAAAAABXZhbHVlAAAAAAAABgAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAE0Fuc3dlcldpbmRvd1VwZGF0ZWQAAAAAAQAAABVhbnN3ZXJfd2luZG93X3VwZGF0ZWQAAAAAAAABAAAAAAAAAAV2YWx1ZQAAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAE0xvYmJ5VGltZW91dFVwZGF0ZWQAAAAAAQAAABVsb2JieV90aW1lb3V0X3VwZGF0ZWQAAAAAAAABAAAAAAAAAAV2YWx1ZQAAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAFENhcmRzUGVyUm91bmRVcGRhdGVkAAAAAQAAABdjYXJkc19wZXJfcm91bmRfdXBkYXRlZAAAAAABAAAAAAAAAAV2YWx1ZQAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAFE93bmVyc2hpcFRyYW5zZmVycmVkAAAAAQAAABVvd25lcnNoaXBfdHJhbnNmZXJyZWQAAAAAAAACAAAAAAAAAAlvbGRfb3duZXIAAAAAAAATAAAAAQAAAAAAAAAJbmV3X293bmVyAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAAFFJvdW5kRHVyYXRpb25VcGRhdGVkAAAAAQAAABZyb3VuZF9kdXJhdGlvbl91cGRhdGVkAAAAAAABAAAAAAAAAAV2YWx1ZQAAAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAGE93bmVyc2hpcFRyYW5zZmVyU3RhcnRlZAAAAAEAAAAab3duZXJzaGlwX3RyYW5zZmVyX3N0YXJ0ZWQAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAADXBlbmRpbmdfb3duZXIAAAAAAAATAAAAAQAAAAI=" ]),
      options
    )
  }
  public readonly fromJSON = {
    owner: this.txFromJSON<string>,
        pause: this.txFromJSON<null>,
        migrate: this.txFromJSON<null>,
        unpause: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        version: this.txFromJSON<u32>,
        add_card: this.txFromJSON<u64>,
        get_card: this.txFromJSON<Card>,
        is_admin: this.txFromJSON<boolean>,
        set_role: this.txFromJSON<null>,
        add_cards: this.txFromJSON<Array<u64>>,
        get_round: this.txFromJSON<Round>,
        is_paused: this.txFromJSON<boolean>,
        next_card: this.txFromJSON<Card>,
        get_admins: this.txFromJSON<Array<string>>,
        get_rounds: this.txFromJSON<Array<Round>>,
        join_round: this.txFromJSON<null>,
        leave_round: this.txFromJSON<null>,
        remove_card: this.txFromJSON<null>,
        start_round: this.txFromJSON<null>,
        update_card: this.txFromJSON<null>,
        cancel_round: this.txFromJSON<null>,
        claim_reward: this.txFromJSON<u128>,
        create_round: this.txFromJSON<u64>,
        get_question: this.txFromJSON<QuestionCard>,
        pending_owner: this.txFromJSON<Option<string>>,
        submit_answer: this.txFromJSON<boolean>,
        finalize_round: this.txFromJSON<null>,
        schema_version: this.txFromJSON<u32>,
        answer_and_next: this.txFromJSON<AnswerResult>,
        get_cards_count: this.txFromJSON<u64>,
        get_max_players: this.txFromJSON<u32>,
        get_open_rounds: this.txFromJSON<Array<u64>>,
        get_player_stat: this.txFromJSON<PlayerStats>,
        get_round_cards: this.txFromJSON<Array<u64>>,
        get_round_count: this.txFromJSON<u64>,
        set_max_players: this.txFromJSON<null>,
        accept_ownership: this.txFromJSON<null>,
        get_nft_contract: this.txFromJSON<Option<string>>,
        get_round_buffer: this.txFromJSON<u64>,
        get_round_scores: this.txFromJSON<Map<string, u64>>,
        set_nft_contract: this.txFromJSON<null>,
        set_round_buffer: this.txFromJSON<null>,
        create_solo_round: this.txFromJSON<QuestionCard>,
        get_answer_window: this.txFromJSON<u64>,
        get_lobby_timeout: this.txFromJSON<u64>,
        get_round_players: this.txFromJSON<Array<string>>,
        set_answer_window: this.txFromJSON<null>,
        set_lobby_timeout: this.txFromJSON<null>,
        get_cards_of_genre: this.txFromJSON<Array<Card>>,
        get_round_duration: this.txFromJSON<Option<u64>>,
        set_round_duration: this.txFromJSON<null>,
        transfer_ownership: this.txFromJSON<null>,
        build_question_card: this.txFromJSON<QuestionCard>,
        get_cards_of_a_year: this.txFromJSON<Array<Card>>,
        get_cards_of_artist: this.txFromJSON<Array<Card>>,
        get_cards_per_round: this.txFromJSON<u32>,
        set_cards_per_round: this.txFromJSON<null>,
        get_genre_card_count: this.txFromJSON<u32>,
        is_milestone_claimed: this.txFromJSON<boolean>,
        migrate_legacy_admins: this.txFromJSON<null>,
        get_players_round_count: this.txFromJSON<u32>,
        create_round_with_filter: this.txFromJSON<u64>
  }
}