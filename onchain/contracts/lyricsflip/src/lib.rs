#![no_std]

mod admin;
mod cards;
mod errors;
mod events;
mod gameplay;
mod questions;
mod random;
mod rewards;
mod rounds;
mod storage;
mod types;
mod upgrade;

use cards::*;
use storage::{bump_instance, bump_persistent, set_persistent};
pub use storage::{BUMP_AMOUNT, DAY_IN_LEDGERS, LIFETIME_THRESHOLD};

#[cfg(test)]
mod budget_thresholds;
#[cfg(test)]
mod test;
#[cfg(test)]
mod test_budget;

pub use errors::Error;
pub use events::{
    AnswerSubmitted, AnswerWindowUpdated, CardAdded, CardDrawn, CardRemoved, CardRevealed,
    CardUpdated, CardsPerRoundUpdated, ContractUpgraded, EscrowContractUpdated,
    LobbyTimeoutUpdated, MaxPlayersUpdated, MilestoneReset, NftContractUpdated,
    OwnershipTransferStarted, OwnershipTransferred, Paused, PlayerReady, RewardClaimed,
    RoleUpdated, RoundBufferUpdated, RoundCancelled, RoundCompleted, RoundCreated,
    RoundDurationUpdated, RoundJoined, RoundLeft, RoundStarted, SchemaMigrated, Unpaused,
};
pub use types::{
    Answer, AnswerResult, Card, CardPos, CardResult, DataKey, Genre, LegacyCard, LegacyRound,
    Milestone, PlayerStats, QuestionCard, QuestionKind, Role, Round, RoundFilter, RoundV3, RoundV4,
};

use soroban_sdk::{
    contract, contractclient, contractimpl, panic_with_error, Address, Bytes, BytesN, Env, Map,
    String, TryFromVal, Val, Vec,
};

#[contractclient(name = "EscrowClient")]
pub trait EscrowInterface {
    fn create_round(env: Env, round_id: u64, creator: Address, token: Address);
    fn deposit(env: Env, round_id: u64, from: Address, amount: i128);
    fn refund(env: Env, round_id: u64, player: Address) -> i128;
    fn cancel_round(env: Env, round_id: u64, players: Vec<Address>);
    fn settle_round(env: Env, round_id: u64, winners: Vec<Address>);
    fn claim_winnings(env: Env, caller: Address, round_id: u64) -> i128;
}

/// Bumped on every release that changes the contract's code; see `upgrade`.
pub const VERSION: u32 = 2;
/// Current persisted storage layout. Kept separate from the code version.
pub const SCHEMA_VERSION: u32 = 5;

pub const DEFAULT_ROUND_DURATION_SECONDS: u64 = 300;
pub const MIN_ROUND_DURATION_SECONDS: u64 = 10;
pub const MAX_ROUND_DURATION_SECONDS: u64 = 86_400;

/// Default cap on players per round when the owner hasn't set `max_players`.
pub const DEFAULT_MAX_PLAYERS: u32 = 8;

/// Seconds a player has to answer after a card is flipped (README card-flip
/// rule). Answers submitted after the window are accepted but scored as
/// wrong, so every player can still complete the round.
pub const CARD_ANSWER_WINDOW_SECONDS: u64 = 15;
pub const MIN_ANSWER_WINDOW_SECONDS: u64 = 5;
pub const MAX_ANSWER_WINDOW_SECONDS: u64 = 180;

/// Points for an instant correct answer; each elapsed second costs
/// `POINTS_DECAY_PER_SECOND`, down to `MIN_CORRECT_POINTS`.
pub const MAX_CORRECT_POINTS: u64 = 100;
pub const POINTS_DECAY_PER_SECOND: u64 = 5;

/// LF-159: answers within this many seconds of the draw earn full points.
pub const FIRST_LEDGER_GRACE_SECONDS: u64 = 6;
pub const MIN_CORRECT_POINTS: u64 = 10;

/// Seconds after creation after which anyone may cancel a round that never
/// started.
pub const LOBBY_TIMEOUT_SECONDS: u64 = 600;
pub const MIN_LOBBY_TIMEOUT_SECONDS: u64 = 30;
pub const MAX_LOBBY_TIMEOUT_SECONDS: u64 = 86_400;

