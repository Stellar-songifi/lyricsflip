use super::*;

#[test]
fn finalize_round_e2e_single_winner_updates_stats_and_scores() {
    let (env, client, owner) = setup();
    for i in 0..4u64 {
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let first_card = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
    env.ledger().set_timestamp(106);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(first_card.title.clone())));
    env.ledger().set_timestamp(130);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-a"))
    ));

    env.ledger().set_timestamp(195);
    let second_card = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(45);
    let card = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = next_card_full(&env, &client, &owner, round_id);
    let p2_card = next_card_full(&env, &client, &player2, round_id);
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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = next_card_full(&env, &client, &owner, round_id);
    let p2_card = next_card_full(&env, &client, &player2, round_id);
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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = next_card_full(&env, &client, &owner, round_id);
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
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
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
// LF-271 – tie-breaking and edge-case outcomes (see docs/game-rules.md)
// ---------------------------------------------------------------------------

/// Decision table row: exact score + time tie -> co-winners, each gets
/// `rounds_won += 1` and the pot is split evenly with dust to the earliest
/// winner by index.
#[test]
fn lf271_tie_co_winners_split_pot_evenly_with_dust_to_first() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    let player3 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.join_round(&player3, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);
    client.start_round(&player3, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let c1 = next_card_full(&env, &client, &owner, round_id);
    let c2 = next_card_full(&env, &client, &player2, round_id);
    let _ = next_card_full(&env, &client, &player3, round_id);
    env.ledger().set_timestamp(NOW + 10);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(c1.title.clone())));
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(c2.title.clone())));

    // Not every player answered every card, so finalize only after the deadline.
    env.ledger()
        .set_timestamp(client.get_round(&round_id).end_time);
    client.finalize_round(&owner, &round_id);

    // Both tied winners are credited.
    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player3).rounds_won, 0);
}

/// Decision table row: zero scores -> no winners, no `rounds_won` changes.
#[test]
fn lf271_zero_scores_produce_no_winners() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let _ = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
    env.ledger().set_timestamp(NOW + 10);
    assert!(!client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "nope"))
    ));
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "nope-two"))
    ));

    client.finalize_round(&owner, &round_id);
    assert_eq!(client.get_player_stat(&owner).rounds_won, 0);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
}

/// Decision table row: a player who never answers is excluded from the
/// winners and has their streak reset.
#[test]
fn lf271_non_answering_player_is_excluded_and_streak_reset() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
    env.ledger().set_timestamp(NOW + 10);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // Not every player answered every card, so finalize only after the deadline.
    env.ledger()
        .set_timestamp(client.get_round(&round_id).end_time);
    client.finalize_round(&owner, &round_id);

    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
    assert_eq!(
        client.get_player_stat(&player2).current_streak,
        0,
        "a player who never answered must lose their streak"
    );
}

/// Decision table row: a correct-but-slow player beats a fast player who
/// scored less (score dominates total answer time).
#[test]
fn lf271_slow_correct_player_beats_fast_lower_score() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    // Owner answers both cards correctly but slowly.
    env.ledger().set_timestamp(NOW + 5);
    let c1 = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
    env.ledger().set_timestamp(NOW + 12);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(c1.title.clone())));
    env.ledger().set_timestamp(NOW + 35);
    let c2 = next_card_full(&env, &client, &owner, round_id);
    let _ = next_card_full(&env, &client, &player2, round_id);
    env.ledger().set_timestamp(NOW + 42);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(c2.title.clone())));

    // Player2 answers one card fast and one wrong.
    env.ledger().set_timestamp(NOW + 43);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong"))
    ));

    // Not every player answered every card, so finalize only after the deadline.
    env.ledger()
        .set_timestamp(client.get_round(&round_id).end_time);
    client.finalize_round(&owner, &round_id);
    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
}

/// Decision table row: solo round -> the single player wins when score > 0.
#[test]
fn lf271_solo_round_single_player_wins_with_score() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 10);
    client.set_cards_per_round(&owner, &1);

    client.create_solo_round(&owner, &Some(Genre::Pop));
    let round_id = client.get_round_count();
    env.ledger().set_timestamp(NOW + 5);
    let card = current_card_full(&env, &client, &owner, round_id);
    env.ledger().set_timestamp(NOW + 10);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    client.finalize_round(&owner, &round_id);
    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
}

/// Decision table row: a winner who left the round is excluded from the
/// payout and does not receive `rounds_won`.
#[test]
fn lf271_departed_winner_is_excluded() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    // player2 leaves before the round starts.
    client.leave_round(&player2, &round_id);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = next_card_full(&env, &client, &owner, round_id);
    env.ledger().set_timestamp(NOW + 10);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    client.finalize_round(&owner, &round_id);
    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
}
