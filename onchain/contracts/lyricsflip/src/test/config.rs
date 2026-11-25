use super::*;

// ---------------------------------------------------------------------------
// LF-158 – Make round duration and answer window configurable (#644)
// ---------------------------------------------------------------------------

// LF-162 / LF-264: a private round admits only its invitees and stays out
// of the public lobby.
#[test]
fn lf162_private_round_admits_only_invitees() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &2);

    let invitee = Address::generate(&env);
    let invitees = Vec::from_array(&env, [invitee.clone()]);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &invitees, &None, &0i128);

    // Not in lobby.
    let open = client.get_open_rounds(&0u32, &10u32);
    assert_eq!(
        open.len(),
        0,
        "private round must not appear in get_open_rounds"
    );

    // A caller who isn't on the allowlist is rejected.
    let stranger = Address::generate(&env);
    let err = client
        .try_join_round(&stranger, &round_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidInvite.into());

    // The invitee can join.
    client.join_round(&invitee, &round_id);
    let players = client.get_round_players(&round_id);
    assert_eq!(players.len(), 2);
    assert_eq!(players.first_index_of(&invitee), Some(1));
}

// LF-162: public rounds are unaffected.
#[test]
fn lf162_public_round_still_joinable_without_code() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    assert_eq!(client.get_open_rounds(&0u32, &10u32).len(), 1);

    let stranger = Address::generate(&env);
    client.join_round(&stranger, &round_id);
    assert_eq!(client.get_round_players(&round_id).len(), 2);
}

// LF-163: a solo round starts in one call with exactly one signature.
#[test]
fn lf163_solo_round_starts_in_one_call() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &2);
    env.ledger().set_timestamp(NOW + 5);

    let qc = client.create_solo_round(&owner, &Some(Genre::Pop));

    // Round exists, started, flagged solo, not in OpenRounds.
    assert_eq!(client.get_round_count(), 1);
    let round = client.get_round(&1u64);
    assert!(round.is_started, "solo round must be started");
    assert!(round.solo, "round.solo must be true");
    assert_eq!(round.start_time, NOW + 5);
    assert!(round.end_time > round.start_time);
    assert_eq!(
        client.get_open_rounds(&0u32, &10u32).len(),
        0,
        "solo round must not appear in OpenRounds"
    );

    // First question returned from the same call.
    assert_eq!(qc.kind, QuestionKind::Title);
    assert!(!qc.option_one.is_empty());
    assert!(!qc.option_two.is_empty());
    assert!(!qc.option_three.is_empty());
    assert!(!qc.option_four.is_empty());
}

#[test]
fn lf158_values_can_be_changed_without_upgrade() {
    let (env, client, owner) = setup();

    // Default values before owner tuning
    assert_eq!(client.get_answer_window(), CARD_ANSWER_WINDOW_SECONDS);
    assert_eq!(client.get_lobby_timeout(), LOBBY_TIMEOUT_SECONDS);
    assert_eq!(client.get_round_duration(), None);
    assert_eq!(client.get_round_buffer(), DEFAULT_ROUND_BUFFER_SECONDS);

    // Update answer window
    client.set_answer_window(&owner, &25);
    assert_emitted(&env, &client.address, AnswerWindowUpdated { value: 25 });
    assert_eq!(client.get_answer_window(), 25);

    // Update lobby timeout
    client.set_lobby_timeout(&owner, &300);
    assert_emitted(&env, &client.address, LobbyTimeoutUpdated { value: 300 });
    assert_eq!(client.get_lobby_timeout(), 300);

    // Update round duration override
    client.set_round_duration(&owner, &Some(450));
    assert_emitted(&env, &client.address, RoundDurationUpdated { value: 450 });
    assert_eq!(client.get_round_duration(), Some(450));

    // Reset round duration override to dynamic
    client.set_round_duration(&owner, &None);
    assert_emitted(&env, &client.address, RoundDurationUpdated { value: 0 });
    assert_eq!(client.get_round_duration(), None);

    // Update round latency buffer
    client.set_round_buffer(&owner, &20);
    assert_emitted(&env, &client.address, RoundBufferUpdated { value: 20 });
    assert_eq!(client.get_round_buffer(), 20);
}

