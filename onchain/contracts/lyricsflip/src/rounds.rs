use crate::*;

impl LyricsFlip {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn create_round_internal(
        env: &Env,
        caller: Address,
        filter: RoundFilter,
        difficulty: Option<u32>,
        invitees: Vec<Address>,
        solo: bool,
        max_players: Option<u32>,
        wager_token: Option<Address>,
        wager_amount: i128,
    ) -> u64 {
        caller.require_auth();
        let global_max = Self::get_max_players((*env).clone());
        let max_players = match max_players {
            Some(value) if value < 2 => panic_with_error!(env, Error::InvalidMaxPlayers),
            Some(value) if value > global_max => {
                panic_with_error!(env, Error::MaxPlayersTooHigh)
            }
            Some(value) => value,
            None => global_max,
        };
        let is_private = !invitees.is_empty();
        if wager_amount < 0 {
            panic_with_error!(env, Error::InvalidRoundDuration);
        }
        if wager_amount > 0 && wager_token.is_none() {
            panic_with_error!(env, Error::NotAuthorized);
        }
        // LF-175: cap public open lobbies per address. Private and solo
        // rounds never appear in `OpenRounds`, so they are exempt.
        if !solo && !is_private {
            let open_count = Self::open_rounds_of(env, &caller);
            if open_count >= MAX_OPEN_ROUNDS_PER_ADDRESS {
                panic_with_error!(env, Error::TooManyOpenRounds);
            }
        }
        if difficulty.is_some_and(|value| !(1..=3).contains(&value)) {
            panic_with_error!(env, Error::InvalidCardDifficulty);
        }
        if let Some(decade) = filter.decade {
            let current_year = 1970 + env.ledger().timestamp() / SECONDS_PER_YEAR;
            if decade % 10 != 0 || decade < MIN_CARD_YEAR || decade > current_year {
                panic_with_error!(env, Error::InvalidDecade);
            }
        }
        Self::require_not_paused(&env);

        let amount = Self::get_cards_per_round((*env).clone()) as u64;
        let cards = Self::draw_round_cards(env, &filter, difficulty, amount);
        if filter.genre.is_none() && cards.is_empty() {
            panic_with_error!(env, Error::InvalidCardsPerRound);
        }
        let genre = filter
            .genre
            .unwrap_or_else(|| Self::read_card(env, cards.get(0).unwrap()).genre);

        let round_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RoundCount)
            .unwrap_or(0);
        let round_id = round_count + 1;
        env.storage()
            .instance()
            .set(&DataKey::RoundCount, &round_id);

        let num_cards = cards.len() as u64;
        let answer_window = Self::get_answer_window(env.clone());
        let lobby_timeout = Self::get_lobby_timeout(env.clone());
        let buffer = Self::get_round_buffer(env.clone());

        let round_duration = match Self::get_round_duration(env.clone()) {
            Some(fixed) if fixed > 0 => fixed,
            _ => num_cards.saturating_mul(answer_window.saturating_add(buffer)),
        };

        let round = Round {
            round_id,
            admin: caller.clone(),
            genre,
            wager_amount: wager_amount,
            wager_token: wager_token.clone(),
            start_time: 0,
            is_started: false,
            is_completed: false,
            end_time: 0,
            next_card_index: 0,
            is_cancelled: false,
            answer_window,
            lobby_timeout,
            round_duration,
            is_private,
            solo: false,
            max_players,
        };

        let mut players: Vec<Address> = Vec::new(&env);
        players.push_back(caller.clone());
        env.storage()
            .persistent()
            .set(&DataKey::RoundPlayers(round_id), &players);
        bump_persistent(&env, &DataKey::RoundPlayers(round_id));
        Self::push_player_round(&env, &caller, round_id);
        set_persistent(&env, &DataKey::RoundPlayers(round_id), &players);

        set_persistent(&env, &DataKey::RoundCards(round_id), &cards);

