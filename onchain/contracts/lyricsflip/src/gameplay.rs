use crate::*;

impl LyricsFlip {
    /// LF-164: auth-free body of `next_card` so `answer_and_next` can draw the
    /// next card under a single `require_auth` frame.
    pub(crate) fn next_card_internal(env: &Env, caller: &Address, round_id: u64) -> Card {
        if !Self::is_round_player(env, round_id, caller) {
            panic_with_error!(env, Error::NotAParticipant);
        }
        let round = Self::read_round(env, round_id);
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
        }

        let round_cards = Self::read_round_cards(env, round_id);
        // LF-003: use NoMoreCards (not RoundCompleted) so the caller knows
        // the deck is exhausted without implying the round is finished.
        let player_index: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlayerCardIndex((round_id, caller.clone())))
            .unwrap_or(0);
        let card_id = round_cards
            .get(player_index)
            .unwrap_or_else(|| panic_with_error!(env, Error::NoMoreCards));
        let card = Self::read_card(env, card_id);

        CardDrawn {
            round_id,
            index: player_index,
        }
        .publish(env);

        let started_at_key = DataKey::PlayerCardStartedAt((round_id, caller.clone(), card_id));
        env.storage()
            .persistent()
            .set(&started_at_key, &env.ledger().timestamp());
        bump_persistent(env, &started_at_key);

        let player_index_key = DataKey::PlayerCardIndex((round_id, caller.clone()));
        env.storage()
            .persistent()
            .set(&player_index_key, &(player_index + 1));
        bump_persistent(env, &player_index_key);

        let mut round = round;
        round.next_card_index = round.next_card_index.max(player_index + 1);

        // Do NOT set is_completed here. The round is completed only by
        // finalize_round, which lets players answer the last card after it
        // has been drawn (LF-003).
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);
        bump_persistent(env, &DataKey::Round(round_id));

        card
    }

    pub(crate) fn read_round_scores(env: &Env, round_id: u64) -> Map<Address, u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundScores(round_id))
            .unwrap_or(Map::new(env))
    }

    pub(crate) fn read_round_answer_times(env: &Env, round_id: u64) -> Map<Address, u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RoundAnswerTimes(round_id))
            .unwrap_or(Map::new(env))
    }

    pub(crate) fn are_all_required_answers_submitted(env: &Env, round_id: u64) -> bool {
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

    pub(crate) fn determine_round_winners(env: &Env, round_id: u64) -> Vec<Address> {
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
    pub(crate) fn submit_answer_internal(
        env: &Env,
        caller: &Address,
        round_id: u64,
        answer: &Answer,
    ) -> (bool, u64) {
        if !Self::is_round_player(env, round_id, caller) {
            panic_with_error!(env, Error::NotAParticipant);
        }
        let round = Self::read_round(env, round_id);
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
        }
        if round.is_completed || env.ledger().timestamp() >= round.end_time {
            panic_with_error!(env, Error::RoundCompleted);
        }

        let player_index: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlayerCardIndex((round_id, caller.clone())))
            .unwrap_or(0);
        if player_index == 0 {
            panic_with_error!(env, Error::NoActiveCard);
        }
        let current_index = player_index - 1;
        let round_cards = Self::read_round_cards(env, round_id);
        let current_card_id = round_cards.get(current_index).unwrap();
        let current_card = Self::read_card(env, current_card_id);

        let answered_key =
            DataKey::RoundPlayerAnswered((round_id, caller.clone(), current_card_id));
        if env
            .storage()
            .persistent()
            .get(&answered_key)
            .unwrap_or(false)
        {
            panic_with_error!(env, Error::AlreadyAnswered);
        }
        env.storage().persistent().set(&answered_key, &true);
        bump_persistent(env, &answered_key);

        let started_at: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::PlayerCardStartedAt((
                round_id,
                caller.clone(),
                current_card_id,
            )))
            .unwrap_or(round.start_time);
        let answer_time = env.ledger().timestamp().saturating_sub(started_at);
        let mut times = Self::read_round_answer_times(env, round_id);
        let t = times.get(caller.clone()).unwrap_or(0u64);
        times.set(caller.clone(), t + answer_time);
        env.storage()
            .persistent()
            .set(&DataKey::RoundAnswerTimes(round_id), &times);
        bump_persistent(env, &DataKey::RoundAnswerTimes(round_id));

        let is_correct = answer_time <= CARD_ANSWER_WINDOW_SECONDS
            && match answer {
                Answer::Artist(v) => *v == current_card.artist,
                Answer::Year(v) => *v == current_card.year,
                Answer::Title(v) => *v == current_card.title,
            };

        let points: u64 = if is_correct {
            MAX_CORRECT_POINTS
                .saturating_sub(
                    answer_time
                        .saturating_sub(FIRST_LEDGER_GRACE_SECONDS)
                        .saturating_mul(POINTS_DECAY_PER_SECOND),
                )
                .max(MIN_CORRECT_POINTS)
                .saturating_mul(current_card.difficulty as u64)
        } else {
            0
        };

        if is_correct {
            let mut scores = Self::read_round_scores(env, round_id);
            let s = scores.get(caller.clone()).unwrap_or(0u64);
            scores.set(caller.clone(), s + points);
            env.storage()
                .persistent()
                .set(&DataKey::RoundScores(round_id), &scores);
            bump_persistent(env, &DataKey::RoundScores(round_id));
        }

        let mut stats = Self::get_player_stat(env.clone(), caller.clone());
        if is_correct {
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
        bump_persistent(env, &DataKey::PlayerStats(caller.clone()));

        AnswerSubmitted {
            round_id,
            player: caller.clone(),
            correct: is_correct,
            points,
        }
        .publish(env);

        (is_correct, points)
    }
}