#[test]
fn lf158_twenty_card_round_has_enough_time_to_finish() {
    let (env, client, owner) = setup();

    // Seed 25 unique cards in the Pop genre
    seed_cards(&env, &client, &owner, 25);
    client.set_cards_per_round(&owner, &20);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let round_created = client.get_round(&round_id);

    // Verify snapshot: 20 cards * (15s answer + 15s buffer) = 600s
    assert_eq!(round_created.answer_window, 15);
    assert_eq!(round_created.lobby_timeout, 600);
    assert_eq!(round_created.round_duration, 20 * (15 + 15));

    client.start_round(&owner, &round_id);
    let round_started = client.get_round(&round_id);
    assert_eq!(round_started.start_time, NOW);
    assert_eq!(round_started.end_time, NOW + 600);

    // Draw and answer all 20 cards sequentially.
    // Each card takes 18 seconds (drawing + answering + ledger close).
    // By card 16 (index 15), elapsed time is 15 * 18 = 270s.
    // By card 20 (index 19), elapsed time is 19 * 18 + 5 = 347s.
    // In the legacy contract with a fixed 300s deadline, the round would expire at 300s
    // and fail with Error::RoundCompleted before players could finish all 20 cards.
    for i in 0..20u64 {
        let draw_time = NOW + 5 + i * 18;
        env.ledger().set_timestamp(draw_time);
        let card = next_card_full(&env, &client, &owner, round_id);

        let answer_time = draw_time + 5;
        env.ledger().set_timestamp(answer_time);
        assert!(
            client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())),
            "card {i} must be answerable beyond legacy 300s deadline"
        );
    }

    // Finalize after all 20 cards are answered
    client.finalize_round(&owner, &round_id);
    let round_finalized = client.get_round(&round_id);
    assert!(round_finalized.is_completed);
    // Verified completion happened well past 300s mark (~NOW + 350s)
    assert!(round_finalized.end_time > NOW + 300);
}

#[test]
fn lf158_values_are_snapshotted_onto_round_at_creation() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 10);
    client.set_cards_per_round(&owner, &2);

    // Create Round 1 under default timing configuration
    let r1 = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let round_1 = client.get_round(&r1);
    assert_eq!(round_1.answer_window, 15);
    assert_eq!(round_1.lobby_timeout, 600);
    assert_eq!(round_1.round_duration, 2 * (15 + 15)); // 60s

    // Modify global configuration
    client.set_answer_window(&owner, &30);
    client.set_lobby_timeout(&owner, &120);
    client.set_round_buffer(&owner, &25);

    // Create Round 2 under the updated configuration
    let r2 = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    let round_2 = client.get_round(&r2);
    assert_eq!(round_2.answer_window, 30);
    assert_eq!(round_2.lobby_timeout, 120);
    assert_eq!(round_2.round_duration, 2 * (30 + 25)); // 110s

    // Verify Round 1 retained its original snapshotted values
    let round_1_after = client.get_round(&r1);
    assert_eq!(round_1_after.answer_window, 15);
    assert_eq!(round_1_after.lobby_timeout, 600);
    assert_eq!(round_1_after.round_duration, 60);

    // Test in-flight answer window rule invariance:
    // Round 1 start at NOW
    client.start_round(&owner, &r1);
    env.ledger().set_timestamp(NOW + 5);
    let card1 = next_card_full(&env, &client, &owner, r1);

    // Submit answer 20 seconds after draw:
    // For Round 1, answer_window is snapshotted to 15, so 20s > 15s -> scored as wrong (false)
    env.ledger().set_timestamp(NOW + 25);
    assert!(
        !client.submit_answer(&owner, &r1, &Answer::Title(card1.title.clone())),
        "Round 1 must enforce its snapshotted 15s window even though global config is now 30s"
    );

    // Start Round 2 and test its snapshotted 30s window:
    client.start_round(&owner, &r2);
    env.ledger().set_timestamp(NOW + 50);
    let card2 = next_card_full(&env, &client, &owner, r2);

    // Submit answer 20 seconds after draw:
    // For Round 2, answer_window is snapshotted to 30, so 20s <= 30s -> scored as correct (true)
    env.ledger().set_timestamp(NOW + 70);
    assert!(
        client.submit_answer(&owner, &r2, &Answer::Title(card2.title.clone())),
        "Round 2 must allow 20s answer under its snapshotted 30s window"
    );
}