/// LF-175: cap on public lobby rounds one address may leave open at once.
/// Creating a free (0-wager) round costs only a transaction fee, so without
/// a cap a single account could flood `OpenRounds` and drown out real lobbies.
pub const MAX_OPEN_ROUNDS_PER_ADDRESS: u32 = 3;

/// Default per-card transaction latency buffer for dynamic round duration.
pub const DEFAULT_ROUND_BUFFER_SECONDS: u64 = 15;
pub const MIN_ROUND_BUFFER_SECONDS: u64 = 1;
pub const MAX_ROUND_BUFFER_SECONDS: u64 = 60;

/// The subset of the `lyricsflip-nft` interface the game contract calls.
///
/// `kind` maps directly to the `Milestone` discriminant (0 = FirstWin,
/// 1 = Streak5, 2 = TenWins) so the NFT contract records which achievement
/// a badge represents (LF-168).
#[contractclient(name = "NftClient")]
#[allow(dead_code)]
pub trait NftInterface {
    fn mint(env: Env, caller: Address, recipient: Address, kind: u32) -> u128;
}

/// Upper bound on the page size of the paginated list views (`get_rounds`,
/// `get_open_rounds`). Larger `limit` values are clamped to this.
pub const MAX_PAGE_LIMIT: u32 = 50;

/// Upper bound on the number of candidate cards inspected per fallback attempt
/// when building a question card. `build_question_card` never asks
/// `get_random_numbers` for more ids than `min(10, cards_count)`, so small
/// card sets no longer panic with `AmountExceedsLimit` (LF-010).
const MAX_DISTRACTOR_SAMPLE: u64 = 10;

/// Maximum number of players in a round. Keeps the `RoundPlayers` vector
/// (read on every join/answer/finalize) bounded.
pub const MAX_ROUND_PLAYERS: u32 = 8;

/// Maximum value accepted by `set_cards_per_round`. Together with
/// `MAX_ROUND_PLAYERS` this bounds the players x cards loops in
/// `start_round`, `finalize_round` and `are_all_required_answers_submitted`
/// (see `test_budget::finalize_round_budget`).
pub const MAX_CARDS_PER_ROUND: u32 = 20;

/// Card validation bounds. The upper year bound is the current year derived
/// from the ledger timestamp.
pub const MIN_CARD_YEAR: u64 = 1900;
pub const MAX_LYRICS_LEN: u32 = 1000;
const SECONDS_PER_YEAR: u64 = 31_556_952;

/// Maximum number of cards accepted by one `add_cards` call. See
/// `onchain/README.md` and `test::add_cards_max_batch_fits_budget`.
pub const MAX_CARDS_PER_BATCH: u32 = 20;
/// LF-267: bounded number of draw attempts when a filtered round has to
/// reject non-matching cards. Each attempt costs one PRNG draw plus a card
/// read, so the loop stays within budget even at 10k cards.
pub const MAX_FILTER_DRAW_ATTEMPTS: u32 = 64;

#[contract]
pub struct LyricsFlip;

#[contractimpl]
impl LyricsFlip {
    /// Ported from the Cairo `#[constructor]`: sets the owner and grants them
    /// the (only) admin role.
    pub fn __constructor(env: Env, owner: Address) {
        admin::__constructor(env, owner)
    }

    // ---- Views ----

    /// Returns the round.
    pub fn get_round(env: Env, round_id: u64) -> Round {
        rounds::get_round(env, round_id)
    }

    /// Returns the round cards.
    ///
    /// LF-292: free to read (no auth) once the round is finalized or
    /// cancelled. Before that only an admin may read the ids, so a modified
    /// client cannot look up the answers ahead of time; any other caller gets
    /// `RoundNotReady`.
    pub fn get_round_cards(env: Env, caller: Address, round_id: u64) -> Vec<u64> {
        rounds::get_round_cards(env, caller, round_id)
    }

    /// LF-293: every card of a finalized round with each player's
    /// `(correct, points)`, read from storage so it never depends on events.
    pub fn get_round_summary(env: Env, round_id: u64) -> Vec<CardResult> {
        gameplay::get_round_summary(env, round_id)
    }

    /// Returns the round players.
    pub fn get_round_players(env: Env, round_id: u64) -> Vec<Address> {
        rounds::get_round_players(env, round_id)
    }

