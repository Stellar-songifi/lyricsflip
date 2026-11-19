use super::*;

// ---------------------------------------------------------------------------
// next_card
// ---------------------------------------------------------------------------

#[test]
fn next_card_advances_index_and_completes_round() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);

    let _c1 = client.next_card(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 1);
    assert!(!round.is_completed);

    let _c2 = client.next_card(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 2);
    // `finalize_round` completes the round, so the last card can still be answered.
    assert!(!round.is_completed);
    assert_eq!(
        client.try_next_card(&owner, &round_id),
        Err(Ok(Error::NoMoreCards.into()))
    );
}

#[test]
fn next_card_errors_when_round_not_started() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);

    let result = client.try_next_card(&owner, &round_id);
    assert!(result.is_err());
}

#[test]
fn next_card_errors_when_round_completed() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 1);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);
    client.next_card(&owner, &round_id);

    let result = client.try_next_card(&owner, &round_id);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// submit_answer
// ---------------------------------------------------------------------------

#[test]
fn submit_answer_updates_streak_and_reports_correctness() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &7u64, &None);
    client.start_round(&owner, &round_id);

    let round = client.get_round(&round_id);
    assert!(round.is_started);

    let card = client.next_card(&owner, &round_id);

    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(correct);

    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.current_streak, 1);
    assert_eq!(stats.max_streak, 1);

    client.next_card(&owner, &round_id);
    let wrong = client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "definitely not the title")),
    );
    assert!(!wrong);
    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.current_streak, 0);
    assert_eq!(stats.max_streak, 1);
}

#[test]
fn submit_answer_artist_kind_accepted() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &5u64, &None);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&owner, &round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Artist(card.artist.clone()));
    assert!(correct);
}

#[test]
fn submit_answer_year_kind_accepted() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &6u64, &None);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&owner, &round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Year(card.year));
    assert!(correct);
}

#[test]
fn submit_answer_rejects_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &8u64, &None);
    client.start_round(&owner, &round_id);
    client.next_card(&owner, &round_id);

    let outsider = Address::generate(&env);
    let result = client.try_submit_answer(
        &outsider,
        &round_id,
        &Answer::Title(String::from_str(&env, "x")),
    );
    assert!(result.is_err());
}

#[test]
fn submit_answer_rejects_on_unstarted_round() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &9u64, &None);

    let result = client.try_submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "x")),
    );
    assert!(result.is_err());
}

#[test]
fn finalize_round_e2e_single_winner_updates_stats_and_scores() {
    let (env, client, owner) = setup();
    for i in 0..3u64 {
        client.add_card(
            &owner,
            &Card {
                difficulty: 1,
                ..sample_card(
                    &env,
                    Genre::Pop,
                    &std::format!("Artist {i}"),
                    &std::format!("Title {i}"),
                    2000 + i,
                )
            },
        );
    }
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let first_card = client.next_card(&owner, &round_id);
    let _ = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(106);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(first_card.title.clone())));
    env.ledger().set_timestamp(130);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-a"))
    ));

    env.ledger().set_timestamp(195);
    let second_card = client.next_card(&owner, &round_id);
    let _ = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(206);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(second_card.title.clone())));
    env.ledger().set_timestamp(240);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-b"))
    ));

    let scores = client.get_round_scores(&round_id);
    // Two correct answers, 5s after grace: 2 * (100 - 5 * 5).
    assert_eq!(scores.get(owner.clone()).unwrap(), 150u64);
    assert_eq!(scores.get(player2.clone()).unwrap(), 0u64);

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    let owner_stats = client.get_player_stat(&owner);
    assert_eq!(owner_stats.rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);

    let winners = soroban_sdk::vec![&env, owner.clone()];
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);

    let _event_count_before_second_finalize = env
        .events()
        .all()
        .filter_by_contract(&client.address)
        .events()
        .len();
    let second_attempt = client.try_finalize_round(&owner, &round_id);
    assert!(second_attempt.is_err());
}

#[test]
fn finalize_round_e2e_deadline_path_works_without_all_answers() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &99u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(45);
    let card = client.next_card(&owner, &round_id);
    let _ = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(50);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    env.ledger().set_timestamp(70);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "not-the-answer"))
    ));

    let round = client.get_round(&round_id);
    env.ledger().set_timestamp(round.end_time + 1);

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.rounds_won, 1);
    let winners = soroban_sdk::vec![&env, owner.clone()];
    assert_round_completed_event(
        &env,
        &events,
        &client.address,
        round_id,
        &winners,
        &client.get_round_scores(&round_id),
    );
}

