use super::*;

// ---------------------------------------------------------------------------
// LF-265 – expired lobbies can only be cancelled
// ---------------------------------------------------------------------------

/// One second before `lobby_timeout` the lobby is still fully usable: it can be
/// joined, started and is listed by `get_open_rounds`.
#[test]
fn lf265_lobby_usable_one_second_before_timeout() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    env.ledger().set_timestamp(1_000);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    env.ledger()
        .set_timestamp(1_000 + LOBBY_TIMEOUT_SECONDS - 1);

    let open = client.get_open_rounds(&0, &10);
    assert_eq!(open.len(), 1, "lobby must still be listed before expiry");
    assert_eq!(open.get(0).unwrap(), round_id);

    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);
    assert!(client.get_round(&round_id).is_started);
}

/// Exactly at `lobby_timeout` the lobby is expired: joining and starting are
/// rejected with `LobbyExpired` and `get_open_rounds` no longer lists it.
#[test]
fn lf265_lobby_expired_at_timeout() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    env.ledger().set_timestamp(1_000);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    env.ledger().set_timestamp(1_000 + LOBBY_TIMEOUT_SECONDS);

    assert_eq!(
        client.get_open_rounds(&0, &10).len(),
        0,
        "expired lobby must not be listed"
    );

    let player2 = Address::generate(&env);
    assert_eq!(
        client.try_join_round(&player2, &round_id),
        Err(Ok(Error::LobbyExpired.into()))
    );
    assert_eq!(
        client.try_start_round(&owner, &round_id),
        Err(Ok(Error::LobbyExpired.into()))
    );

    // Cancelling is still allowed.
    client.cancel_round(&Address::generate(&env), &round_id);
    assert!(client.get_round(&round_id).is_cancelled);
}

/// One second after `lobby_timeout` the lobby is still expired.
#[test]
fn lf265_lobby_expired_after_timeout() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    env.ledger().set_timestamp(1_000);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    env.ledger()
        .set_timestamp(1_000 + LOBBY_TIMEOUT_SECONDS + 1);

    assert_eq!(client.get_open_rounds(&0, &10).len(), 0);

    let player2 = Address::generate(&env);
    assert_eq!(
        client.try_join_round(&player2, &round_id),
        Err(Ok(Error::LobbyExpired.into()))
    );
    assert_eq!(
        client.try_start_round(&owner, &round_id),
        Err(Ok(Error::LobbyExpired.into()))
    );
}

/// `get_open_rounds` skips expired rounds but keeps listing live ones.
#[test]
fn lf265_get_open_rounds_skips_expired_rounds() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    env.ledger().set_timestamp(1_000);
    let old_round = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    // A second lobby created after the first one expires.
    env.ledger().set_timestamp(1_000 + LOBBY_TIMEOUT_SECONDS);
    let other = Address::generate(&env);
    let fresh_round =
        client.create_round(&other, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);

    let open = client.get_open_rounds(&0, &10);
    assert_eq!(open.len(), 1);
    assert_eq!(open.get(0).unwrap(), fresh_round);
    assert_ne!(open.get(0).unwrap(), old_round);
}

#[test]
fn create_round_caps_open_lobbies_per_address() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);

    let rounds = fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.get_open_rounds(&0, &10).len(),
        MAX_OPEN_ROUNDS_PER_ADDRESS
    );

    // A 4th open lobby from the same address fails.
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // Another address still has free slots.
    let other = Address::generate(&env);
    client.create_round(&other, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 4);

    // Cancelling one lobby frees a slot for the capped address.
    client.cancel_round(&owner, &rounds[0]);
    client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 4);
}

#[test]
fn starting_round_frees_open_lobby_slot() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);

    let rounds = fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // The sole player marking ready starts the round and frees the slot.
    client.start_round(&owner, &rounds[0]);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 2);
    client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);
}

#[test]
fn expired_lobby_cancel_frees_open_lobby_slot() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);

    let rounds = fill_open_lobby_cap(&client, &owner, 1);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // After the lobby timeout anyone may cancel ("expiry"); the slot frees.
    env.ledger().set_timestamp(NOW + LOBBY_TIMEOUT_SECONDS);
    client.cancel_round(&Address::generate(&env), &rounds[0]);
    client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    // LF-265: creating a lobby also prunes the two other expired ones, so
    // only the new round is left open.
    assert_eq!(client.get_open_rounds(&0, &10).len(), 1);
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
        client.try_create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // A private round never enters OpenRounds, so it bypasses the cap...
    let invitees = Vec::from_array(&env, [Address::generate(&env)]);
    let private_id = client.create_round(&owner, &Some(Genre::Pop), &invitees, &None, &0i128);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);

    // ...and cancelling it must not free a public-lobby slot.
    client.cancel_round(&owner, &private_id);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128),
        Err(Ok(Error::TooManyOpenRounds.into()))
    );

    // A solo round starts immediately and never enters OpenRounds either.
    client.create_solo_round(&owner, &Some(Genre::Pop));
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);
    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128),
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.join_round(&Address::generate(&env), &round_id);
    client.join_round(&Address::generate(&env), &round_id);
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id),
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    for _ in 1..MAX_ROUND_PLAYERS {
        client.join_round(&Address::generate(&env), &round_id);
    }
    assert_eq!(client.get_players_round_count(&round_id), MAX_ROUND_PLAYERS);
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id),
        Err(Ok(Error::RoundFull.into()))
    );
    assert_eq!(
        client.try_set_max_players(&owner, &1),
        Err(Ok(Error::InvalidMaxPlayers.into()))
    );
}