    /// Returns the players round count.
    pub fn get_players_round_count(env: Env, round_id: u64) -> u32 {
        rounds::get_players_round_count(env, round_id)
    }

    /// Returns the round scores.
    pub fn get_round_scores(env: Env, round_id: u64) -> Map<Address, u64> {
        gameplay::get_round_scores(env, round_id)
    }

    /// Finalizes a round after authenticating and checking participation/readiness.
    pub fn finalize_round(env: Env, caller: Address, round_id: u64) {
        gameplay::finalize_round(env, caller, round_id)
    }

    /// Number of live (added and not removed) cards.
    pub fn get_cards_count(env: Env) -> u64 {
        cards::get_cards_count(env)
    }

    /// Returns the round count.
    pub fn get_round_count(env: Env) -> u64 {
        rounds::get_round_count(env)
    }

    /// Returns the genre card count.
    pub fn get_genre_card_count(env: Env, genre: Genre) -> u32 {
        cards::get_genre_card_count(env, genre)
    }

    /// Returns up to `limit` rounds (clamped to `MAX_PAGE_LIMIT`) starting at
    /// round id `start`, in ascending id order. Round ids begin at 1, so a
    /// `start` of 0 is treated as 1. Returns an empty list past the end.
    pub fn get_rounds(env: Env, start: u64, limit: u32) -> Vec<Round> {
        rounds::get_rounds(env, start, limit)
    }

    /// LF-286: ids of the rounds `player` created or joined, newest first.
    /// `start` is an offset from the newest round and `limit` is clamped to
    /// `MAX_PAGE_LIMIT`. Rounds the player left are not included.
    pub fn get_player_rounds(env: Env, player: Address, start: u32, limit: u32) -> Vec<u64> {
        rewards::get_player_rounds(env, player, start, limit)
    }

    /// Ids of rounds that are created but not yet started (i.e. joinable),
    /// oldest first. `start` is an offset into that list and `limit` is
    /// clamped to `MAX_PAGE_LIMIT`.
    pub fn get_open_rounds(env: Env, start: u32, limit: u32) -> Vec<u64> {
        rounds::get_open_rounds(env, start, limit)
    }

    /// Returns the max players.
    pub fn get_max_players(env: Env) -> u32 {
        admin::get_max_players(env)
    }

    /// Returns the nft contract.
    pub fn get_nft_contract(env: Env) -> Option<Address> {
        admin::get_nft_contract(env)
    }

    /// Returns whether milestone claimed.
    pub fn is_milestone_claimed(env: Env, player: Address, milestone: Milestone) -> bool {
        rewards::is_milestone_claimed(env, player, milestone)
    }

    /// Returns the cards per round.
    pub fn get_cards_per_round(env: Env) -> u32 {
        admin::get_cards_per_round(env)
    }

    /// Returns the owner-configured answer window in seconds, defaulting to
    /// `CARD_ANSWER_WINDOW_SECONDS` (15s).
    pub fn get_answer_window(env: Env) -> u64 {
        admin::get_answer_window(env)
    }

    /// Returns the owner-configured lobby timeout in seconds, defaulting to
    /// `LOBBY_TIMEOUT_SECONDS` (600s).
    pub fn get_lobby_timeout(env: Env) -> u64 {
        admin::get_lobby_timeout(env)
    }

    /// Returns the owner-configured fixed round duration override in seconds,
    /// or `None` if dynamic deadline calculation is used.
    pub fn get_round_duration(env: Env) -> Option<u64> {
        admin::get_round_duration(env)
    }

    /// Returns the owner-configured per-card latency buffer in seconds,
    /// defaulting to `DEFAULT_ROUND_BUFFER_SECONDS` (10s).
    pub fn get_round_buffer(env: Env) -> u64 {
        admin::get_round_buffer(env)
    }

    /// Returns the card. A soft-removed card (LF-176) is reported as
    /// `NonExistingCard`: it is gone from the catalogue even though rounds
    /// that already drew it keep a readable copy for grading. LF-278: a card
    /// in a live round comes back redacted (empty title/artist, year 0).
    pub fn get_card(env: Env, card_id: u64) -> Card {
        cards::get_card(env, card_id)
    }

