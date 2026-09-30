#![no_std]

mod errors;
mod events;
mod types;

#[cfg(test)]
mod budget_thresholds;
#[cfg(test)]
mod test;
#[cfg(test)]
mod test_budget;

pub use errors::Error;
pub use events::{
    AnswerSubmitted, CardAdded, CardDrawn, CardRemoved, CardUpdated, CardsPerRoundUpdated,
    OwnershipTransferStarted, OwnershipTransferred, PlayerReady, RewardClaimed, RoleUpdated,
    RoundCancelled, RoundCompleted, RoundCreated, RoundJoined, RoundLeft, RoundStarted,
};
pub use types::{
    Answer, Card, CardPos, DataKey, Genre, Milestone, PlayerStats, QuestionCard, QuestionKind,
    Role, Round,
pub use types::{Answer, Card, DataKey, Genre, Milestone, PlayerStats, QuestionCard, Role, Round};
pub use events::{PlayerReady, RoundCompleted, RoundCreated, RoundJoined, RoundStarted};
pub use types::{
    Answer, Card, DataKey, Genre, PlayerStats, QuestionCard, QuestionKind, Role, Round,
};

use soroban_sdk::{
    contract, contractclient, contractimpl, panic_with_error, Address, Bytes, BytesN, Env, Map,
    String, Vec,
};

/// Bumped on every release that changes the contract's code; see `upgrade`.
pub const VERSION: u32 = 1;

const DEFAULT_ROUND_DURATION_SECONDS: u64 = 300;

/// Default cap on players per round when the owner hasn't set `max_players`.
pub const DEFAULT_MAX_PLAYERS: u32 = 8;

/// Seconds a player has to answer after a card is flipped (README card-flip
/// rule). Answers submitted after the window are accepted but scored as
/// wrong, so every player can still complete the round.
pub const CARD_ANSWER_WINDOW_SECONDS: u64 = 15;
/// Points for an instant correct answer; each elapsed second costs
/// `POINTS_DECAY_PER_SECOND`, down to `MIN_CORRECT_POINTS`.
pub const MAX_CORRECT_POINTS: u64 = 100;
pub const POINTS_DECAY_PER_SECOND: u64 = 5;
pub const MIN_CORRECT_POINTS: u64 = 10;

/// Seconds after creation after which anyone may cancel a round that never
/// started.
pub const LOBBY_TIMEOUT_SECONDS: u64 = 600;

/// The subset of the `lyricsflip-nft` interface the game contract calls.
#[contractclient(name = "NftClient")]
#[allow(dead_code)]
pub trait NftInterface {
    fn mint(env: Env, caller: Address, recipient: Address) -> u128;
}

/// Upper bound on the page size of the paginated list views (`get_rounds`,
/// `get_open_rounds`). Larger `limit` values are clamped to this.
pub const MAX_PAGE_LIMIT: u32 = 50;

// ---------------------------------------------------------------------------
// LF-012 – TTL policy
//
// Soroban persistent and instance entries are archived when their TTL expires.
// We extend TTLs on every write (and on reads for hot keys) so that active
// game data stays available on testnet / mainnet.
//
// Ledger cadence on Stellar mainnet ≈ 5 s, so:
//   DAY_IN_LEDGERS  ≈ 17 280 ledgers/day
//   BUMP_AMOUNT     = 30 days of ledgers
//   LIFETIME_THRESHOLD = 7 days — extend only when less than this remains,
//                        avoiding a per-call extend when lots of TTL is left.
// ---------------------------------------------------------------------------
pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS; // ~30 days
pub const LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS; // ~7 days

/// Extend instance storage TTL (owner, admin map, counters, config).
#[inline]
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

/// Extend a single persistent storage entry by key.
#[inline]
fn bump_persistent<K>(env: &Env, key: &K)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    soroban_sdk::Val: soroban_sdk::TryFromVal<Env, K>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}
/// Upper bound on the number of candidate cards inspected per fallback attempt
/// when building a question card. `build_question_card` never asks
/// `get_random_numbers` for more ids than `min(10, cards_count)`, so small
/// card sets no longer panic with `AmountExceedsLimit` (LF-010).
const MAX_DISTRACTOR_SAMPLE: u64 = 10;

/// Maximum number of players in a round. Keeps the `RoundPlayers` vector
/// (read on every join/answer/finalize) bounded.
pub const MAX_ROUND_PLAYERS: u32 = 8;

/// Card validation bounds. The upper year bound is the current year derived
/// from the ledger timestamp.
pub const MIN_CARD_YEAR: u64 = 1900;
pub const MAX_LYRICS_LEN: u32 = 1000;
const SECONDS_PER_YEAR: u64 = 31_556_952;

/// Maximum number of cards accepted by one `add_cards` call. See
/// `onchain/README.md` and `test::add_cards_max_batch_fits_budget`.
pub const MAX_CARDS_PER_BATCH: u32 = 20;

/// One of the card index lists (see `DataKey::CardAt` and friends).
enum Index {
    All,
    Genre(Genre),
    Artist(String),
    Year(u64),
}

impl Index {
    fn of(card: &Card) -> [Index; 4] {
        [
            Index::All,
            Index::Genre(card.genre),
            Index::Artist(card.artist.clone()),
            Index::Year(card.year),
        ]
    }

    fn count_key(&self) -> DataKey {
        match self {
            Index::All => DataKey::CardsCount,
            Index::Genre(g) => DataKey::GenreCardCount(*g),
            Index::Artist(a) => DataKey::ArtistCardCount(a.clone()),
            Index::Year(y) => DataKey::YearCardCount(*y),
        }
    }

    fn at_key(&self, i: u32) -> DataKey {
        match self {
            Index::All => DataKey::CardAt(i),
            Index::Genre(g) => DataKey::GenreCardAt((*g, i)),
            Index::Artist(a) => DataKey::ArtistCardAt((a.clone(), i)),
            Index::Year(y) => DataKey::YearCardAt((*y, i)),
        }
    }

    fn pos<'a>(&self, pos: &'a mut CardPos) -> &'a mut u32 {
        match self {
            Index::All => &mut pos.all,
            Index::Genre(_) => &mut pos.genre,
            Index::Artist(_) => &mut pos.artist,
            Index::Year(_) => &mut pos.year,
        }
    }
// ---------------------------------------------------------------------------
// LF-012 – TTL policy
//
// Soroban persistent and instance entries are archived when their TTL expires.
// We extend TTLs on every write (and on reads for hot keys) so that active
// game data stays available on testnet / mainnet.
//
// Ledger cadence on Stellar mainnet ≈ 5 s, so:
//   DAY_IN_LEDGERS  ≈ 17 280 ledgers/day
//   BUMP_AMOUNT     = 30 days of ledgers
//   LIFETIME_THRESHOLD = 7 days — extend only when less than this remains,
//                        avoiding a per-call extend when lots of TTL is left.
// ---------------------------------------------------------------------------
pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS; // ~30 days
pub const LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS; // ~7 days

/// Extend instance storage TTL (owner, admin map, counters, config).
#[inline]
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

/// Extend a single persistent storage entry by key.
#[inline]
fn bump_persistent<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

#[contract]
pub struct LyricsFlip;

