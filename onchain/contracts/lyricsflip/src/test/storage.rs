use super::*;

// ---------------------------------------------------------------------------
// LF-012 – persistent storage survives a ledger advance past default TTL
// ---------------------------------------------------------------------------

/// After gameplay entries (cards, round, player stats) are written and the
/// ledger sequence advances well past Soroban's default minimum TTL, the
/// entries are still readable because `extend_ttl` was called on write.
#[test]
fn ttl_survival_game_entries_survive_ledger_advance() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    let card = next_card_full(&env, &client, &owner, round_id);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // Advance ledger sequence far beyond the Soroban default minimum TTL
    // (4 096 ledgers). If entries were never extended they would be
    // unreadable at this point.
    env.ledger().set_sequence_number(100_000);

    // All entries written during gameplay must still be readable.
    let _round = client.get_round(&round_id);
    let _card_back = client.get_card(&1);
    let stats = client.get_player_stat(&owner);
    assert_eq!(
        stats.total_rounds, 1,
        "player stats should still be readable after ledger advance"
    );
    assert_eq!(stats.current_streak, 1);
}

/// Cards added before a large ledger advance are still readable afterwards.
#[test]
fn ttl_survival_cards_survive_ledger_advance() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);

    env.ledger().set_sequence_number(200_000);

    // Cards and genre index should still be accessible.
    let _card = client.get_card(&1);
    let cards = client.get_cards_of_genre(&Genre::Pop);
    assert_eq!(cards.len(), 3);
}

#[test]
fn leave_round_refunds_wager_and_frees_the_seat() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&player2, &round_id);

    client.leave_round(&player2, &round_id);
    let events = env.events().all();
    let expected = RoundLeft {
        round_id,
        player: player2.clone(),
        refunded: client.get_round(&round_id).wager_amount,
    }
    .to_xdr(&env, &client.address);
    assert!(events.events().contains(&expected));

    assert_eq!(client.get_players_round_count(&round_id), 1);
    // player2's ready flag is dropped, so the admin alone starts the round.
    client.start_round(&owner, &round_id);
    assert!(client.get_round(&round_id).is_started);
}

#[test]
fn leave_round_fails_after_start_and_for_admin() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);

    assert_eq!(
        client.try_leave_round(&owner, &round_id),
        Err(Ok(Error::AdminCannotLeave.into()))
    );
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);
    assert_eq!(
        client.try_leave_round(&player2, &round_id),
        Err(Ok(Error::RoundAlreadyStarted.into()))
    );
}

#[test]
fn cancel_round_refunds_everyone_and_blocks_join_and_start() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);

    client.cancel_round(&owner, &round_id);
    let events = env.events().all();
    let expected = RoundCancelled {
        round_id,
        cancelled_by: owner.clone(),
        refunded_players: soroban_sdk::vec![&env, owner.clone(), player2.clone()],
        refund_per_player: 0,
    }
    .to_xdr(&env, &client.address);
    assert!(events.events().contains(&expected));

    assert!(client.get_round(&round_id).is_cancelled);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 0);
    let late = Address::generate(&env);
    assert_eq!(
        client.try_join_round(&late, &round_id),
        Err(Ok(Error::RoundCancelled.into()))
    );
    assert_eq!(
        client.try_start_round(&player2, &round_id),
        Err(Ok(Error::RoundCancelled.into()))
    );
    assert_eq!(
        client.try_cancel_round(&owner, &round_id),
        Err(Ok(Error::RoundCancelled.into()))
    );
}

#[test]
fn anyone_can_cancel_only_after_lobby_timeout() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    env.ledger().set_timestamp(1_000);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_cancel_round(&stranger, &round_id),
        Err(Ok(Error::LobbyTimeoutNotReached.into()))
    );
    env.ledger().set_timestamp(1_000 + LOBBY_TIMEOUT_SECONDS);
    client.cancel_round(&stranger, &round_id);
    assert!(client.get_round(&round_id).is_cancelled);
}