    /// LF-142: returns only the lyric, kind and options for the caller's
    /// current card in `round_id`, never the title/artist/year. Replaces
    /// `next_card`'s old `Card` return so a modified client cannot read the
    /// answer from the contract's own return values.
    pub fn get_question(env: Env, caller: Address, round_id: u64) -> QuestionCard {
        questions::get_question(env, caller, round_id)
    }

    /// LF-279: Admin-only page of the catalogue, walking `Index::All` from
    /// `start` and returning up to `limit` (clamped to `MAX_PAGE_LIMIT`)
    /// cards. Soft-removed cards are skipped.
    pub fn get_cards(env: Env, caller: Address, start: u32, limit: u32) -> Vec<Card> {
        cards::get_cards(env, caller, start, limit)
    }

    /// LF-279: Admin-only page of the cards of `genre`; see `get_cards`.
    pub fn get_cards_by_genre(
        env: Env,
        caller: Address,
        genre: Genre,
        start: u32,
        limit: u32,
    ) -> Vec<Card> {
        cards::get_cards_by_genre(env, caller, genre, start, limit)
    }

    /// Returns the cards of genre.
    pub fn get_cards_of_genre(env: Env, genre: Genre) -> Vec<Card> {
        cards::get_cards_of_genre(env, genre)
    }

    /// Returns the cards of artist.
    pub fn get_cards_of_artist(env: Env, artist: String) -> Vec<Card> {
        cards::get_cards_of_artist(env, artist)
    }

    /// Returns the cards of a year.
    pub fn get_cards_of_a_year(env: Env, year: u64) -> Vec<Card> {
        cards::get_cards_of_a_year(env, year)
    }

    /// Returns the player stat.
    pub fn get_player_stat(env: Env, player: Address) -> PlayerStats {
        rewards::get_player_stat(env, player)
    }

