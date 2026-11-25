use crate::*;

impl LyricsFlip {
    /// Auth-free finalization used by combined entry points after their single
    /// caller authentication frame has already been established.
    pub(crate) fn finalize_round_internal(env: &Env, round_id: u64) {
        let round = Self::read_round(env, round_id);
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
        let is_all_cards_answered = Self::are_all_required_answers_submitted(env, round_id);
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
        set_persistent(env, &DataKey::Round(round_id), &round);

        // LF-272: a player who let a card time out without submitting never
        // gets a `RoundPlayerAnswered` entry, so the streak reset that a
        // wrong answer performs never fires. Reset it here for every player
        // that left at least one card unanswered.
        let round_cards = Self::read_round_cards(env, round_id);
        for player in Self::read_round_players(env, round_id).iter() {
            let mut has_unanswered = false;
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
                    has_unanswered = true;
                    break;
                }
            }
            if has_unanswered {
                let mut stats = Self::get_player_stat(env.clone(), player.clone());
                stats.current_streak = 0;
                set_persistent(env, &DataKey::PlayerStats(player.clone()), &stats);
            }
        }

        // LF-271: tied winners are co-winners; each gets `rounds_won += 1`.
        // Zero-score rounds have no winners. Players who left the round are
        // no longer in `RoundPlayers`, so they are never selected here.
        let winners = Self::determine_round_winners(env, round_id);
        for winner in winners.iter() {
            let mut stats = Self::get_player_stat(env.clone(), winner.clone());
            stats.rounds_won += 1;
            set_persistent(env, &DataKey::PlayerStats(winner.clone()), &stats);
        }

        // Wagered rounds: pay winners from escrow, or refund everyone when
        // nobody won.
        if round.wager_amount > 0 {
            let escrow = env
                .storage()
                .instance()
                .get::<_, Address>(&DataKey::EscrowContract)
                .unwrap_or_else(|| panic_with_error!(env, Error::NotAuthorized));
            let escrow_client = EscrowClient::new(env, &escrow);
            if winners.is_empty() {
                escrow_client.cancel_round(&round_id, &Self::read_round_players(env, round_id));
            } else {
                escrow_client.settle_round(&round_id, &winners);
            }
        }

        let scores = Self::get_round_scores(env.clone(), round_id);
        RoundCompleted {
            round_id,
            winners: winners.clone(),
            scores,
        }
        .publish(env);

        // LF-278: reveal which card sat at each index now that the round is over.
        for (index, card_id) in Self::read_round_cards(env, round_id).iter().enumerate() {
            CardRevealed {
                round_id,
                index: index as u32,
                card_id,
            }
            .publish(env);
        }

        set_persistent(env, &DataKey::RoundFinalized(round_id), &true);
        // LF-176: the round no longer constrains `update_card` on its cards.
        Self::clear_live_rounds(env, round_id);
        bump_instance(env);
    }

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

        // LF-272: skipping a card (letting the timer run out without
        // submitting) must reset the streak exactly like a wrong answer.
        if player_index > 0 {
            let previous_card_id = round_cards.get(player_index - 1).unwrap();
            let answered: bool = env
                .storage()
                .persistent()
                .get(&DataKey::RoundPlayerAnswered((
                    round_id,
                    caller.clone(),
                    previous_card_id,
                )))
                .unwrap_or(false);
            if !answered {
                let mut stats = Self::get_player_stat(env.clone(), caller.clone());
                if stats.current_streak != 0 {
                    stats.current_streak = 0;
                    set_persistent(env, &DataKey::PlayerStats(caller.clone()), &stats);
                }
            }
        }

        CardDrawn {
            round_id,
            index: player_index,
        }
        .publish(env);

        let started_at_key = DataKey::PlayerCardStartedAt((round_id, caller.clone(), card_id));
        set_persistent(env, &started_at_key, &env.ledger().timestamp());

        let player_index_key = DataKey::PlayerCardIndex((round_id, caller.clone()));
        set_persistent(env, &player_index_key, &(player_index + 1));

        let mut round = round;
        round.next_card_index = round.next_card_index.max(player_index + 1);

        // Do NOT set is_completed here. The round is completed only by
        // finalize_round, which lets players answer the last card after it
        // has been drawn (LF-003).
        set_persistent(env, &DataKey::Round(round_id), &round);

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
            if score == 0 && max_score == 0 && winners.is_empty() {
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

        let is_correct = answer_time <= round.answer_window
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

        let answer_key = DataKey::RoundAnswer((round_id, caller.clone(), current_card_id));
        env.storage()
            .persistent()
            .set(&answer_key, &(is_correct, points));
        bump_persistent(env, &answer_key);

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

pub(crate) fn get_round_summary(env: Env, round_id: u64) -> Vec<CardResult> {
    let finalized: bool = env
        .storage()
        .persistent()
        .get(&DataKey::RoundFinalized(round_id))
        .unwrap_or(false);
    if !finalized {
        panic_with_error!(env, Error::RoundNotReady);
    }
    let players = LyricsFlip::read_round_players(&env, round_id);
    let mut summary = Vec::new(&env);
    for card_id in LyricsFlip::read_round_cards(&env, round_id).iter() {
        let mut per_player = Map::new(&env);
        for player in players.iter() {
            if let Some(result) = env
                .storage()
                .persistent()
                .get::<_, (bool, u64)>(&DataKey::RoundAnswer((round_id, player.clone(), card_id)))
            {
                per_player.set(player, result);
            }
        }
        summary.push_back(CardResult {
            card: LyricsFlip::read_card(&env, card_id),
            kind: QuestionKind::Title,
            per_player,
        });
    }
    summary
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
    if !LyricsFlip::is_round_player(&env, round_id, &caller) {
        panic_with_error!(env, Error::NotAParticipant);
    }
    LyricsFlip::finalize_round_internal(&env, round_id);
}

pub(crate) fn next_card(env: Env, caller: Address, round_id: u64) -> QuestionCard {
    caller.require_auth();
    let card = LyricsFlip::next_card_internal(&env, &caller, round_id);
    LyricsFlip::build_question_card(env, card, QuestionKind::Title)
}

pub(crate) fn submit_answer(env: Env, caller: Address, round_id: u64, answer: Answer) -> bool {
    caller.require_auth();
    LyricsFlip::submit_answer_internal(&env, &caller, round_id, &answer).0
}

pub(crate) fn answer_and_next(
    env: Env,
    caller: Address,
    round_id: u64,
    choice: Answer,
) -> AnswerResult {
    caller.require_auth();
    let player_index = env
        .storage()
        .persistent()
        .get::<_, u32>(&DataKey::PlayerCardIndex((round_id, caller.clone())))
        .unwrap_or(0);
    let current_index = player_index.saturating_sub(1);
    let round_cards = LyricsFlip::read_round_cards(&env, round_id);
    let current_card_id = round_cards
        .get(current_index)
        .unwrap_or_else(|| panic_with_error!(env, Error::NoActiveCard));
    let current_card = LyricsFlip::read_card(&env, current_card_id);
    let kind = match &choice {
        Answer::Title(_) => QuestionKind::Title,
        Answer::Artist(_) => QuestionKind::Artist,
        Answer::Year(_) => QuestionKind::Year,
    };
    let (correct, points) = LyricsFlip::submit_answer_internal(&env, &caller, round_id, &choice);
    // The question is reconstructed only after recording the answer, so its
    // correct option cannot be used to leak the active answer early.
    let answered_question = LyricsFlip::build_question_card(env.clone(), current_card, kind);
    let correct_option = LyricsFlip::correct_option(&env, &answered_question, &choice);
    let next_index = env
        .storage()
        .persistent()
        .get::<_, u32>(&DataKey::PlayerCardIndex((round_id, caller.clone())))
        .unwrap_or(0);
    let round_cards = LyricsFlip::read_round_cards(&env, round_id);
    let round = LyricsFlip::read_round(&env, round_id);
    let next = if (next_index as u64) < (round_cards.len() as u64) {
        let card = LyricsFlip::next_card_internal(&env, &caller, round_id);
        let question = LyricsFlip::build_question_card(env.clone(), card, QuestionKind::Title);
        let mut next = Vec::new(&env);
        next.push_back(question);
        next
    } else {
        let ready = LyricsFlip::are_all_required_answers_submitted(&env, round_id);
        let past = round.end_time != 0 && env.ledger().timestamp() >= round.end_time;
        if ready || past {
            LyricsFlip::finalize_round_internal(&env, round_id);
        }
        Vec::new(&env)
    };
    AnswerResult {
        correct,
        points,
        correct_option,
        next,
    }
}