#[contractimpl]
impl LyricsFlip {
    /// Ported from the Cairo `#[constructor]`: sets the owner and grants them
    /// the (only) admin role.
    pub fn __constructor(env: Env, owner: Address) {
        if env.storage().instance().has(&DataKey::Owner) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Admin(owner), &true);
        bump_instance(&env);
    }

    // ---- Views ----

    /// Returns the round.
    pub fn get_round(env: Env, round_id: u64) -> Round {
        Self::read_round(&env, round_id)
    }

    /// Returns the round cards.
    pub fn get_round_cards(env: Env, round_id: u64) -> Vec<u64> {
        Self::read_round_cards(&env, round_id)
    }

    /// Returns the round players.
    pub fn get_round_players(env: Env, round_id: u64) -> Vec<Address> {
        Self::read_round_players(&env, round_id)
    }

    /// Returns the players round count.
    pub fn get_players_round_count(env: Env, round_id: u64) -> u32 {
        Self::read_round_players(&env, round_id).len()
    }

    /// Returns the round scores.
    pub fn get_round_scores(env: Env, round_id: u64) -> Map<Address, u64> {
        let players = Self::read_round_players(&env, round_id);
        let mut scores = Self::read_round_scores(&env, round_id);

        for player in players.iter() {
            if scores.get(player.clone()).is_none() {
                scores.set(player.clone(), 0u64);
            }
        }

        scores
    }

    /// Finalizes a round.
    pub fn finalize_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let round = Self::read_round(&env, round_id);
        if !Self::is_round_player(&env, round_id, &caller) {
            panic_with_error!(env, Error::NotAParticipant);
        }
        if round.is_cancelled {
            panic_with_error!(env, Error::RoundCancelled);
        }
        if env
            .storage()
            .persistent()
            .get(&DataKey::RoundFinalized(round_id))
            .unwrap_or(false)
        {
            panic_with_error!(env, Error::RoundAlreadyFinalized);
        }

        let now = env.ledger().timestamp();
        let is_all_cards_answered = Self::are_all_required_answers_submitted(&env, round_id);
        let is_past_deadline = round.end_time != 0 && now >= round.end_time;
        if !is_all_cards_answered && !is_past_deadline {
            panic_with_error!(env, Error::RoundNotReady);
        }

        // Record when the round actually ended: now if everyone finished
        // early, otherwise the (already passed) deadline.
        let mut round = round;
        round.is_completed = true;
        round.end_time = if is_past_deadline {
            round.end_time
        } else {
            now
        };
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);

        let winners = Self::determine_round_winners(&env, round_id);
        if winners.len() > 0 {
            for player in Self::read_round_players(&env, round_id).iter() {
                let mut is_winner = false;
                for winner in winners.iter() {
                    if winner == player {
                        is_winner = true;
                        break;
                    }
                }
                if is_winner {
                    let mut stats = Self::get_player_stat(env.clone(), player.clone());
                    stats.rounds_won += 1;
                    env.storage()
                        .persistent()
                        .set(&DataKey::PlayerStats(player.clone()), &stats);
                    bump_persistent(&env, &DataKey::PlayerStats(player));
                }
            }
        }

        let scores = Self::get_round_scores(env.clone(), round_id);
        RoundCompleted {
            round_id,
            winners: winners.clone(),
            scores,
        }
        .publish(&env);

        env.storage()
            .persistent()
            .set(&DataKey::RoundFinalized(round_id), &true);
        bump_persistent(&env, &DataKey::RoundFinalized(round_id));
        bump_instance(&env);
    }

    /// Number of live (added and not removed) cards.
    pub fn get_cards_count(env: Env) -> u64 {
        Self::index_len(&env, &Index::All) as u64
    }

    /// Returns the round count.
    pub fn get_round_count(env: Env) -> u64 {
        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::RoundCount)
            .unwrap_or(0)
    }

    /// Returns the genre card count.
    pub fn get_genre_card_count(env: Env, genre: Genre) -> u32 {
        Self::index_len(&env, &Index::Genre(genre))
    }

    /// Returns up to `limit` rounds (clamped to `MAX_PAGE_LIMIT`) starting at
    /// round id `start`, in ascending id order. Round ids begin at 1, so a
    /// `start` of 0 is treated as 1. Returns an empty list past the end.
    pub fn get_rounds(env: Env, start: u64, limit: u32) -> Vec<Round> {
        let round_count = Self::get_round_count(env.clone());
        let limit = limit.min(MAX_PAGE_LIMIT) as u64;
        let mut rounds: Vec<Round> = Vec::new(&env);

        let mut round_id = start.max(1);
        while round_id <= round_count && (rounds.len() as u64) < limit {
            rounds.push_back(Self::read_round(&env, round_id));
            round_id += 1;
        }
        rounds
    }

    /// Ids of rounds that are created but not yet started (i.e. joinable),
    /// oldest first. `start` is an offset into that list and `limit` is
    /// clamped to `MAX_PAGE_LIMIT`.
    pub fn get_open_rounds(env: Env, start: u32, limit: u32) -> Vec<u64> {
        let open = Self::read_open_rounds(&env);
        let end = start
            .saturating_add(limit.min(MAX_PAGE_LIMIT))
            .min(open.len());
        if start >= end {
            return Vec::new(&env);
        }
        open.slice(start..end)
    }

    /// Returns the max players.
    pub fn get_max_players(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MaxPlayers)
            .unwrap_or(DEFAULT_MAX_PLAYERS)
    }

    /// Returns the nft contract.
    pub fn get_nft_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::NftContract)
    }

    /// Returns whether milestone claimed.
    pub fn is_milestone_claimed(env: Env, player: Address, milestone: Milestone) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::MilestoneClaimed((player, milestone)))
            .unwrap_or(false)
    }

    /// Returns the cards per round.
    pub fn get_cards_per_round(env: Env) -> u32 {
        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::CardsPerRound)
            .unwrap_or(0)
    }

    /// Returns the card.
    pub fn get_card(env: Env, card_id: u64) -> Card {
        let card: Card = env
            .storage()
            .persistent()
            .get(&DataKey::Card(card_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard));
        bump_persistent(&env, &DataKey::Card(card_id));
        card
    }

    /// Returns the cards of genre.
    pub fn get_cards_of_genre(env: Env, genre: Genre, seed: u64) -> Vec<Card> {
        Self::draw_cards(&env, &Index::Genre(genre), seed, Error::EmptyGenreCards)
    }

    /// Returns the cards of artist.
    pub fn get_cards_of_artist(env: Env, artist: String, seed: u64) -> Vec<Card> {
        Self::draw_cards(&env, &Index::Artist(artist), seed, Error::ArtistCardsIsZero)
    }

    /// Returns the cards of a year.
    pub fn get_cards_of_a_year(env: Env, year: u64, seed: u64) -> Vec<Card> {
        Self::draw_cards(&env, &Index::Year(year), seed, Error::EmptyYearCards)
    }

    /// Returns the player stat.
    pub fn get_player_stat(env: Env, player: Address) -> PlayerStats {
        let stats: PlayerStats = env
            .storage()
            .persistent()
            .get(&DataKey::PlayerStats(player.clone()))
            .unwrap_or(PlayerStats::zero());
        // Extend TTL on read so active players' stats don't get archived.
        if env
            .storage()
            .persistent()
            .has(&DataKey::PlayerStats(player.clone()))
        {
            bump_persistent(&env, &DataKey::PlayerStats(player));
        }
        stats
    }

    /// Returns whether admin.
    pub fn is_admin(env: Env, role: Role, address: Address) -> bool {
        let Role::Admin = role;
        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::Admin(address))
            .unwrap_or(false)
    }

    // ---- Mutations ----

    /// Creates a round.
    pub fn create_round(env: Env, caller: Address, genre: Option<Genre>, seed: u64) -> u64 {
        caller.require_auth();
        let genre = match genre {
            Some(g) => g,
            None => panic_with_error!(env, Error::NonExistingGenre),
        };

        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let cards_count = Self::index_len(&env, &Index::All) as u64;
        let mut cards: Vec<u64> = Vec::new(&env);
        for idx in Self::get_random_numbers(&env, seed, amount, cards_count, true).iter() {
            cards.push_back(Self::index_get(&env, &Index::All, idx as u32));
        }

        let round_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RoundCount)
            .unwrap_or(0);
        let round_id = round_count + 1;
        env.storage()
            .instance()
            .set(&DataKey::RoundCount, &round_id);

        let round = Round {
            round_id,
            admin: caller.clone(),
            genre,
            wager_amount: 0,
            start_time: 0,
            is_started: false,
            is_completed: false,
            end_time: 0,
            next_card_index: 0,
            is_cancelled: false,
        };

        let mut players: Vec<Address> = Vec::new(&env);
        players.push_back(caller.clone());
        env.storage()
            .persistent()
            .set(&DataKey::RoundPlayers(round_id), &players);
        bump_persistent(&env, &DataKey::RoundPlayers(round_id));

        env.storage()
            .persistent()
            .set(&DataKey::RoundCards(round_id), &cards);
        bump_persistent(&env, &DataKey::RoundCards(round_id));

        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);
        bump_persistent(&env, &DataKey::Round(round_id));

        env.storage().persistent().set(
            &DataKey::RoundCreatedAt(round_id),
            &env.ledger().timestamp(),
        );

        let mut open = Self::read_open_rounds(&env);
        open.push_back(round_id);
        env.storage().persistent().set(&DataKey::OpenRounds, &open);
        bump_persistent(&env, &DataKey::OpenRounds);

        bump_instance(&env);

        RoundCreated {
            round_id,
            admin: caller,
            created_time: env.ledger().timestamp(),
        }
        .publish(&env);

        round_id
    }

    /// Starts round.
    pub fn start_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let mut round = Self::read_round(&env, round_id);
        if round.is_cancelled {
            panic_with_error!(env, Error::RoundCancelled);
        }

        let is_round_admin = round.admin == caller;
        let is_participant = Self::is_round_player(&env, round_id, &caller);
        if !is_round_admin && !is_participant {
            panic_with_error!(env, Error::NotAuthorized);
        }

        let ready_key = DataKey::RoundReady((round_id, caller.clone()));
        let already_ready: bool = env.storage().persistent().get(&ready_key).unwrap_or(false);
        if already_ready {
            panic_with_error!(env, Error::AlreadyReady);
        }

        let players = Self::read_round_players(&env, round_id);

        env.storage().persistent().set(&ready_key, &true);
        bump_persistent(&env, &ready_key);

        let ready_count_key = DataKey::RoundReadyCount(round_id);
        let ready_count: u32 = env
            .storage()
            .persistent()
            .get(&ready_count_key)
            .unwrap_or(0)
            + 1;
        env.storage()
            .persistent()
            .set(&ready_count_key, &ready_count);
        bump_persistent(&env, &ready_count_key);

        PlayerReady {
            round_id,
            player: caller,
            ready_time: env.ledger().timestamp(),
        }
        .publish(&env);

        // Increment total_rounds only when the round actually starts (all
        // players ready). Individual ready calls must not inflate the count,
        // and a round that never reaches ready_count == players.len() must
        // not change it.
        if ready_count == players.len() {
            for player in players.iter() {
                let mut stats = Self::get_player_stat(env.clone(), player.clone());
                stats.total_rounds += 1;
                env.storage()
                    .persistent()
                    .set(&DataKey::PlayerStats(player.clone()), &stats);
                bump_persistent(&env, &DataKey::PlayerStats(player));
            }

            let start_time = env.ledger().timestamp();
            round.start_time = start_time;
            round.end_time = start_time + DEFAULT_ROUND_DURATION_SECONDS;
            round.is_started = true;
            env.storage()
                .persistent()
                .set(&DataKey::Round(round_id), &round);
            bump_persistent(&env, &DataKey::Round(round_id));

            Self::remove_open_round(&env, round_id);

            bump_instance(&env);

            RoundStarted {
                round_id,
                admin: round.admin,
                start_time,
            }
            .publish(&env);
        }
    }

    /// Joins round.
    pub fn join_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let round = Self::read_round(&env, round_id);

        if Self::is_round_player(&env, round_id, &caller) {
            panic_with_error!(env, Error::RoundAlreadyJoined);
        }
        if round.is_cancelled {
            panic_with_error!(env, Error::RoundCancelled);
        }
        if round.is_started {
            panic_with_error!(env, Error::RoundAlreadyStarted);
        }

        let mut players = Self::read_round_players(&env, round_id);
        if players.len() >= Self::get_max_players(env.clone()) {
            panic_with_error!(env, Error::RoundFull);
        }
        players.push_back(caller.clone());
        env.storage()
            .persistent()
            .set(&DataKey::RoundPlayers(round_id), &players);
        bump_persistent(&env, &DataKey::RoundPlayers(round_id));

        RoundJoined {
            round_id,
            player: caller,
            joined_time: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    /// Leaves a round that hasn't started yet and refunds the caller's wager.
    /// The round admin can't leave; they cancel the round instead.
    pub fn leave_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let round = Self::read_round(&env, round_id);
        Self::assert_round_pending(&env, &round);
        if round.admin == caller {
            panic_with_error!(env, Error::NotAuthorized);
        }

        let mut players = Self::read_round_players(&env, round_id);
        let idx = players
            .first_index_of(&caller)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotAParticipant));
        players.remove(idx);
        env.storage()
            .persistent()
            .set(&DataKey::RoundPlayers(round_id), &players);

        let ready_key = DataKey::RoundReady((round_id, caller.clone()));
        if env.storage().persistent().get(&ready_key).unwrap_or(false) {
            env.storage().persistent().remove(&ready_key);
            let ready_count_key = DataKey::RoundReadyCount(round_id);
            let ready_count: u32 = env
                .storage()
                .persistent()
                .get(&ready_count_key)
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&ready_count_key, &ready_count.saturating_sub(1));
        }

        let refunded = Self::refund_wager(&env, &round, &caller);
        RoundLeft {
            round_id,
            player: caller,
            refunded,
        }
        .publish(&env);
    }

    /// Cancels a round that hasn't started and refunds every player. Callable
    /// by the round admin at any time before start, or by anyone once the
    /// lobby has been open for `LOBBY_TIMEOUT_SECONDS`.
    pub fn cancel_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let mut round = Self::read_round(&env, round_id);
        Self::assert_round_pending(&env, &round);

        if round.admin != caller {
            let created_at: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::RoundCreatedAt(round_id))
                .unwrap_or(0);
            if env.ledger().timestamp() < created_at + LOBBY_TIMEOUT_SECONDS {
                panic_with_error!(env, Error::NotAuthorized);
            }
        }

        round.is_cancelled = true;
        round.end_time = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);
        Self::remove_open_round(&env, round_id);

        let players = Self::read_round_players(&env, round_id);
        let mut refund_per_player = 0;
        for player in players.iter() {
            refund_per_player = Self::refund_wager(&env, &round, &player);
        }

        RoundCancelled {
            round_id,
            cancelled_by: caller,
            refunded_players: players,
            refund_per_player,
        }
        .publish(&env);
    }

    /// Advances to the next card.
    pub fn next_card(env: Env, round_id: u64) -> Card {
        let mut round = Self::read_round(&env, round_id);
        if !round.is_started {
            panic_with_error!(env, Error::RoundNotStarted);
        }
        if round.is_completed {
            panic_with_error!(env, Error::RoundCompleted);
        }

        let round_cards = Self::read_round_cards(&env, round_id);
        let card_id = round_cards
            .get(round.next_card_index)
            .unwrap_or_else(|| panic_with_error!(env, Error::RoundCompleted));
        let card = Self::get_card(env.clone(), card_id);

        CardDrawn {
            round_id,
            index: round.next_card_index,
            card_id,
        }
        .publish(&env);

        let started_at_key = DataKey::RoundCardStartedAt((round_id, card_id));
        env.storage()
            .persistent()
            .set(&started_at_key, &env.ledger().timestamp());
        bump_persistent(&env, &started_at_key);

        // The round is marked completed by `finalize_round`, so players can
        // still answer the last card after it is drawn.
        round.next_card_index += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);
        bump_persistent(&env, &DataKey::Round(round_id));

        card
    }

    /// Sets the cards per round.
    pub fn set_cards_per_round(env: Env, caller: Address, value: u32) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if value == 0 {
            panic_with_error!(env, Error::InvalidCardsPerRound);
        }
        env.storage()
            .instance()
            .set(&DataKey::CardsPerRound, &value);
        bump_instance(&env);
        CardsPerRoundUpdated { value }.publish(&env);
    }

    /// Adds a card and returns its id. The `card_id` field of `card` is
    /// ignored; the stored card carries the assigned id.
    pub fn add_card(env: Env, caller: Address, card: Card) -> u64 {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        Self::insert_card(&env, card)
    }

    /// Adds up to `MAX_CARDS_PER_BATCH` cards in one call and returns their
    /// ids in order. The whole batch fails if any card is invalid.
    pub fn add_cards(env: Env, caller: Address, cards: Vec<Card>) -> Vec<u64> {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if cards.len() > MAX_CARDS_PER_BATCH {
            panic_with_error!(env, Error::BatchTooLarge);
        }
        let mut ids: Vec<u64> = Vec::new(&env);
        for card in cards.iter() {
            ids.push_back(Self::insert_card(&env, card));
        }
        ids
    }

    /// Replaces the contents of `card_id`, moving it between the genre,
    /// artist and year indexes as needed.
    pub fn update_card(env: Env, caller: Address, card_id: u64, card: Card) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        let old = Self::get_card(env.clone(), card_id);
        Self::validate_card(&env, &card);

        let new_key = Self::card_key(&env, &card);
        if let Some(existing) = env
            .storage()
            .persistent()
            .get::<_, u64>(&DataKey::CardKey(new_key.clone()))
        {
            if existing != card_id {
                panic_with_error!(env, Error::DuplicateCard);
            }
        }

        let mut pos = Self::read_card_pos(&env, card_id);
        for index in Index::of(&old).iter().skip(1) {
            Self::index_remove(&env, index, *index.pos(&mut pos));
        }
        env.storage()
            .persistent()
            .remove(&DataKey::CardKey(Self::card_key(&env, &old)));

        let card = Card { card_id, ..card };
        for index in Index::of(&card).iter().skip(1) {
            *index.pos(&mut pos) = Self::index_push(&env, index, card_id);
        }
        env.storage()
            .persistent()
            .set(&DataKey::CardPos(card_id), &pos);
        env.storage()
            .persistent()
            .set(&DataKey::CardKey(new_key), &card_id);
        env.storage()
            .persistent()
            .set(&DataKey::Card(card_id), &card);

        CardUpdated {
            card_id,
            genre: card.genre,
        }
        .publish(&env);
    }

    /// Removes a card from storage and every index. Its id is not reused.
    pub fn remove_card(env: Env, caller: Address, card_id: u64) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        let card = Self::get_card(env.clone(), card_id);

        let mut pos = Self::read_card_pos(&env, card_id);
        for index in Index::of(&card).iter() {
            Self::index_remove(&env, index, *index.pos(&mut pos));
        }
        env.storage()
            .persistent()
            .remove(&DataKey::CardKey(Self::card_key(&env, &card)));
        env.storage()
            .persistent()
            .remove(&DataKey::CardPos(card_id));
        env.storage().persistent().remove(&DataKey::Card(card_id));

        CardRemoved { card_id }.publish(&env);
    }

    /// Owner-only. The owner may manage roles even after revoking their own
    /// admin flag, so they can never lock themselves out.
    pub fn set_role(env: Env, caller: Address, recipient: Address, role: Role, is_enable: bool) {
        caller.require_auth();
        Self::assert_owner(&env, &caller);
        let Role::Admin = role;
        env.storage()
            .instance()
            .set(&DataKey::Admin(recipient.clone()), &is_enable);
        bump_instance(&env);
        RoleUpdated {
            account: recipient,
            role,
            enabled: is_enable,
        }
        .publish(&env);
    }

    /// Returns the current owner.
    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    /// Returns the pending owner.
    pub fn pending_owner(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingOwner)
    }

    /// Returns the contract version.
    pub fn version() -> u32 {
        VERSION
    }

    /// Step one of an ownership transfer; `new_owner` must then call
    /// `accept_ownership`. Calling again replaces the pending owner.
    pub fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
        caller.require_auth();
        Self::assert_owner(&env, &caller);
        env.storage()
            .instance()
            .set(&DataKey::PendingOwner, &new_owner);
        OwnershipTransferStarted {
            owner: caller,
            pending_owner: new_owner,
        }
        .publish(&env);
    }

    /// Completes an ownership transfer and grants the new owner the admin
    /// role. The previous owner keeps any admin role they had.
    pub fn accept_ownership(env: Env, caller: Address) {
        caller.require_auth();
        if Self::pending_owner(env.clone()) != Some(caller.clone()) {
            panic_with_error!(env, Error::NotPendingOwner);
        }
        let old_owner = Self::owner(env.clone());
        env.storage().instance().set(&DataKey::Owner, &caller);
        env.storage().instance().remove(&DataKey::PendingOwner);
        env.storage()
            .instance()
            .set(&DataKey::Admin(caller.clone()), &true);
        OwnershipTransferred {
            old_owner,
            new_owner: caller,
        }
        .publish(&env);
    }

    /// Owner-only. Replaces this contract's code in place, keeping all
    /// storage.
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        caller.require_auth();
        Self::assert_owner(&env, &caller);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Submits a round answer.
    pub fn submit_answer(env: Env, caller: Address, round_id: u64, answer: Answer) -> bool {
        caller.require_auth();
        if !Self::is_round_player(&env, round_id, &caller) {
            panic_with_error!(env, Error::NotAParticipant);
        }

        let round = Self::read_round(&env, round_id);
        if !round.is_started {
            panic_with_error!(env, Error::RoundNotStarted);
        }
        if env
            .storage()
            .persistent()
            .get(&DataKey::RoundFinalized(round_id))
            .unwrap_or(false)
        {
            panic_with_error!(env, Error::RoundAlreadyFinalized);
        if round.is_completed || env.ledger().timestamp() >= round.end_time {
            panic_with_error!(env, Error::RoundCompleted);
        }
        if round.next_card_index == 0 {
            panic_with_error!(env, Error::RoundNotStarted);
        }

        let current_index = round.next_card_index - 1;
        let round_cards = Self::read_round_cards(&env, round_id);
        let current_card_id = round_cards.get(current_index).unwrap();
        let current_card = Self::get_card(env.clone(), current_card_id);

        let answered_key =
            DataKey::RoundPlayerAnswered((round_id, caller.clone(), current_card_id));
        if env
            .storage()
            .persistent()
            .get(&answered_key)
            .unwrap_or(false)
        {
            return false;
        }
        env.storage().persistent().set(&answered_key, &true);
        bump_persistent(&env, &answered_key);

        let answer_started_at: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCardStartedAt((round_id, current_card_id)))
            .unwrap_or(round.start_time);
        let answer_time = env.ledger().timestamp().saturating_sub(answer_started_at);
        let answer_times = Self::read_round_answer_times(&env, round_id);
        let mut answer_times = answer_times;
        let total_time = answer_times.get(caller.clone()).unwrap_or(0u64);
        answer_times.set(caller.clone(), total_time + answer_time);
        env.storage()
            .persistent()
            .set(&DataKey::RoundAnswerTimes(round_id), &answer_times);
        bump_persistent(&env, &DataKey::RoundAnswerTimes(round_id));

        // Answers after the card window are scored as wrong (not rejected),
        // so the player still counts as having answered the card.
        let is_answer_correct = answer_time <= CARD_ANSWER_WINDOW_SECONDS
            && match answer {
                Answer::Artist(value) => value == current_card.artist,
                Answer::Year(value) => value == current_card.year,
                Answer::Title(value) => value == current_card.title,
            };

        let points = if is_answer_correct {
            MAX_CORRECT_POINTS
                .saturating_sub(answer_time.saturating_mul(POINTS_DECAY_PER_SECOND))
                .max(MIN_CORRECT_POINTS)
        } else {
            0
        };

        let mut scores = Self::read_round_scores(&env, round_id);
        if is_answer_correct {
            let score = scores.get(caller.clone()).unwrap_or(0u64);
            scores.set(caller.clone(), score + points);
            env.storage()
                .persistent()
                .set(&DataKey::RoundScores(round_id), &scores);
            bump_persistent(&env, &DataKey::RoundScores(round_id));
        }

        let mut stats = Self::get_player_stat(env.clone(), caller.clone());
        if is_answer_correct {
            stats.current_streak += 1;
            if stats.current_streak > stats.max_streak {
                stats.max_streak = stats.current_streak;
            }
        } else {
            stats.current_streak = 0;
        }
        env.storage()
            .persistent()
            .set(&DataKey::PlayerStats(caller.clone()), &stats);
        bump_persistent(&env, &DataKey::PlayerStats(caller.clone()));

        AnswerSubmitted {
            round_id,
            player: caller,
            correct: is_answer_correct,
            points,
        }
        .publish(&env);

        is_answer_correct
    }

    /// Builds a question card.
    pub fn build_question_card(
        env: Env,
        card: Card,
        seed: u64,
        kind: QuestionKind,
    ) -> QuestionCard {
    /// Sets the max players.
    pub fn set_max_players(env: Env, caller: Address, value: u32) {
        caller.require_auth();
        Self::assert_owner(&env, &caller);
        if value < 2 {
            panic_with_error!(env, Error::InvalidMaxPlayers);
        }
        env.storage().instance().set(&DataKey::MaxPlayers, &value);
    }

    /// Sets the nft contract.
    pub fn set_nft_contract(env: Env, caller: Address, nft_contract: Address) {
        caller.require_auth();
        Self::assert_owner(&env, &caller);
        env.storage()
            .instance()
            .set(&DataKey::NftContract, &nft_contract);
    }

    /// Mints the NFT for `milestone` to `caller` through a cross-contract
    /// call. This contract must be the NFT contract's minter. Each milestone
    /// can be claimed once per player.
    pub fn claim_reward(env: Env, caller: Address, milestone: Milestone) -> u128 {
        caller.require_auth();
        let nft_contract = Self::get_nft_contract(env.clone())
            .unwrap_or_else(|| panic_with_error!(env, Error::NftContractNotSet));

        let claimed_key = DataKey::MilestoneClaimed((caller.clone(), milestone));
        if env.storage().persistent().has(&claimed_key) {
            panic_with_error!(env, Error::MilestoneAlreadyClaimed);
        }

        let stats = Self::get_player_stat(env.clone(), caller.clone());
        let reached = match milestone {
            Milestone::FirstWin => stats.rounds_won >= 1,
            Milestone::Streak5 => stats.max_streak >= 5,
            Milestone::TenWins => stats.rounds_won >= 10,
        };
        if !reached {
            panic_with_error!(env, Error::MilestoneNotReached);
        }

        env.storage().persistent().set(&claimed_key, &true);
        let token_id =
            NftClient::new(&env, &nft_contract).mint(&env.current_contract_address(), &caller);

        RewardClaimed {
            player: caller,
            milestone,
            token_id,
        }
        .publish(&env);

        token_id
    }

    /// Builds a question card.
    pub fn build_question_card(
        env: Env,
        card: Card,
        seed: u64,
        kind: QuestionKind,
    ) -> QuestionCard {
        let cards_count = Self::index_len(&env, &Index::All) as u64;

        match kind {
            QuestionKind::Title => Self::build_title_question(&env, card, seed, cards_count),
            QuestionKind::Artist => Self::build_artist_question(&env, card, seed, cards_count),
            QuestionKind::Year => Self::build_year_question(&env, card, seed),
        }
    }

    // ---- build_question_card helpers ----

    fn build_title_question(env: &Env, card: Card, seed: u64, cards_count: u64) -> QuestionCard {
        let random_idxs =
            Self::get_random_numbers(env, seed, cards_count.min(10), cards_count, true);

        let mut false_answers: Vec<String> = Vec::new(env);
        for idx in random_idxs.iter() {
        let correct = card.title.clone();
        Self::build_options_question(
            env,
            card,
            seed,
            cards_count,
            QuestionKind::Title,
            correct,
            |candidate: &Card| candidate.title.clone(),
        )
    }

    fn build_artist_question(env: &Env, card: Card, seed: u64, cards_count: u64) -> QuestionCard {
        let correct = card.artist.clone();
        Self::build_options_question(
            env,
            card,
            seed,
            cards_count,
            QuestionKind::Artist,
            correct,
            |candidate: &Card| candidate.artist.clone(),
        )
    }

    /// Builds a multiple-choice card from the correct value plus three distinct
    /// distractor values drawn from the card catalogue.
    ///
    /// LF-010: instead of requesting a fixed 10 random ids (which panics with
    /// `AmountExceedsLimit` on small catalogues) and reseeding forever until 3
    /// distinct distractors show up (which burns the whole CPU budget when the
    /// catalogue has fewer than 4 distinct values), we walk the shuffled
    /// catalogue in bounded windows:
    ///
    /// * Each attempt inspects at most `min(10, cards_count)` candidates.
    /// * Same-genre cards are consulted first so the wrong options stay
    ///   plausible (they sound like the correct card).
    /// * Every card is examined at most once across all attempts, so the loop
    ///   always terminates; if fewer than 4 distinct values exist in the whole
    ///   catalogue the call fails with `NotEnoughDistinctCards` instead.
    fn build_options_question(
        env: &Env,
        card: Card,
        seed: u64,
        cards_count: u64,
        kind: QuestionKind,
        correct: String,
        get_value: impl Fn(&Card) -> String,
    ) -> QuestionCard {
        let candidates = Self::distractor_candidate_ids(env, &card, seed, cards_count);
        let total = candidates.len() as u64;
        let sample = core::cmp::min(MAX_DISTRACTOR_SAMPLE, total);
        let max_attempts = if sample == 0 {
            0
        } else {
            total.div_ceil(sample)
        };

        let mut false_answers: Vec<String> = Vec::new(env);
        let mut attempt: u64 = 0;
        while false_answers.len() < 3 && attempt < max_attempts {
            let start = attempt * sample;
            let mut seen: u64 = 0;
            while false_answers.len() < 3 && seen < sample {
                let id = candidates.get((start + seen) as u32).unwrap();
                let value = get_value(&Self::get_card(env.clone(), id));
                if value != correct && !Self::contains_string(&false_answers, &value) {
                    false_answers.push_back(value);
                }
                seen += 1;
        for id in random_ids.iter() {
            if false_answers.len() >= 3 {
                break;
            }
            let id = Self::index_get(env, &Index::All, idx as u32);
            let candidate = Self::get_card(env.clone(), id);
            if candidate.title != card.title
                && !Self::contains_string(&false_answers, &candidate.title)
            {
                false_answers.push_back(candidate.title.clone());
            }
            attempt += 1;
        }
        if false_answers.len() < 3 {
            panic_with_error!(env, Error::NotEnoughDistinctCards);

        let mut extra_seed = seed + 1;
        while false_answers.len() < 3 {
            let idxs = Self::get_random_numbers(env, extra_seed, 1, cards_count, true);
            let id = Self::index_get(env, &Index::All, idxs.get(0).unwrap() as u32);
            let candidate = Self::get_card(env.clone(), id);
            if candidate.title != card.title
                && !Self::contains_string(&false_answers, &candidate.title)
            {
                false_answers.push_back(candidate.title.clone());
            }
            extra_seed += 1;
        }

        let mut options: Vec<String> = Vec::new(env);
        options.push_back(correct);
        for answer in false_answers.iter() {
            options.push_back(answer.clone());
        }

        let shuffled = Self::shuffle_strings(env, options, seed);

        QuestionCard {
            lyric: card.lyrics.clone(),
            timestamp: env.ledger().timestamp(),
            kind,
            option_one: shuffled.get(0).unwrap(),
            option_two: shuffled.get(1).unwrap(),
            option_three: shuffled.get(2).unwrap(),
            option_four: shuffled.get(3).unwrap(),
        }
    }

    fn build_artist_question(env: &Env, card: Card, seed: u64, cards_count: u64) -> QuestionCard {
        let random_idxs =
            Self::get_random_numbers(env, seed, cards_count.min(10), cards_count, true);

        let mut false_answers: Vec<String> = Vec::new(env);
        for idx in random_idxs.iter() {
            if false_answers.len() >= 3 {
                break;
            }
            let id = Self::index_get(env, &Index::All, idx as u32);
            let candidate = Self::get_card(env.clone(), id);
            if candidate.artist != card.artist
                && !Self::contains_string(&false_answers, &candidate.artist)
            {
                false_answers.push_back(candidate.artist.clone());
            }
        }

        let mut extra_seed = seed + 1;
        while false_answers.len() < 3 {
            let idxs = Self::get_random_numbers(env, extra_seed, 1, cards_count, true);
            let id = Self::index_get(env, &Index::All, idxs.get(0).unwrap() as u32);
            let candidate = Self::get_card(env.clone(), id);
            if candidate.artist != card.artist
                && !Self::contains_string(&false_answers, &candidate.artist)
            {
                false_answers.push_back(candidate.artist.clone());
    /// Ordered card ids used to pick distractors for `card`: same-genre cards
    /// (shuffled with `seed`) first so wrong options stay plausible, then every
    /// remaining card (shuffled with a derived seed). Each card appears exactly
    /// once, so a question can always be answered — or fail with
    /// `NotEnoughDistinctCards` — without ever looping.
    fn distractor_candidate_ids(env: &Env, card: &Card, seed: u64, cards_count: u64) -> Vec<u64> {
        let genre_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::GenreCards(card.genre))
            .unwrap_or(Vec::new(env));
        let genre_len = genre_ids.len() as u64;

        let mut candidates: Vec<u64> = Vec::new(env);

        if genre_len > 0 {
            let indices = Self::get_random_numbers(env, seed, genre_len, genre_len, true);
            for idx in indices.iter() {
                candidates.push_back(genre_ids.get(idx as u32).unwrap());
            }
        }

        let shuffled_all = Self::get_random_numbers(env, seed + 1, cards_count, cards_count, false);
        for id in shuffled_all.iter() {
            if !genre_ids.contains(&id) {
                candidates.push_back(id);
            }
        }
        candidates
    }

    /// Year distractors: pick 6 random offsets in the range [-5, +5] \ {0},
    /// deduplicate, and take the first 3. Year options are stored as their
    /// decimal string representation so they fit into the same `Vec<String>`
    /// shuffle as Title and Artist questions.
    fn build_year_question(env: &Env, card: Card, seed: u64) -> QuestionCard {
        // Generate offsets deterministically from the seed.
        let offsets: [i64; 10] = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
        let mut current_seed = seed;
        // Fisher-Yates shuffle of the offsets array using the LCG.
        let mut shuffled_offsets = offsets;
        let mut j = 10usize;
        while j > 1 {
            j -= 1;
            current_seed =
                current_seed.wrapping_mul(1664525).wrapping_add(1013904223) % 0xFFFF_FFFFu64;
            let rand_idx = (current_seed % (j as u64 + 1)) as usize;
            shuffled_offsets.swap(j, rand_idx);
        }

        let correct_year = card.year as i64;
        let mut false_years: Vec<String> = Vec::new(env);
        for &offset in shuffled_offsets.iter() {
            if false_years.len() >= 3 {
                break;
            }
            let candidate_year = correct_year + offset;
            if candidate_year > 0 {
                let year_str = Self::u64_to_string(env, candidate_year as u64);
                if !Self::contains_string(&false_years, &year_str) {
                    false_years.push_back(year_str);
                }
            }
        }

        let correct_str = Self::u64_to_string(env, card.year);
        let mut options: Vec<String> = Vec::new(env);
        options.push_back(correct_str);
        for y in false_years.iter() {
            options.push_back(y.clone());
        }

        let shuffled = Self::shuffle_strings(env, options, seed);

        QuestionCard {
            lyric: card.lyrics.clone(),
            timestamp: env.ledger().timestamp(),
            kind: QuestionKind::Year,
            option_one: shuffled.get(0).unwrap(),
            option_two: shuffled.get(1).unwrap(),
            option_three: shuffled.get(2).unwrap(),
            option_four: shuffled.get(3).unwrap(),
        }
    }

    // ---- Internal helpers ----

    fn validate_card(env: &Env, card: &Card) {
        if card.title.is_empty() {
            panic_with_error!(env, Error::InvalidCardTitle);
        }
        if card.artist.is_empty() {
            panic_with_error!(env, Error::InvalidCardArtist);
        }
        if card.lyrics.is_empty() {
            panic_with_error!(env, Error::InvalidCardLyrics);
        }
        if card.lyrics.len() > MAX_LYRICS_LEN {
            panic_with_error!(env, Error::LyricsTooLong);
        }
        let current_year = 1970 + env.ledger().timestamp() / SECONDS_PER_YEAR;
        if card.year < MIN_CARD_YEAR || card.year > current_year {
            panic_with_error!(env, Error::InvalidCardYear);
        }
    }

    /// Identity of a card for duplicate detection: sha256(title, 0x00, artist).
    fn card_key(env: &Env, card: &Card) -> BytesN<32> {
        let mut buf = card.title.to_bytes();
        buf.push_back(0);
        buf.append(&card.artist.to_bytes());
        env.crypto().sha256(&buf).into()
    }

    fn insert_card(env: &Env, card: Card) -> u64 {
        Self::validate_card(env, &card);
        let key = Self::card_key(env, &card);
        if env
            .storage()
            .persistent()
            .has(&DataKey::CardKey(key.clone()))
        {
            panic_with_error!(env, Error::DuplicateCard);
        }

        let card_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastCardId)
            .unwrap_or(0)
            + 1;
        env.storage().instance().set(&DataKey::LastCardId, &card_id);

        let card = Card { card_id, ..card };
        let mut pos = CardPos {
            all: 0,
            genre: 0,
            artist: 0,
            year: 0,
        };
        for index in Index::of(&card).iter() {
            *index.pos(&mut pos) = Self::index_push(env, index, card_id);
        }
        env.storage()
            .persistent()
            .set(&DataKey::CardPos(card_id), &pos);
        env.storage()
            .persistent()
            .set(&DataKey::CardKey(key), &card_id);
        env.storage()
            .persistent()
            .set(&DataKey::Card(card_id), &card);

        CardAdded {
            card_id,
            genre: card.genre,
        }
        .publish(env);
        card_id
    }

    fn read_card_pos(env: &Env, card_id: u64) -> CardPos {
        env.storage()
            .persistent()
            .get(&DataKey::CardPos(card_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard))
    }

    fn index_len(env: &Env, index: &Index) -> u32 {
        env.storage()
            .persistent()
            .get(&index.count_key())
            .unwrap_or(0)
    }

    fn index_get(env: &Env, index: &Index, i: u32) -> u64 {
        env.storage()
            .persistent()
            .get(&index.at_key(i))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard))
    }

    /// Appends `card_id` and returns its position.
    fn index_push(env: &Env, index: &Index, card_id: u64) -> u32 {
        let len = Self::index_len(env, index);
        env.storage().persistent().set(&index.at_key(len), &card_id);
        env.storage()
            .persistent()
            .set(&index.count_key(), &(len + 1));
        len
    }

    /// Swap-removes the entry at `pos`, updating the position of the card
    /// that moves into the gap.
    fn index_remove(env: &Env, index: &Index, pos: u32) {
        let last = Self::index_len(env, index) - 1;
        if pos != last {
            let moved = Self::index_get(env, index, last);
            env.storage().persistent().set(&index.at_key(pos), &moved);
            let mut moved_pos = Self::read_card_pos(env, moved);
            *index.pos(&mut moved_pos) = pos;
            env.storage()
                .persistent()
                .set(&DataKey::CardPos(moved), &moved_pos);
        }
        env.storage().persistent().remove(&index.at_key(last));
        env.storage().persistent().set(&index.count_key(), &last);
    }

    fn draw_cards(env: &Env, index: &Index, seed: u64, empty: Error) -> Vec<Card> {
        let limit = Self::index_len(env, index) as u64;
        if limit == 0 {
            panic_with_error!(env, empty);
        }
        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let mut cards: Vec<Card> = Vec::new(env);
        for idx in Self::get_random_numbers(env, seed, amount, limit, true).iter() {
            let card_id = Self::index_get(env, index, idx as u32);
            cards.push_back(Self::get_card(env.clone(), card_id));
        }
        cards
    }

    fn read_round(env: &Env, round_id: u64) -> Round {
        let round: Round = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingRound));
        bump_persistent(env, &DataKey::Round(round_id));
        round
    }

    fn read_round_cards(env: &Env, round_id: u64) -> Vec<u64> {
        let cards = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCards(round_id))
            .unwrap_or(Vec::new(env));
        bump_persistent(env, &DataKey::RoundCards(round_id));
        cards
    }

    fn read_round_players(env: &Env, round_id: u64) -> Vec<Address> {
        let players = env
            .storage()
            .persistent()
            .get(&DataKey::RoundPlayers(round_id))
            .unwrap_or(Vec::new(env));
        bump_persistent(env, &DataKey::RoundPlayers(round_id));
        players
    }

    fn read_round_scores(env: &Env, round_id: u64) -> Map<Address, u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundScores(round_id))
            .unwrap_or(Map::new(env))
    }

    fn read_round_answer_times(env: &Env, round_id: u64) -> Map<Address, u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundAnswerTimes(round_id))
            .unwrap_or(Map::new(env))
    }

    fn are_all_required_answers_submitted(env: &Env, round_id: u64) -> bool {
        let players = Self::read_round_players(env, round_id);
        let round_cards = Self::read_round_cards(env, round_id);
        if players.is_empty() || round_cards.is_empty() {
            return false;
        }

        for player in players.iter() {
            for card_id in round_cards.iter() {
                let answered: bool = env
                    .storage()
                    .persistent()
                    .get(&DataKey::RoundPlayerAnswered((
                        round_id,
                        player.clone(),
                        card_id,
                    )))
                    .unwrap_or(false);
                if !answered {
                    return false;
                }
            }
        }

        true
    }

    fn determine_round_winners(env: &Env, round_id: u64) -> Vec<Address> {
        let players = Self::read_round_players(env, round_id);
        let scores = Self::read_round_scores(env, round_id);
        let answer_times = Self::read_round_answer_times(env, round_id);

        let mut winners: Vec<Address> = Vec::new(env);
        let mut max_score: u64 = 0;
        let mut best_time: Option<u64> = None;

        for player in players.iter() {
            let score = scores.get(player.clone()).unwrap_or(0u64);
            if score == 0 && max_score == 0 && winners.len() == 0 {
                continue;
            }

            if score > max_score {
                max_score = score;
                winners = Vec::new(env);
                winners.push_back(player.clone());
                best_time = Some(answer_times.get(player.clone()).unwrap_or(0u64));
                continue;
            }

            if score != max_score {
                continue;
            }

            let time = answer_times.get(player.clone()).unwrap_or(0u64);
            match best_time {
                Some(current_best) => {
                    if time < current_best {
                        winners = Vec::new(env);
                        winners.push_back(player.clone());
                        best_time = Some(time);
                    } else if time == current_best {
                        winners.push_back(player.clone());
                    }
                }
                None => {
                    winners.push_back(player.clone());
                    best_time = Some(time);
                }
            }
        }

        if max_score == 0 {
            winners = Vec::new(env);
        }
        winners
    }

    fn read_open_rounds(env: &Env) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OpenRounds)
            .unwrap_or(Vec::new(env))
    }

    fn is_round_player(env: &Env, round_id: u64, player: &Address) -> bool {
        let players = Self::read_round_players(env, round_id);
        for p in players.iter() {
            if p == *player {
                return true;
            }
        }
        false
    }

    fn remove_open_round(env: &Env, round_id: u64) {
        let mut open = Self::read_open_rounds(env);
        if let Some(idx) = open.first_index_of(round_id) {
            open.remove(idx);
            env.storage().persistent().set(&DataKey::OpenRounds, &open);
        }
    }

    fn assert_round_pending(env: &Env, round: &Round) {
        if round.is_cancelled {
            panic_with_error!(env, Error::RoundCancelled);
        }
        if round.is_started {
            panic_with_error!(env, Error::RoundAlreadyStarted);
        }
    }

    /// Returns the wager refunded to `player`. Wagers are not escrowed yet
    /// (see LF-013), so this only reports `round.wager_amount`; once escrow
    /// lands, the token transfer back to `player` belongs here.
    fn refund_wager(_env: &Env, round: &Round, _player: &Address) -> i128 {
        round.wager_amount
    }

    fn assert_owner(env: &Env, address: &Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if *address != owner {
            panic_with_error!(env, Error::NotAuthorized);
        }
    }

    fn assert_admin(env: &Env, address: &Address) {
        let is_admin: bool = env
            .storage()
            .instance()
            .get(&DataKey::Admin(address.clone()))
            .unwrap_or(false);
        if !is_admin {
            panic_with_error!(env, Error::NotAuthorized);
        }
    }

    /// Converts a `u64` year value to its decimal string representation.
    /// Soroban's `no_std` environment has no format!/write! macros, so we
    /// build the string manually by repeated division.
    fn u64_to_string(env: &Env, mut n: u64) -> String {
        if n == 0 {
            return String::from_str(env, "0");
        }
        // Collect digits in reverse.
        let mut digits: [u8; 20] = [0u8; 20];
        let mut len = 0usize;
        while n > 0 {
            digits[len] = b'0' + (n % 10) as u8;
            n /= 10;
            len += 1;
        }
        // Reverse into a fixed-size array and build a `&str`.
        let mut buf: [u8; 20] = [0u8; 20];
        for i in 0..len {
            buf[i] = digits[len - 1 - i];
        }
        // SAFETY: all bytes are ASCII digits.
        let s = core::str::from_utf8(&buf[..len]).unwrap_or("0");
        String::from_str(env, s)
    }

    fn contains_string(v: &Vec<String>, target: &String) -> bool {
        for item in v.iter() {
            if item == *target {
                return true;
            }
        }
        false
    }

    /// Fisher-Yates shuffle over a small (4-element) options list, mirroring
    /// `shuffle_array` in the Cairo contract.
    fn shuffle_strings(env: &Env, arr: Vec<String>, seed: u64) -> Vec<String> {
        let mut result = arr;
        let mut current_seed = seed;
        let mut j = result.len();
        while j > 1 {
            j -= 1;
            current_seed =
                current_seed.wrapping_mul(1664525).wrapping_add(1013904223) % 0xFFFF_FFFFu64;
            let rand_idx = (current_seed % (j as u64 + 1)) as u32;
            if j != rand_idx {
                let a = result.get(j).unwrap();
                let b = result.get(rand_idx).unwrap();
                result.set(j, b);
                result.set(rand_idx, a);
            }
        }
        let _ = env;
        result
    }

    /// LF-011 fix: partial Fisher-Yates shuffle — O(limit) with no
    /// deduplication loop.
    ///
    /// Builds an index array `[0, 1, …, limit-1]`, performs a single-pass
    /// Fisher-Yates shuffle seeded from `(seed, ledger_sequence,
    /// ledger_timestamp)`, and returns the first `amount` elements. This
    /// replaces the old SHA-256 + dedup loop which had coupon-collector
    /// worst-case cost when `amount ≈ limit`.
    ///
    /// `for_index`: when `false` the results are shifted by +1 so they
    /// become 1-based card IDs instead of 0-based array indices (mirrors the
    /// same offset used by the old implementation).
    fn get_random_numbers(
        env: &Env,
        seed: u64,
        amount: u64,
        limit: u64,
        for_index: bool,
    ) -> Vec<u64> {
        if amount > limit {
            panic_with_error!(env, Error::AmountExceedsLimit);
        }
        if limit == 0 {
            panic_with_error!(env, Error::LimitMustBeGreaterThanZero);
        }

        // Build a compact index array [0..limit).
        let mut indices: Vec<u64> = Vec::new(env);
        for i in 0..limit {
            indices.push_back(i);
        }

        // Seed an LCG from the on-chain entropy.
        // Using the same 32-byte SHA-256 block as before, but only once.
        let sequence = env.ledger().sequence() as u64;
        let timestamp = env.ledger().timestamp();
        let mut buf = [0u8; 32];
        buf[0..8].copy_from_slice(&seed.to_be_bytes());
        buf[8..16].copy_from_slice(&sequence.to_be_bytes());
        buf[16..24].copy_from_slice(&timestamp.to_be_bytes());
        // last 8 bytes left zero — distinguishes this from per-iteration hashes
        let bytes = Bytes::from_array(env, &buf);
        let hash = env.crypto().sha256(&bytes).to_array();
        let mut rng_state = u64::from_be_bytes([
            hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7],
        ]);

        // Partial Fisher-Yates: shuffle only the first `amount` positions.
        // Iteration i swaps indices[i] with a random position in [i, limit).
        let mut i: u32 = 0;
        while (i as u64) < amount {
            // LCG step (Numerical Recipes constants, same as shuffle_strings).
            rng_state = rng_state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let range = limit - (i as u64);
            let j = (i as u64) + (rng_state % range);
            // swap indices[i] and indices[j]
            let a = indices.get(i).unwrap();
            let b = indices.get(j as u32).unwrap();
            indices.set(i, b);
            indices.set(j as u32, a);
            i += 1;
        }

        // Collect the first `amount` shuffled indices, applying the +1 offset
        // when the caller wants 1-based card IDs.
        let mut result: Vec<u64> = Vec::new(env);
        for k in 0..(amount as u32) {
            let v = indices.get(k).unwrap();
            result.push_back(if for_index { v } else { v + 1 });
        }
        result
    }
}