    /// Returns whether the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        admin::is_paused(env)
    }

    /// Returns whether admin.
    pub fn is_admin(env: Env, role: Role, address: Address) -> bool {
        admin::is_admin(env, role, address)
    }

    /// Returns the current list of admin addresses (LF-156).
    pub fn get_admins(env: Env) -> Vec<Address> {
        admin::get_admins(env)
    }

    /// Owner-only batch migration for legacy admin keys that cannot be
    /// enumerated from instance storage. Pass candidate addresses from the
    /// contract's historical `RoleUpdated` events; use multiple calls for
    /// large histories. Active legacy grants are moved to persistent storage
    /// and the admin index, while legacy false tombstones are deleted.
    pub fn migrate_legacy_admins(env: Env, caller: Address, candidates: Vec<Address>) {
        admin::migrate_legacy_admins(env, caller, candidates)
    }

    // ---- Mutations ----

    /// Owner-only. Halts new rounds, joins and reward claims. Refund and
    /// cancel paths stay open so escrowed funds can always leave.
    pub fn pause(env: Env, caller: Address) {
        admin::pause(env, caller)
    }

    /// Owner-only. Resumes normal operation.
    pub fn unpause(env: Env, caller: Address) {
        admin::unpause(env, caller)
    }

    /// Creates a round. `invitees` (LF-264) makes the round private: only
    /// the listed addresses may join. The allowlist is stored on-chain, so
    /// nothing secret ever appears in a transaction argument.
    pub fn create_round(
        env: Env,
        caller: Address,
        genre: Option<Genre>,
        invitees: Vec<Address>,
        wager_token: Option<Address>,
        wager_amount: i128,
    ) -> u64 {
        rounds::create_round(env, caller, genre, invitees, wager_token, wager_amount)
    }

    /// LF-291: like `create_round`, but caps this round at `max_players`
    /// (e.g. 2 for a duel). Must be at least 2 and at most the global
    /// `get_max_players`; `None` uses the global value.
    pub fn create_round_with_max_players(
        env: Env,
        caller: Address,
        genre: Option<Genre>,
        invitees: Vec<Address>,
        max_players: Option<u32>,
    ) -> u64 {
        rounds::create_round_with_max_players(env, caller, genre, invitees, max_players)
    }

    /// Creates a round using optional genre, decade and difficulty filters.
    pub fn create_round_with_filter(
        env: Env,
        caller: Address,
        filter: RoundFilter,
        difficulty: Option<u32>,
        invitees: Vec<Address>,
    ) -> u64 {
        rounds::create_round_with_filter(env, caller, filter, difficulty, invitees)
    }

    /// Starts round.
    pub fn start_round(env: Env, caller: Address, round_id: u64) {
        rounds::start_round(env, caller, round_id)
    }

    /// Joins round. For a private round (LF-264), `caller` must appear in the
    /// allowlist the admin supplied at creation. Nothing secret is passed in
    /// the call, so observing an earlier join reveals nothing reusable.
    pub fn join_round(env: Env, caller: Address, round_id: u64) {
        rounds::join_round(env, caller, round_id)
    }

    /// Leaves a round that hasn't started yet and refunds the caller's wager.
    /// The round admin can't leave; they cancel the round instead.
    pub fn leave_round(env: Env, caller: Address, round_id: u64) {
        rounds::leave_round(env, caller, round_id)
    }

    /// Cancels a round that hasn't started and refunds every player. Callable
    /// by the round admin at any time before start, or by anyone once the
    /// lobby has been open for `LOBBY_TIMEOUT_SECONDS`.
    pub fn cancel_round(env: Env, caller: Address, round_id: u64) {
        rounds::cancel_round(env, caller, round_id)
    }

    /// Advances to the next card.
    ///
    /// Returns `Error::NoMoreCards` (LF-003) when the deck is exhausted so
    /// callers can distinguish "deck empty, call finalize_round" from "round
    /// already finalized". The `is_completed` flag is set only by
    /// `finalize_round`, so players can still answer the last drawn card
    /// after this function returns it.
    pub fn next_card(env: Env, caller: Address, round_id: u64) -> QuestionCard {
        gameplay::next_card(env, caller, round_id)
    }

    /// Sets the cards per round.
    pub fn set_cards_per_round(env: Env, caller: Address, value: u32) {
        admin::set_cards_per_round(env, caller, value)
    }

    /// Adds a card and returns its id. The `card_id` field of `card` is
    /// ignored; the stored card carries the assigned id.
    pub fn add_card(env: Env, caller: Address, card: Card) -> u64 {
        cards::add_card(env, caller, card)
    }

    /// Adds up to `MAX_CARDS_PER_BATCH` cards in one call and returns their
    /// ids in order. The whole batch fails if any card is invalid.
    pub fn add_cards(env: Env, caller: Address, cards: Vec<Card>) -> Vec<u64> {
        cards::add_cards(env, caller, cards)
    }

    /// Replaces the contents of `card_id`, moving it between the genre,
    /// artist and year indexes as needed.
    ///
    /// LF-176: rejects changes to the answer fields (title, artist, year)
    /// while an unfinalized round still references the card, so an in-flight
    /// round can never be scored against edited answers. Genre, difficulty
    /// and lyrics edits stay allowed: they don't change the correct answer.
    pub fn update_card(env: Env, caller: Address, card_id: u64, card: Card) {
        cards::update_card(env, caller, card_id, card)
    }

    /// Soft-removes a card (LF-176): drops it from every index and from all
    /// future draws and views, but keeps the stored `Card` entry so rounds
    /// that already drew the card can still read and grade it. The id is
    /// never reused; `get_card` reports `NonExistingCard` afterwards.
    pub fn remove_card(env: Env, caller: Address, card_id: u64) {
        cards::remove_card(env, caller, card_id)
    }

    /// Owner-only. The owner may manage roles even after revoking their own
    /// admin flag, so they can never lock themselves out.
    pub fn set_role(env: Env, caller: Address, recipient: Address, role: Role, is_enable: bool) {
        admin::set_role(env, caller, recipient, role, is_enable)
    }

    /// Returns the current owner.
    pub fn owner(env: Env) -> Address {
        admin::owner(env)
    }

    /// Returns the pending owner.
    pub fn pending_owner(env: Env) -> Option<Address> {
        admin::pending_owner(env)
    }

    /// Returns the contract version.
    pub fn version() -> u32 {
        upgrade::version()
    }

    /// Returns the stored storage schema version. Unmigrated / legacy deployments default to 1.
    pub fn schema_version(env: Env) -> u32 {
        upgrade::schema_version(env)
    }

    /// Step one of an ownership transfer; `new_owner` must then call
    /// `accept_ownership`. Calling again replaces the pending owner.
    pub fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
        admin::transfer_ownership(env, caller, new_owner)
    }

    /// Completes an ownership transfer and grants the new owner the admin
    /// role. The previous owner keeps any admin role they had.
    pub fn accept_ownership(env: Env, caller: Address) {
        admin::accept_ownership(env, caller)
    }

    /// Owner-only. Replaces this contract's code in place, keeping all
    /// storage. Emits `ContractUpgraded`.
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        upgrade::upgrade(env, caller, new_wasm_hash)
    }

    /// Owner-only. Migrates stored state step-by-step from the stored
    /// schema version up to `SCHEMA_VERSION`. Strictly idempotent: calling it
    /// multiple times after migration is a no-op.
    pub fn migrate(env: Env, caller: Address) {
        upgrade::migrate(env, caller)
    }

    /// Submits a round answer through the shared scoring implementation.
    pub fn submit_answer(env: Env, caller: Address, round_id: u64, answer: Answer) -> bool {
        gameplay::submit_answer(env, caller, round_id, answer)
    }

    /// Sets the max players.
    pub fn set_max_players(env: Env, caller: Address, value: u32) {
        admin::set_max_players(env, caller, value)
    }

    /// Sets the nft contract.
    pub fn set_escrow_contract(env: Env, caller: Address, escrow: Address) {
        admin::set_escrow_contract(env, caller, escrow)
    }

    pub fn set_nft_contract(env: Env, caller: Address, nft_contract: Address) {
        admin::set_nft_contract(env, caller, nft_contract)
    }

    /// Sets the answer window in seconds.
    pub fn set_answer_window(env: Env, caller: Address, value: u64) {
        admin::set_answer_window(env, caller, value)
    }

    /// Sets the lobby timeout in seconds.
    pub fn set_lobby_timeout(env: Env, caller: Address, value: u64) {
        admin::set_lobby_timeout(env, caller, value)
    }

    /// Sets an optional fixed round duration in seconds. Passing `None` or `Some(0)`
    /// resets the contract to use dynamic deadline calculation:
    /// `cards_per_round * (answer_window + buffer)`.
    pub fn set_round_duration(env: Env, caller: Address, value: Option<u64>) {
        admin::set_round_duration(env, caller, value)
    }

    /// Sets the latency buffer added per card (in seconds) for dynamic deadline calculation.
    pub fn set_round_buffer(env: Env, caller: Address, value: u64) {
        admin::set_round_buffer(env, caller, value)
    }

    /// LF-284: owner-only. Clears `player`'s claimed flag for `milestone` so
    /// a badge that was burned or revoked by mistake can be claimed again.
    pub fn reset_milestone(env: Env, caller: Address, player: Address, milestone: Milestone) {
        rewards::reset_milestone(env, caller, player, milestone)
    }

    /// Mints the NFT for `milestone` to `caller` through a cross-contract
    /// call. This contract must be the NFT contract's minter. Each milestone
    /// can be claimed once per player.
    pub fn claim_winnings(env: Env, caller: Address, round_id: u64) -> i128 {
        rewards::claim_winnings(env, caller, round_id)
    }

    pub fn claim_reward(env: Env, caller: Address, milestone: Milestone) -> u128 {
        rewards::claim_reward(env, caller, milestone)
    }

    /// Builds a question card. LF-268: options are shuffled with the
    /// contract PRNG, so no caller-supplied seed can steer the layout.
    pub fn build_question_card(env: Env, card: Card, kind: QuestionKind) -> QuestionCard {
        questions::build_question_card(env, card, kind)
    }

    /// LF-163: create and start a solo round in one call, return the first
    /// question. Skipped from OpenRounds so it never appears in the
    /// multiplayer lobby. Exactly ONE require_auth: create_round_internal
    /// performs it, so we do not call it again here, and the first card is
    /// drawn inline (next_card would require_auth a second time).
    pub fn create_solo_round(env: Env, caller: Address, genre: Option<Genre>) -> QuestionCard {
        rounds::create_solo_round(env, caller, genre)
    }

    // LF-164: combined answer+draw. Reuses submit_answer's scoring path so
    // lf159 timing points, lf004 AlreadyAnswered guard and streaks are unchanged.
    pub fn answer_and_next(
        env: Env,
        caller: Address,
        round_id: u64,
        choice: Answer,
    ) -> AnswerResult {
        gameplay::answer_and_next(env, caller, round_id, choice)
    }
}
