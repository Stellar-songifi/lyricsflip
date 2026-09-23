#![no_std]

mod errors;
mod events;
mod types;

#[cfg(test)]
mod test;

pub use errors::Error;
pub use events::{PlayerReady, RoundCreated, RoundJoined, RoundStarted};
pub use types::{Answer, Card, DataKey, Genre, PlayerStats, QuestionCard, Role, Round};

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Bytes, Env, String, Vec};

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
    }

    // ---- Views ----

    pub fn get_round(env: Env, round_id: u64) -> Round {
        Self::read_round(&env, round_id)
    }

    pub fn get_round_cards(env: Env, round_id: u64) -> Vec<u64> {
        Self::read_round_cards(&env, round_id)
    }

    pub fn get_round_players(env: Env, round_id: u64) -> Vec<Address> {
        Self::read_round_players(&env, round_id)
    }

    pub fn get_players_round_count(env: Env, round_id: u64) -> u32 {
        Self::read_round_players(&env, round_id).len()
    }

    pub fn get_cards_per_round(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::CardsPerRound)
            .unwrap_or(0)
    }

    pub fn get_card(env: Env, card_id: u64) -> Card {
        env.storage()
            .persistent()
            .get(&DataKey::Card(card_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard))
    }

    pub fn get_cards_of_genre(env: Env, genre: Genre, seed: u64) -> Vec<Card> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::GenreCards(genre))
            .unwrap_or(Vec::new(&env));
        let limit = ids.len() as u64;
        if limit == 0 {
            panic_with_error!(env, Error::EmptyGenreCards);
        }
        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let indices = Self::get_random_numbers(&env, seed, amount, limit, true);

        let mut cards: Vec<Card> = Vec::new(&env);
        for idx in indices.iter() {
            let card_id = ids.get(idx as u32).unwrap();
            cards.push_back(Self::get_card(env.clone(), card_id));
        }
        cards
    }

    pub fn get_cards_of_artist(env: Env, artist: String, seed: u64) -> Vec<Card> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::ArtistCards(artist))
            .unwrap_or(Vec::new(&env));
        let limit = ids.len() as u64;
        if limit == 0 {
            panic_with_error!(env, Error::ArtistCardsIsZero);
        }
        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let indices = Self::get_random_numbers(&env, seed, amount, limit, true);

        let mut cards: Vec<Card> = Vec::new(&env);
        for idx in indices.iter() {
            let card_id = ids.get(idx as u32).unwrap();
            cards.push_back(Self::get_card(env.clone(), card_id));
        }
        cards
    }

    pub fn get_cards_of_a_year(env: Env, year: u64, seed: u64) -> Vec<Card> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::YearCards(year))
            .unwrap_or(Vec::new(&env));
        let limit = ids.len() as u64;
        if limit == 0 {
            panic_with_error!(env, Error::EmptyYearCards);
        }
        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let indices = Self::get_random_numbers(&env, seed, amount, limit, true);

        let mut cards: Vec<Card> = Vec::new(&env);
        for idx in indices.iter() {
            let card_id = ids.get(idx as u32).unwrap();
            cards.push_back(Self::get_card(env.clone(), card_id));
        }
        cards
    }

    pub fn get_player_stat(env: Env, player: Address) -> PlayerStats {
        env.storage()
            .persistent()
            .get(&DataKey::PlayerStats(player))
            .unwrap_or(PlayerStats::zero())
    }

    pub fn is_admin(env: Env, role: Role, address: Address) -> bool {
        let Role::Admin = role;
        env.storage()
            .instance()
            .get(&DataKey::Admin(address))
            .unwrap_or(false)
    }

    // ---- Mutations ----

    pub fn create_round(env: Env, caller: Address, genre: Option<Genre>, seed: u64) -> u64 {
        caller.require_auth();
        let genre = match genre {
            Some(g) => g,
            None => panic_with_error!(env, Error::NonExistingGenre),
        };

        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let cards_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CardsCount)
            .unwrap_or(0);
        let cards = Self::get_random_numbers(&env, seed, amount, cards_count, false);

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
        };

        let mut players: Vec<Address> = Vec::new(&env);
        players.push_back(caller.clone());
        env.storage()
            .persistent()
            .set(&DataKey::RoundPlayers(round_id), &players);
        env.storage()
            .persistent()
            .set(&DataKey::RoundCards(round_id), &cards);
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);

        RoundCreated {
            round_id,
            admin: caller,
            created_time: env.ledger().timestamp(),
        }
        .publish(&env);

        round_id
    }

    pub fn start_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let mut round = Self::read_round(&env, round_id);

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
        for player in players.iter() {
            let mut stats = Self::get_player_stat(env.clone(), player.clone());
            stats.total_rounds += 1;
            env.storage()
                .persistent()
                .set(&DataKey::PlayerStats(player), &stats);
        }

        env.storage().persistent().set(&ready_key, &true);

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

        PlayerReady {
            round_id,
            player: caller,
            ready_time: env.ledger().timestamp(),
        }
        .publish(&env);

        if ready_count == players.len() {
            let start_time = env.ledger().timestamp();
            round.start_time = start_time;
            round.is_started = true;
            env.storage()
                .persistent()
                .set(&DataKey::Round(round_id), &round);

            RoundStarted {
                round_id,
                admin: round.admin,
                start_time,
            }
            .publish(&env);
        }
    }

    pub fn join_round(env: Env, caller: Address, round_id: u64) {
        caller.require_auth();
        let round = Self::read_round(&env, round_id);

        if Self::is_round_player(&env, round_id, &caller) {
            panic_with_error!(env, Error::RoundAlreadyJoined);
        }
        if round.is_started {
            panic_with_error!(env, Error::RoundAlreadyStarted);
        }

        let mut players = Self::read_round_players(&env, round_id);
        players.push_back(caller.clone());
        env.storage()
            .persistent()
            .set(&DataKey::RoundPlayers(round_id), &players);

        RoundJoined {
            round_id,
            player: caller,
            joined_time: env.ledger().timestamp(),
        }
        .publish(&env);
    }

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

        round.next_card_index += 1;
        if round.next_card_index >= round_cards.len() {
            round.is_completed = true;
        }
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);

        card
    }

    pub fn set_cards_per_round(env: Env, caller: Address, value: u32) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if value == 0 {
            panic_with_error!(env, Error::InvalidCardsPerRound);
        }
        env.storage()
            .instance()
            .set(&DataKey::CardsPerRound, &value);
    }

    pub fn add_card(env: Env, caller: Address, card: Card) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let cards_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CardsCount)
            .unwrap_or(0);
        let card_id = cards_count + 1;

        let mut artist_cards: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::ArtistCards(card.artist.clone()))
            .unwrap_or(Vec::new(&env));
        artist_cards.push_back(card_id);
        env.storage()
            .persistent()
            .set(&DataKey::ArtistCards(card.artist.clone()), &artist_cards);

        let mut genre_cards: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::GenreCards(card.genre))
            .unwrap_or(Vec::new(&env));
        genre_cards.push_back(card_id);
        env.storage()
            .persistent()
            .set(&DataKey::GenreCards(card.genre), &genre_cards);

        let mut year_cards: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::YearCards(card.year))
            .unwrap_or(Vec::new(&env));
        year_cards.push_back(card_id);
        env.storage()
            .persistent()
            .set(&DataKey::YearCards(card.year), &year_cards);

        env.storage()
            .persistent()
            .set(&DataKey::Card(card_id), &card);
        env.storage().instance().set(&DataKey::CardsCount, &card_id);
    }

    pub fn set_role(env: Env, caller: Address, recipient: Address, role: Role, is_enable: bool) {
        caller.require_auth();
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if caller != owner {
            panic_with_error!(env, Error::NotAuthorized);
        }
        Self::assert_admin(&env, &caller);
        let Role::Admin = role;
        env.storage()
            .instance()
            .set(&DataKey::Admin(recipient), &is_enable);
    }

    pub fn submit_answer(env: Env, caller: Address, round_id: u64, answer: Answer) -> bool {
        caller.require_auth();
        if !Self::is_round_player(&env, round_id, &caller) {
            panic_with_error!(env, Error::NotAParticipant);
        }

        let round = Self::read_round(&env, round_id);
        if !round.is_started {
            panic_with_error!(env, Error::RoundNotStarted);
        }
        if round.is_completed {
            panic_with_error!(env, Error::RoundCompleted);
        }

        let current_index = round.next_card_index - 1;
        let round_cards = Self::read_round_cards(&env, round_id);
        let current_card_id = round_cards.get(current_index).unwrap();
        let current_card = Self::get_card(env.clone(), current_card_id);

        let is_answer_correct = match answer {
            Answer::Artist(value) => value == current_card.artist,
            Answer::Year(value) => value == current_card.year,
            Answer::Title(value) => value == current_card.title,
        };

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
            .set(&DataKey::PlayerStats(caller), &stats);

        is_answer_correct
    }

    pub fn build_question_card(env: Env, card: Card, seed: u64) -> QuestionCard {
        let cards_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CardsCount)
            .unwrap_or(0);
        let random_ids = Self::get_random_numbers(&env, seed, 10, cards_count, false);

        let mut false_answers: Vec<String> = Vec::new(&env);
        for id in random_ids.iter() {
            if false_answers.len() >= 3 {
                break;
            }
            let candidate = Self::get_card(env.clone(), id);
            if candidate.title != card.title
                && !Self::contains_string(&false_answers, &candidate.title)
            {
                false_answers.push_back(candidate.title.clone());
            }
        }

        let mut extra_seed = seed + 1;
        while false_answers.len() < 3 {
            let ids = Self::get_random_numbers(&env, extra_seed, 1, cards_count, false);
            let id = ids.get(0).unwrap();
            let candidate = Self::get_card(env.clone(), id);
            if candidate.title != card.title
                && !Self::contains_string(&false_answers, &candidate.title)
            {
                false_answers.push_back(candidate.title.clone());
            }
            extra_seed += 1;
        }

        let mut options: Vec<String> = Vec::new(&env);
        options.push_back(card.title.clone());
        for answer in false_answers.iter() {
            options.push_back(answer.clone());
        }

        let shuffled = Self::shuffle_strings(&env, options, seed);

        QuestionCard {
            lyric: card.lyrics.clone(),
            timestamp: env.ledger().timestamp(),
            option_one: shuffled.get(0).unwrap(),
            option_two: shuffled.get(1).unwrap(),
            option_three: shuffled.get(2).unwrap(),
            option_four: shuffled.get(3).unwrap(),
        }
    }

    // ---- Internal helpers ----

    fn read_round(env: &Env, round_id: u64) -> Round {
        env.storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingRound))
    }

    fn read_round_cards(env: &Env, round_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundCards(round_id))
            .unwrap_or(Vec::new(env))
    }

    fn read_round_players(env: &Env, round_id: u64) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundPlayers(round_id))
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

    /// Ported from `_get_random_numbers` in the Cairo contract, reworked
    /// (LF-011) as a partial Fisher-Yates shuffle: the old version hashed
    /// candidates and retried on collision, which degenerates into an
    /// unbounded loop (coupon-collector) when `amount` approaches `limit`
    /// and can blow the transaction budget. This version builds `0..limit`
    /// once, then shuffles only the first `amount` positions, so the work
    /// is `O(limit)` with exactly `amount` hashes.
    ///
    /// Entropy per swap hashes `(seed, ledger sequence, ledger timestamp,
    /// draw)` exactly like before, preserving determinism for a given
    /// ledger state. `for_index` mirrors the same +1 offset used when the
    /// numbers are card IDs rather than array indices.
    fn draw_u64(env: &Env, seed: u64, sequence: u64, timestamp: u64, draw: u64) -> u64 {
        let mut buf = [0u8; 32];
        buf[0..8].copy_from_slice(&seed.to_be_bytes());
        buf[8..16].copy_from_slice(&sequence.to_be_bytes());
        buf[16..24].copy_from_slice(&timestamp.to_be_bytes());
        buf[24..32].copy_from_slice(&draw.to_be_bytes());
        let bytes = Bytes::from_array(env, &buf);
        let hash = env.crypto().sha256(&bytes).to_array();

        let mut num_bytes = [0u8; 8];
        num_bytes.copy_from_slice(&hash[0..8]);
        u64::from_be_bytes(num_bytes)
    }

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

        let sequence = env.ledger().sequence() as u64;
        let timestamp = env.ledger().timestamp();

        // Pool holds `0..limit`; only the first `amount` slots are shuffled
        // into place (partial Fisher-Yates).
        let mut pool: Vec<u64> = Vec::new(env);
        let mut k: u64 = 0;
        while k < limit {
            pool.push_back(k);
            k += 1;
        }

        let mut drawn: u64 = 0;
        let mut i: u64 = 0;
        while i < amount {
            let remaining = limit - i;
            let r = Self::draw_u64(env, seed, sequence, timestamp, drawn) % remaining;
            drawn += 1;
            let swap_idx = (i + r) as u32;
            let a = pool.get(i as u32).unwrap();
            let b = pool.get(swap_idx).unwrap();
            pool.set(i as u32, b);
            pool.set(swap_idx, a);
            i += 1;
        }

        let mut out: Vec<u64> = Vec::new(env);
        let mut j: u32 = 0;
        while (j as u64) < amount {
            let mut v = pool.get(j).unwrap();
            if !for_index {
                v += 1;
            }
            out.push_back(v);
            j += 1;
        }
        out
    }
}