        // LF-264: remember the allowlist for private rounds. The round
        // creator is implicitly allowed to join their own round.
        if is_private {
            env.storage()
                .persistent()
                .set(&DataKey::RoundInvitees(round_id), &invitees);
            bump_persistent(&env, &DataKey::RoundInvitees(round_id));
        }

        // LF-176: track which rounds reference each card so `update_card`
        // can refuse answer-field changes while they are still playable.
        for card_id in cards.iter() {
            Self::add_live_round(env, card_id, round_id);
        }

        set_persistent(&env, &DataKey::Round(round_id), &round);

        set_persistent(
            &env,
            &DataKey::RoundCreatedAt(round_id),
            &env.ledger().timestamp(),
        );

        if wager_amount > 0 {
            let escrow = env
                .storage()
                .instance()
                .get::<_, Address>(&DataKey::EscrowContract)
                .unwrap_or_else(|| panic_with_error!(env, Error::NotAuthorized));
            let token_address = wager_token.clone().unwrap();
            let client = EscrowClient::new(env, &escrow);
            client.create_round(&round_id, &caller, &token_address);
            client.deposit(&round_id, &caller, &wager_amount);
        }

        // LF-162: private rounds are not discoverable in the public lobby.
        // LF-175: solo rounds skip the lobby entirely, so they neither
        // appear in nor consume a slot from `OpenRounds`.
        if !round.is_private && !solo {
            // LF-265: lazily prune expired lobbies so `OpenRounds` does not
            // grow without bound when nobody cancels them.
            let now = env.ledger().timestamp();
            let open = Self::read_open_rounds(env);
            let mut pruned: Vec<u64> = Vec::new(env);
            for id in open.iter() {
                if Self::is_lobby_expired(env, id, now) {
                    let expired = Self::read_round(env, id);
                    Self::dec_open_rounds_of(env, &expired.admin);
                } else {
                    pruned.push_back(id);
                }
            }
            pruned.push_back(round_id);
            set_persistent(env, &DataKey::OpenRounds, &pruned);
            Self::inc_open_rounds_of(env, &caller);
        }

        bump_instance(env);

        RoundCreated {
            round_id,
            admin: caller,
            created_time: env.ledger().timestamp(),
        }
        .publish(env);

        round_id
    }

    // ---- LF-175: open-lobby cap per address ----

    /// Returns the wager refunded to `player`. Wagers are not escrowed yet
    /// (see LF-013), so this only reports `round.wager_amount`; once escrow
    /// lands, the token transfer back to `player` belongs here.
    pub(crate) fn refund_wager(env: &Env, round: &Round, player: &Address) -> i128 {
        if round.wager_amount == 0 {
            return 0;
        }
        let escrow = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::EscrowContract)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotAuthorized));
        EscrowClient::new(env, &escrow).refund(&round.round_id, player)
    }
}

pub(crate) fn get_round(env: Env, round_id: u64) -> Round {
    LyricsFlip::read_round(&env, round_id)
}

pub(crate) fn get_round_cards(env: Env, caller: Address, round_id: u64) -> Vec<u64> {
    let round = LyricsFlip::read_round(&env, round_id);
    let finalized: bool = env
        .storage()
        .persistent()
        .get(&DataKey::RoundFinalized(round_id))
        .unwrap_or(false);
    if !finalized && !round.is_cancelled {
        if !LyricsFlip::is_admin(env.clone(), Role::Admin, caller.clone()) {
            panic_with_error!(env, Error::RoundNotReady);
        }
        caller.require_auth();
    }
    LyricsFlip::read_round_cards(&env, round_id)
}

pub(crate) fn get_round_players(env: Env, round_id: u64) -> Vec<Address> {
    LyricsFlip::read_round_players(&env, round_id)
}

pub(crate) fn get_players_round_count(env: Env, round_id: u64) -> u32 {
    LyricsFlip::read_round_players(&env, round_id).len()
}