pub(crate) fn get_round_scores(env: Env, round_id: u64) -> Map<Address, u64> {
    let players = LyricsFlip::read_round_players(&env, round_id);
    let mut scores = LyricsFlip::read_round_scores(&env, round_id);

    for player in players.iter() {
        if scores.get(player.clone()).is_none() {
            scores.set(player.clone(), 0u64);
        }
    }

    scores
}

pub(crate) fn finalize_round(env: Env, caller: Address, round_id: u64) {
    caller.require_auth();
    let round = LyricsFlip::read_round(&env, round_id);
    if !LyricsFlip::is_round_player(&env, round_id, &caller) {
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
    let is_all_cards_answered = LyricsFlip::are_all_required_answers_submitted(&env, round_id);
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

    let winners = LyricsFlip::determine_round_winners(&env, round_id);
    if winners.len() > 0 {
        for player in LyricsFlip::read_round_players(&env, round_id).iter() {
            let mut is_winner = false;
            for winner in winners.iter() {
                if winner == player {
                    is_winner = true;
                    break;
                }
            }
            if is_winner {
                let mut stats = LyricsFlip::get_player_stat(env.clone(), player.clone());
                stats.rounds_won += 1;
                env.storage()
                    .persistent()
                    .set(&DataKey::PlayerStats(player.clone()), &stats);
                bump_persistent(&env, &DataKey::PlayerStats(player));
            }
        }
    }

    let scores = LyricsFlip::get_round_scores(env.clone(), round_id);
    RoundCompleted {
        round_id,
        winners: winners.clone(),
        scores,
    }
    .publish(&env);

    // LF-278: reveal which card sat at each index now that the round is over.
    for (index, card_id) in LyricsFlip::read_round_cards(&env, round_id)
        .iter()
        .enumerate()
    {
        CardRevealed {
            round_id,
            index: index as u32,
            card_id,
        }
        .publish(&env);
    }

    env.storage()
        .persistent()
        .set(&DataKey::RoundFinalized(round_id), &true);
    bump_persistent(&env, &DataKey::RoundFinalized(round_id));
    // LF-176: the round no longer constrains `update_card` on its cards.
    LyricsFlip::clear_live_rounds(&env, round_id);
    bump_instance(&env);
}

pub(crate) fn next_card(env: Env, caller: Address, round_id: u64) -> Card {
    caller.require_auth();
    LyricsFlip::next_card_internal(&env, &caller, round_id)
}

pub(crate) fn submit_answer(env: Env, caller: Address, round_id: u64, answer: Answer) -> bool {
    caller.require_auth();
    if !LyricsFlip::is_round_player(&env, round_id, &caller) {
        panic_with_error!(env, Error::NotAParticipant);
    }

    let round = LyricsFlip::read_round(&env, round_id);
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
    }
    if round.is_completed || env.ledger().timestamp() >= round.end_time {
        panic_with_error!(env, Error::RoundCompleted);
    }
    // LF-003: do NOT block on round.is_completed here. is_completed is
    // set only by finalize_round (which is guarded by RoundAlreadyFinalized
    // above). The old `round.is_completed` check fired as soon as the last
    // card was drawn, preventing players from ever answering it.
    let player_index: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::PlayerCardIndex((round_id, caller.clone())))
        .unwrap_or(0);
    if player_index == 0 {
        panic_with_error!(env, Error::NoActiveCard);
    }

    let current_index = player_index - 1;
    let round_cards = LyricsFlip::read_round_cards(&env, round_id);
    let current_card_id = round_cards.get(current_index).unwrap();
    let current_card = LyricsFlip::read_card(&env, current_card_id);

    let answered_key = DataKey::RoundPlayerAnswered((round_id, caller.clone(), current_card_id));
    // LF-004: reject duplicate answers with a hard error instead of
    // silently returning false. A silent false let the caller guess
    // every option in a loop until one returned true, and let repeated
    // correct answers farm current_streak / max_streak indefinitely.
    if env
        .storage()
        .persistent()
        .get(&answered_key)
        .unwrap_or(false)
    {
        panic_with_error!(env, Error::AlreadyAnswered);
    }
    env.storage().persistent().set(&answered_key, &true);
    bump_persistent(&env, &answered_key);

    let answer_started_at: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::PlayerCardStartedAt((
            round_id,
            caller.clone(),
            current_card_id,
        )))
        .unwrap_or(round.start_time);
    let answer_time = env.ledger().timestamp().saturating_sub(answer_started_at);
    let answer_times = LyricsFlip::read_round_answer_times(&env, round_id);
    let mut answer_times = answer_times;
    let total_time = answer_times.get(caller.clone()).unwrap_or(0u64);
    answer_times.set(caller.clone(), total_time + answer_time);
    env.storage()
        .persistent()
        .set(&DataKey::RoundAnswerTimes(round_id), &answer_times);
    bump_persistent(&env, &DataKey::RoundAnswerTimes(round_id));

    // Answers after the card window are scored as wrong (not rejected),
    // so the player still counts as having answered the card.
    let is_answer_correct = answer_time <= round.answer_window
        && match answer {
            Answer::Artist(value) => value == current_card.artist,
            Answer::Year(value) => value == current_card.year,
            Answer::Title(value) => value == current_card.title,
        };

    let points = if is_answer_correct {
        MAX_CORRECT_POINTS
            .saturating_sub(
                answer_time
                    .saturating_sub(FIRST_LEDGER_GRACE_SECONDS)
                    .saturating_mul(POINTS_DECAY_PER_SECOND),
            )
            .max(MIN_CORRECT_POINTS)
            .saturating_mul(current_card.difficulty as u64)
    } else {
        0
    };

    let mut scores = LyricsFlip::read_round_scores(&env, round_id);
    if is_answer_correct {
        let score = scores.get(caller.clone()).unwrap_or(0u64);
        scores.set(caller.clone(), score + points);
        env.storage()
            .persistent()
            .set(&DataKey::RoundScores(round_id), &scores);
        bump_persistent(&env, &DataKey::RoundScores(round_id));
    }

    let mut stats = LyricsFlip::get_player_stat(env.clone(), caller.clone());
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

pub(crate) fn answer_and_next(
    env: Env,
    caller: Address,
    round_id: u64,
    choice: Answer,
) -> AnswerResult {
    caller.require_auth();

    let (correct, points) = LyricsFlip::submit_answer_internal(&env, &caller, round_id, &choice);

    let next_index: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::PlayerCardIndex((round_id, caller.clone())))
        .unwrap_or(0);

    let round_cards = LyricsFlip::read_round_cards(&env, round_id);
    let round = LyricsFlip::read_round(&env, round_id);

    let next = if (next_index as u64) < (round_cards.len() as u64) {
        let mut v = Vec::new(&env);
        v.push_back(LyricsFlip::next_card_internal(&env, &caller, round_id));
        v
    } else {
        let ready = LyricsFlip::are_all_required_answers_submitted(&env, round_id);
        let past = round.end_time != 0 && env.ledger().timestamp() >= round.end_time;
        if ready || past {
            LyricsFlip::finalize_round(env.clone(), caller.clone(), round_id);
        }
        Vec::new(&env)
    };

    AnswerResult {
        correct,
        points,
        correct_option: 0,
        next,
    }
}
