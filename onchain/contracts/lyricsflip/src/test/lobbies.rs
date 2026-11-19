use super::*;

#[test]
fn create_round_caps_open_lobbies_per_address() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);

    let rounds = fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.get_open_rounds(&0, &10).len() as u32,
        MAX_OPEN_ROUNDS_PER_ADDRESS
    );

    // A 4th open lobby from the same address fails.
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &10u64, &None),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // Another address still has free slots.
    let other = Address::generate(&env);
    client.create_round(&other, &Some(Genre::Pop), &20u64, &None);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 4);

    // Cancelling one lobby frees a slot for the capped address.
    client.cancel_round(&owner, &rounds[0]);
    client.create_round(&owner, &Some(Genre::Pop), &11u64, &None);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 4);
}

#[test]
fn starting_round_frees_open_lobby_slot() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);

    let rounds = fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &10u64, &None),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // The sole player marking ready starts the round and frees the slot.
    client.start_round(&owner, &rounds[0]);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 2);
    client.create_round(&owner, &Some(Genre::Pop), &11u64, &None);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);
}

#[test]
fn expired_lobby_cancel_frees_open_lobby_slot() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);

    let rounds = fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &10u64, &None),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // After the lobby timeout anyone may cancel ("expiry"); the slot frees.
    env.ledger().set_timestamp(NOW + LOBBY_TIMEOUT_SECONDS);
    client.cancel_round(&Address::generate(&env), &rounds[0]);
    client.create_round(&owner, &Some(Genre::Pop), &11u64, &None);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);
}

#[test]
fn private_and_solo_rounds_do_not_consume_open_lobby_slots() {
    let (env, client, owner) = setup();
    // A solo round draws and builds a question card inline, which needs
    // enough distinct cards/artists in the catalogue.
    seed_cards(&env, &client, &owner, 10);
    client.set_cards_per_round(&owner, &1);

    fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &10u64, &None),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // A private round never enters OpenRounds, so it bypasses the cap...
    let hash = BytesN::from_array(&env, &[7u8; 32]);
    let private_id = client.create_round(&owner, &Some(Genre::Pop), &10u64, &Some(hash));
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);

    // ...and cancelling it must not free a public-lobby slot.
    client.cancel_round(&owner, &private_id);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &11u64, &None),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // A solo round starts immediately and never enters OpenRounds either.
    client.create_solo_round(&owner, &Some(Genre::Pop), &12u64);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &13u64, &None),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );
}

#[test]
fn join_round_fails_with_round_full_past_max_players() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    assert_eq!(client.get_max_players(), DEFAULT_MAX_PLAYERS);
    client.set_max_players(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.join_round(&Address::generate(&env), &round_id, &None);
    client.join_round(&Address::generate(&env), &round_id, &None);
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id, &None),
        Err(Ok(Error::RoundFull.into()))
    );
    assert_eq!(
        client.try_set_max_players(&owner, &1),
        Err(Ok(Error::InvalidMaxPlayers.into()))
    );
}

#[test]
fn join_round_rejects_when_full() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    for _ in 1..MAX_ROUND_PLAYERS {
        client.join_round(&Address::generate(&env), &round_id, &None);
    }
    assert_eq!(client.get_players_round_count(&round_id), MAX_ROUND_PLAYERS);
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id, &None),
        Err(Ok(Error::RoundFull.into()))
    );
    assert_eq!(
        client.try_set_max_players(&owner, &1),
        Err(Ok(Error::InvalidMaxPlayers.into()))
    );
}