pub(crate) fn get_round_count(env: Env) -> u64 {
    bump_instance(&env);
    env.storage()
        .instance()
        .get(&DataKey::RoundCount)
        .unwrap_or(0)
}

pub(crate) fn get_rounds(env: Env, start: u64, limit: u32) -> Vec<Round> {
    let round_count = LyricsFlip::get_round_count(env.clone());
    let limit = limit.min(MAX_PAGE_LIMIT) as u64;
    let mut rounds: Vec<Round> = Vec::new(&env);

    let mut round_id = start.max(1);
    while round_id <= round_count && (rounds.len() as u64) < limit {
        rounds.push_back(LyricsFlip::read_round(&env, round_id));
        round_id += 1;
    }
    rounds
}

pub(crate) fn get_open_rounds(env: Env, start: u32, limit: u32) -> Vec<u64> {
    let open = LyricsFlip::read_open_rounds(&env);
    // LF-265: expired lobbies can only be cancelled, so never list them.
    let now = env.ledger().timestamp();
    let mut live: Vec<u64> = Vec::new(&env);
    for round_id in open.iter() {
        if !LyricsFlip::is_lobby_expired(&env, round_id, now) {
            live.push_back(round_id);
        }
    }
    let end = start
        .saturating_add(limit.min(MAX_PAGE_LIMIT))
        .min(live.len());
    if start >= end {
        return Vec::new(&env);
    }
    live.slice(start..end)
}

pub(crate) fn create_round(
    env: Env,
    caller: Address,
    genre: Option<Genre>,
    invitees: Vec<Address>,
    wager_token: Option<Address>,
    wager_amount: i128,
) -> u64 {
    if genre.is_none() {
        panic_with_error!(env, Error::NonExistingGenre);
    }
    LyricsFlip::create_round_internal(
        &env,
        caller,
        RoundFilter {
            genre,
            decade: None,
        },
        None,
        invitees,
        false,
        None,
        wager_token,
        wager_amount,
    )
}

pub(crate) fn create_round_with_max_players(
    env: Env,
    caller: Address,
    genre: Option<Genre>,
    invitees: Vec<Address>,
    max_players: Option<u32>,
) -> u64 {
    if genre.is_none() {
        panic_with_error!(env, Error::NonExistingGenre);
    }
    LyricsFlip::create_round_internal(
        &env,
        caller,
        RoundFilter {
            genre,
            decade: None,
        },
        None,
        invitees,
        false,
        max_players,
        None,
        0,
    )
}

pub(crate) fn create_round_with_filter(
    env: Env,
    caller: Address,
    filter: RoundFilter,
    difficulty: Option<u32>,
    invitees: Vec<Address>,
) -> u64 {
    LyricsFlip::create_round_internal(
        &env, caller, filter, difficulty, invitees, false, None, None, 0,
    )
}

pub(crate) fn start_round(env: Env, caller: Address, round_id: u64) {
    caller.require_auth();
    let mut round = LyricsFlip::read_round(&env, round_id);
    if round.is_cancelled {
        panic_with_error!(env, Error::RoundCancelled);
    }

    let is_round_admin = round.admin == caller;
    let is_participant = LyricsFlip::is_round_player(&env, round_id, &caller);
    if !is_round_admin && !is_participant {
        panic_with_error!(env, Error::NotAuthorized);
    }
    // LF-265: an expired lobby can only be cancelled.
    if LyricsFlip::is_lobby_expired(&env, round_id, env.ledger().timestamp()) {
        panic_with_error!(env, Error::LobbyExpired);
    }

    let ready_key = DataKey::RoundReady((round_id, caller.clone()));
    let already_ready: bool = env.storage().persistent().get(&ready_key).unwrap_or(false);
    if already_ready {
        panic_with_error!(env, Error::AlreadyReady);
    }

    let players = LyricsFlip::read_round_players(&env, round_id);

    set_persistent(&env, &ready_key, &true);

    let ready_count_key = DataKey::RoundReadyCount(round_id);
    let ready_count: u32 = env
        .storage()
        .persistent()
        .get(&ready_count_key)
        .unwrap_or(0)
        + 1;
    set_persistent(&env, &ready_count_key, &ready_count);

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
            let mut stats = LyricsFlip::get_player_stat(env.clone(), player.clone());
            stats.total_rounds += 1;
            set_persistent(&env, &DataKey::PlayerStats(player.clone()), &stats);
        }

        let start_time = env.ledger().timestamp();
        round.start_time = start_time;
        round.end_time = start_time + round.round_duration;
        round.is_started = true;
        set_persistent(&env, &DataKey::Round(round_id), &round);

        LyricsFlip::remove_open_round(&env, round_id, &round.admin);

        bump_instance(&env);

        RoundStarted {
            round_id,
            admin: round.admin,
            start_time,
        }
        .publish(&env);
    }
}