#[test]
fn finalize_round_e2e_tie_breaks_by_total_answer_time() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &3u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&owner, &round_id);
    let p2_card = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    env.ledger().set_timestamp(101);
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone())));

    client.finalize_round(&owner, &round_id);

    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
}

#[test]
fn finalize_round_e2e_exact_score_and_time_tie_produces_co_winners() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &11u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&owner, &round_id);
    let p2_card = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone())));

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 1);

    let winners = soroban_sdk::vec![&env, owner.clone(), player2.clone()];
    let scores = client.get_round_scores(&round_id);
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);
}

#[test]
fn finalize_round_rejects_early_and_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &17u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&owner, &round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    let err = client.try_finalize_round(&owner, &round_id);
    assert!(err.is_err());

    let outsider = Address::generate(&env);
    let outsider_err = client.try_finalize_round(&outsider, &round_id);
    assert!(outsider_err.is_err());
}

#[test]
fn finalize_round_e2e_no_correct_answers_has_no_winners() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &17u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    client.next_card(&owner, &round_id);
    client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(100);
    assert!(!client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong"))
    ));
    env.ledger().set_timestamp(150);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-two"))
    ));

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    assert_eq!(client.get_player_stat(&owner).rounds_won, 0);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);

    let scores = client.get_round_scores(&round_id);
    assert_eq!(scores.get(owner.clone()).unwrap(), 0u64);
    assert_eq!(scores.get(player2.clone()).unwrap(), 0u64);

    let winners = soroban_sdk::vec![&env];
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);
}

// ---------------------------------------------------------------------------
// LF-004 — Players cannot answer the same card more than once (#421)
// ---------------------------------------------------------------------------

/// A second submit_answer for the same card by the same player must fail
/// with Error::AlreadyAnswered.
#[test]
fn lf004_second_answer_for_same_card_fails_with_already_answered() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &55u64, &None);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

    // First answer is accepted.
    env.ledger().set_timestamp(NOW + 8);
    let first = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(first);

    // Second answer for the same card must be rejected with AlreadyAnswered.
    env.ledger().set_timestamp(NOW + 10);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, crate::Error::AlreadyAnswered.into());
}

/// Repeated wrong-then-correct guessing is blocked: each successive call
/// returns AlreadyAnswered after the first submission.
#[test]
fn lf004_cannot_guess_until_correct_by_resubmitting() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &66u64, &None);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

    // Submit a wrong answer first.
    env.ledger().set_timestamp(NOW + 8);
    let wrong = client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "definitely-wrong")),
    );
    assert!(!wrong, "wrong answer must return false");

    // Attempting to submit a second answer (even a correct one) must fail.
    env.ledger().set_timestamp(NOW + 9);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(
        err,
        crate::Error::AlreadyAnswered.into(),
        "second answer attempt must be rejected even if the first was wrong"
    );
}

/// Streaks cannot grow by more than 1 per card: a player who has answered
/// N cards correctly has a streak of exactly N (not N*2 from double-answers).
#[test]
fn lf004_streak_cannot_grow_more_than_one_per_card() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &13u64, &None);
    client.start_round(&owner, &round_id);

    // Draw and answer cards 1, 2, and 3 — one answer per card.
    for i in 0..3u64 {
        env.ledger().set_timestamp(NOW + 5 + i * 30);
        let card = client.next_card(&owner, &round_id);
        env.ledger().set_timestamp(NOW + 8 + i * 30);
        client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));

        // Attempt a second answer; it must fail, not add to the streak.
        env.ledger().set_timestamp(NOW + 10 + i * 30);
        let _ = client.try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    }

    let stats = client.get_player_stat(&owner);
    // Answered 3 cards correctly, 1 answer per card → streak must be exactly 3.
    assert_eq!(
        stats.current_streak, 3,
        "streak must equal the number of cards answered, not double from re-submissions"
    );
    assert_eq!(stats.max_streak, 3);
}

/// Other players can still answer the same card — AlreadyAnswered is
/// per-player, not per-card.
#[test]
fn lf004_other_players_can_still_answer_same_card() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &99u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

    // Owner answers first.
    env.ledger().set_timestamp(NOW + 8);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // player2 can still answer the same card â AlreadyAnswered is per-player.
    let p2_card = client.next_card(&player2, &round_id);
    // player2 can still answer the same card — AlreadyAnswered is per-player.
    env.ledger().set_timestamp(NOW + 10);
    assert!(
        client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone())),
        "player2 must be allowed to answer a card that owner has already answered"
    );

    // But owner cannot answer again.
    env.ledger().set_timestamp(NOW + 11);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, crate::Error::AlreadyAnswered.into());
}
