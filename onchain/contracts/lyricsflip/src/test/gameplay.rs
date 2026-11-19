use super::*;

// ---------------------------------------------------------------------------
// next_card
// ---------------------------------------------------------------------------

#[test]
fn next_card_advances_index_and_completes_round() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    let _c1 = next_card_full(&env, &client, &owner, round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 1);
    assert!(!round.is_completed);

    let _c2 = next_card_full(&env, &client, &owner, round_id);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    let result = client.try_next_card(&owner, &round_id);
    assert!(result.is_err());
}

#[test]
fn next_card_errors_when_round_completed() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    let round = client.get_round(&round_id);
    assert!(round.is_started);

    let card = next_card_full(&env, &client, &owner, round_id);

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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    let card = next_card_full(&env, &client, &owner, round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Artist(card.artist.clone()));
    assert!(correct);
}

#[test]
fn submit_answer_year_kind_accepted() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    let card = next_card_full(&env, &client, &owner, round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Year(card.year));
    assert!(correct);
}

#[test]
fn submit_answer_rejects_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    let result = client.try_submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "x")),
    );
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// LF-272 – skipping a card resets the streak
// ---------------------------------------------------------------------------

#[test]
fn lf272_skipping_a_card_resets_streak() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 10);
    client.set_cards_per_round(&owner, &6);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    // Answer 4 cards correctly.
    for i in 0..4u64 {
        env.ledger().set_timestamp(NOW + 5 + i * 30);
        let card = next_card_full(&env, &client, &owner, round_id);
        env.ledger().set_timestamp(NOW + 8 + i * 30);
        assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    }
    assert_eq!(client.get_player_stat(&owner).current_streak, 4);

    // Skip the fifth card: draw the next one without submitting.
    env.ledger().set_timestamp(NOW + 5 + 4 * 30);
    let _skipped = next_card_full(&env, &client, &owner, round_id);

    // Drawing the following card detects the skip and resets the streak.
    env.ledger().set_timestamp(NOW + 5 + 5 * 30);
    let card = next_card_full(&env, &client, &owner, round_id);
    assert_eq!(
        client.get_player_stat(&owner).current_streak,
        0,
        "skipping a card must reset the streak"
    );

    // Answer it correctly: streak restarts at 1.
    env.ledger().set_timestamp(NOW + 8 + 5 * 30);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    assert_eq!(client.get_player_stat(&owner).current_streak, 1);
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = next_card_full(&env, &client, &owner, round_id);

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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = next_card_full(&env, &client, &owner, round_id);

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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    // Draw and answer cards 1, 2, and 3 — one answer per card.
    for i in 0..3u64 {
        env.ledger().set_timestamp(NOW + 5 + i * 30);
        let card = next_card_full(&env, &client, &owner, round_id);
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = next_card_full(&env, &client, &owner, round_id);

    // Owner answers first.
    env.ledger().set_timestamp(NOW + 8);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // player2 can still answer the same card â AlreadyAnswered is per-player.
    let p2_card = next_card_full(&env, &client, &player2, round_id);
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