pub(crate) fn join_round(env: Env, caller: Address, round_id: u64) {
    caller.require_auth();
    // LF-277: paused, exists, cancelled, started, joined, full, invite.
    LyricsFlip::require_not_paused(&env);
    let round = LyricsFlip::read_round(&env, round_id);

    if round.is_cancelled {
        panic_with_error!(env, Error::RoundCancelled);
    }
    if round.is_started {
        panic_with_error!(env, Error::RoundAlreadyStarted);
    }
    // LF-265: an expired lobby can only be cancelled.
    if LyricsFlip::is_lobby_expired(&env, round_id, env.ledger().timestamp()) {
        panic_with_error!(env, Error::LobbyExpired);
    }
    if LyricsFlip::is_round_player(&env, round_id, &caller) {
        panic_with_error!(env, Error::RoundAlreadyJoined);
    }

    let mut players = LyricsFlip::read_round_players(&env, round_id);
    if players.len() >= round.max_players {
        panic_with_error!(env, Error::RoundFull);
    }
    // LF-264: private rounds are gated by the stored allowlist.
    if round.is_private && !LyricsFlip::is_round_invitee(&env, round_id, &caller) {
        panic_with_error!(env, Error::InvalidInvite);
    }
    players.push_back(caller.clone());
    env.storage()
        .persistent()
        .set(&DataKey::RoundPlayers(round_id), &players);
    bump_persistent(&env, &DataKey::RoundPlayers(round_id));
    LyricsFlip::push_player_round(&env, &caller, round_id);
    set_persistent(&env, &DataKey::RoundPlayers(round_id), &players);

    RoundJoined {
        round_id,
        player: caller,
        joined_time: env.ledger().timestamp(),
    }
    .publish(&env);
}

pub(crate) fn leave_round(env: Env, caller: Address, round_id: u64) {
    caller.require_auth();
    let round = LyricsFlip::read_round(&env, round_id);
    LyricsFlip::assert_round_pending(&env, &round);
    if round.admin == caller {
        panic_with_error!(env, Error::AdminCannotLeave);
    }

    let mut players = LyricsFlip::read_round_players(&env, round_id);
    let idx = players
        .first_index_of(&caller)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotAParticipant));
    players.remove(idx);
    env.storage()
        .persistent()
        .set(&DataKey::RoundPlayers(round_id), &players);
    LyricsFlip::remove_player_round(&env, &caller, round_id);
    set_persistent(&env, &DataKey::RoundPlayers(round_id), &players);

    let ready_key = DataKey::RoundReady((round_id, caller.clone()));
    if env.storage().persistent().get(&ready_key).unwrap_or(false) {
        env.storage().persistent().remove(&ready_key);
        let ready_count_key = DataKey::RoundReadyCount(round_id);
        let ready_count: u32 = env
            .storage()
            .persistent()
            .get(&ready_count_key)
            .unwrap_or(0);
        set_persistent(&env, &ready_count_key, &ready_count.saturating_sub(1));
    }

    let refunded = LyricsFlip::refund_wager(&env, &round, &caller);
    RoundLeft {
        round_id,
        player: caller,
        refunded,
    }
    .publish(&env);
}