#[test]
fn lf158_sane_bounds_are_enforced() {
    let (_env, client, owner) = setup();

    // answer_window bounds: [5, 180]
    assert_eq!(
        client.try_set_answer_window(&owner, &(MIN_ANSWER_WINDOW_SECONDS - 1)),
        Err(Ok(Error::InvalidAnswerWindow.into()))
    );
    assert_eq!(
        client.try_set_answer_window(&owner, &(MAX_ANSWER_WINDOW_SECONDS + 1)),
        Err(Ok(Error::InvalidAnswerWindow.into()))
    );
    assert!(client
        .try_set_answer_window(&owner, &MIN_ANSWER_WINDOW_SECONDS)
        .is_ok());
    assert!(client
        .try_set_answer_window(&owner, &MAX_ANSWER_WINDOW_SECONDS)
        .is_ok());

    // lobby_timeout bounds: [30, 86_400]
    assert_eq!(
        client.try_set_lobby_timeout(&owner, &(MIN_LOBBY_TIMEOUT_SECONDS - 1)),
        Err(Ok(Error::InvalidLobbyTimeout.into()))
    );
    assert_eq!(
        client.try_set_lobby_timeout(&owner, &(MAX_LOBBY_TIMEOUT_SECONDS + 1)),
        Err(Ok(Error::InvalidLobbyTimeout.into()))
    );
    assert!(client
        .try_set_lobby_timeout(&owner, &MIN_LOBBY_TIMEOUT_SECONDS)
        .is_ok());
    assert!(client
        .try_set_lobby_timeout(&owner, &MAX_LOBBY_TIMEOUT_SECONDS)
        .is_ok());

    // round_duration bounds: [10, 86_400] when Some(> 0)
    assert_eq!(
        client.try_set_round_duration(&owner, &Some(MIN_ROUND_DURATION_SECONDS - 1)),
        Err(Ok(Error::InvalidRoundDuration.into()))
    );
    assert_eq!(
        client.try_set_round_duration(&owner, &Some(MAX_ROUND_DURATION_SECONDS + 1)),
        Err(Ok(Error::InvalidRoundDuration.into()))
    );
    assert!(client
        .try_set_round_duration(&owner, &Some(MIN_ROUND_DURATION_SECONDS))
        .is_ok());
    assert!(client
        .try_set_round_duration(&owner, &Some(MAX_ROUND_DURATION_SECONDS))
        .is_ok());

    // round_buffer bounds: [1, 60]
    assert_eq!(
        client.try_set_round_buffer(&owner, &(MIN_ROUND_BUFFER_SECONDS - 1)),
        Err(Ok(Error::InvalidRoundDuration.into()))
    );
    assert_eq!(
        client.try_set_round_buffer(&owner, &(MAX_ROUND_BUFFER_SECONDS + 1)),
        Err(Ok(Error::InvalidRoundDuration.into()))
    );
    assert!(client
        .try_set_round_buffer(&owner, &MIN_ROUND_BUFFER_SECONDS)
        .is_ok());
    assert!(client
        .try_set_round_buffer(&owner, &MAX_ROUND_BUFFER_SECONDS)
        .is_ok());
}

#[test]
fn lf158_unauthorized_callers_cannot_set_timing_configs() {
    let (env, client, _owner) = setup();
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_set_answer_window(&stranger, &20),
        Err(Ok(Error::NotAuthorized.into()))
    );
    assert_eq!(
        client.try_set_lobby_timeout(&stranger, &300),
        Err(Ok(Error::NotAuthorized.into()))
    );
    assert_eq!(
        client.try_set_round_duration(&stranger, &Some(300)),
        Err(Ok(Error::NotAuthorized.into()))
    );
    assert_eq!(
        client.try_set_round_buffer(&stranger, &15),
        Err(Ok(Error::NotAuthorized.into()))
    );
}

#[test]
fn lf158_legacy_round_fallback_and_migration() {
    let (env, client, owner) = setup();

    // Construct a legacy 10-field round and write it directly to persistent storage
    let legacy = LegacyRound {
        round_id: 999,
        admin: owner.clone(),
        genre: Genre::Pop,
        wager_amount: 100,
        start_time: NOW,
        answer_window: 15,
        is_started: true,
        is_completed: false,
        end_time: NOW + 300,
        next_card_index: 0,
        is_cancelled: false,
    };
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&crate::types::DataKey::Round(999), &legacy);
    });

    // Reading legacy round must transparently succeed and populate default timing fields
    let round = client.get_round(&999);
    assert_eq!(round.round_id, 999);
    assert_eq!(round.answer_window, 15);
    assert_eq!(round.lobby_timeout, 600);
    assert_eq!(round.round_duration, 300);

    // Initial schema version is 4 in constructor
    assert_eq!(client.schema_version(), crate::SCHEMA_VERSION);

    // Calling migrate is a clean, idempotent no-op
    client.migrate(&owner);
    assert_eq!(client.schema_version(), crate::SCHEMA_VERSION);
}