pub(crate) fn cancel_round(env: Env, caller: Address, round_id: u64) {
    caller.require_auth();
    let mut round = LyricsFlip::read_round(&env, round_id);
    LyricsFlip::assert_round_pending(&env, &round);

    if round.admin != caller {
        let created_at: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCreatedAt(round_id))
            .unwrap_or(0);
        if env.ledger().timestamp() < created_at + round.lobby_timeout {
            panic_with_error!(env, Error::LobbyTimeoutNotReached);
        }
    }

    round.is_cancelled = true;
    round.end_time = env.ledger().timestamp();
    set_persistent(&env, &DataKey::Round(round_id), &round);
    LyricsFlip::remove_open_round(&env, round_id, &round.admin);
    // LF-176: a cancelled round no longer constrains `update_card`.
    LyricsFlip::clear_live_rounds(&env, round_id);

    let players = LyricsFlip::read_round_players(&env, round_id);
    let mut refund_per_player = 0;
    for player in players.iter() {
        refund_per_player = LyricsFlip::refund_wager(&env, &round, &player);
    }

    RoundCancelled {
        round_id,
        cancelled_by: caller,
        refunded_players: players,
        refund_per_player,
    }
    .publish(&env);
}

pub(crate) fn create_solo_round(env: Env, caller: Address, genre: Option<Genre>) -> QuestionCard {
    if genre.is_none() {
        panic_with_error!(env, Error::NonExistingGenre);
    }
    // create_round_internal calls caller.require_auth() -> sig #1.
    // solo=true: the round never enters OpenRounds (LF-175).
    let round_id = LyricsFlip::create_round_internal(
        &env,
        caller.clone(),
        RoundFilter {
            genre,
            decade: None,
        },
        None,
        Vec::new(&env),
        true,
        None,
        None,
        0,
    );

    // Mark started immediately (mirrors start_round's writes for the
    // 1-player case, but without touching require_auth).
    let mut round = LyricsFlip::read_round(&env, round_id);
    let start_time = env.ledger().timestamp();
    round.is_started = true;
    round.start_time = start_time;
    round.end_time = start_time + round.round_duration;
    round.solo = true;
    env.storage()
        .persistent()
        .set(&DataKey::Round(round_id), &round);
    bump_persistent(&env, &DataKey::Round(round_id));

    let mut stats = LyricsFlip::get_player_stat(env.clone(), caller.clone());
    stats.total_rounds += 1;
    env.storage()
        .persistent()
        .set(&DataKey::PlayerStats(caller.clone()), &stats);
    bump_persistent(&env, &DataKey::PlayerStats(caller.clone()));

    RoundStarted {
        round_id,
        admin: caller.clone(),
        start_time,
    }
    .publish(&env);

    // Inline first-card draw (do NOT call next_card -> extra auth).
    let round_cards = LyricsFlip::read_round_cards(&env, round_id);
    let card_id = round_cards
        .get(0)
        .unwrap_or_else(|| panic_with_error!(env, Error::NoMoreCards));
    let card = LyricsFlip::read_card(&env, card_id);
    let player_card_index_key = DataKey::PlayerCardIndex((round_id, caller.clone()));
    env.storage()
        .persistent()
        .set(&player_card_index_key, &1u32);
    bump_persistent(&env, &player_card_index_key);
    let player_card_started_key = DataKey::PlayerCardStartedAt((round_id, caller.clone(), card_id));
    env.storage()
        .persistent()
        .set(&player_card_started_key, &env.ledger().timestamp());
    bump_persistent(&env, &player_card_started_key);
    CardDrawn { round_id, index: 0 }.publish(&env);

    LyricsFlip::build_question_card(env, card, QuestionKind::Title)
}
