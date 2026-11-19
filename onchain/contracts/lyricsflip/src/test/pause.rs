use super::*;

// ---------------------------------------------------------------------------
// LF-174 — Emergency pause
// ---------------------------------------------------------------------------

#[test]
fn pause_blocks_create_round_join_round_and_claim_reward() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    // A round created before the pause stays joinable only until pause lands.
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);

    client.pause(&owner);
    assert!(client.is_paused());

    assert_eq!(
        client.try_create_round(&owner, &Some(Genre::Pop), &2u64, &None),
        Err(Ok(Error::Paused.into()))
    );
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id, &None),
        Err(Ok(Error::Paused.into()))
    );
    assert_eq!(
        client.try_claim_reward(&owner, &Milestone::FirstWin),
        Err(Ok(Error::Paused.into()))
    );
}

#[test]
fn pause_blocks_claim_milestone_entrypoints() {
    let (_env, client, owner) = setup();
    client.pause(&owner);

    assert_eq!(
        client.try_claim_reward(&owner, &Milestone::FirstWin),
        Err(Ok(Error::Paused.into()))
    );
}

#[test]
fn unpause_restores_create_round_join_round_and_claim() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    client.pause(&owner);
    assert!(client.is_paused());
    client.unpause(&owner);
    assert!(!client.is_paused());

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    assert_eq!(client.get_players_round_count(&round_id), 2);

    // Claim paths are reachable again (the milestone itself is still unmet).
    client.set_nft_contract(&owner, &Address::generate(&env));
    assert_eq!(
        client.try_claim_reward(&owner, &Milestone::FirstWin),
        Err(Ok(Error::MilestoneNotReached.into()))
    );
}

#[test]
fn pause_and_unpause_require_owner() {
    let (env, client, _owner) = setup();
    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_pause(&stranger),
        Err(Ok(Error::NotAuthorized.into()))
    );
    assert_eq!(
        client.try_unpause(&stranger),
        Err(Ok(Error::NotAuthorized.into()))
    );
}

#[test]
fn leave_round_refunds_while_paused() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);

    client.pause(&owner);

    // Leaving must still work so a player's wager can always leave the contract.
    client.leave_round(&player2, &round_id);
    let events = env.events().all();
    assert_eq!(client.get_players_round_count(&round_id), 1);
    let expected = RoundLeft {
        round_id,
        player: player2.clone(),
        refunded: client.get_round(&round_id).wager_amount,
    }
    .to_xdr(&env, &client.address);
    assert!(events.events().contains(&expected));
}

#[test]
fn cancel_round_refunds_everyone_while_paused() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);

    client.pause(&owner);

    // Cancelling must still work so escrowed funds can always be returned.
    client.cancel_round(&owner, &round_id);
    let events = env.events().all();
    assert!(client.get_round(&round_id).is_cancelled);
    let expected = RoundCancelled {
        round_id,
        cancelled_by: owner.clone(),
        refunded_players: soroban_sdk::vec![&env, owner.clone(), player2.clone()],
        refund_per_player: 0,
    }
    .to_xdr(&env, &client.address);
    assert!(events.events().contains(&expected));
}

#[test]
fn upgrade_keeps_state_and_changes_version() {
    let (env, client, owner) = setup();
    let other = Address::generate(&env);

    // 1. Populate the v1 contract with state before upgrading
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);
    client.set_role(&owner, &other, &Role::Admin, &true);

    // Model a deployment created before the schema-version key was added.
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .remove(&crate::DataKey::SchemaVersion);
        env.storage()
            .instance()
            .remove(&crate::DataKey::SchemaVersion);
    });

    // Initial code version and schema version must be 1
    assert_eq!(client.version(), 1);
    assert_eq!(client.schema_version(), 1);

    // 2. Upload the v2 fixture WASM
    let hash = env
        .deployer()
        .upload_contract_wasm(include_bytes!("../../../../fixtures/upgrade_v2.wasm").as_slice());

    // Non-owner upgrade must be rejected
    assert_eq!(
        client.try_upgrade(&other, &hash),
        Err(Ok(Error::NotAuthorized.into()))
    );

    // Owner upgrades the contract
    client.upgrade(&owner, &hash);

    // Upgrade must emit ContractUpgraded event
    assert_emitted(
        &env,
        &client.address,
        ContractUpgraded {
            owner: owner.clone(),
            new_wasm_hash: hash.clone(),
            old_version: 1,
            new_version: 1,
        },
    );

    // Code version is now 2, but storage schema is still 1 (upgrade != migrate)
    assert_eq!(client.version(), 2);
    assert_eq!(client.schema_version(), 1);

    // Existing storage is preserved across the upgrade
    env.as_contract(&client.address, || {
        let stored: Address = env
            .storage()
            .instance()
            .get(&crate::DataKey::Owner)
            .unwrap();
        assert_eq!(stored, owner);
        assert!(env
            .storage()
            .persistent()
            .get::<_, bool>(&crate::DataKey::Admin(other.clone()))
            .unwrap());
    });

    // 3. Non-owner migration must be rejected
    assert!(
        client.try_migrate(&other).is_err(),
        "migrate must only be callable by the contract owner"
    );

    // 4. Owner executes migration
    client.migrate(&owner);

    // Migration must emit SchemaMigrated event
    assert_emitted(
        &env,
        &client.address,
        SchemaMigrated {
            caller: owner.clone(),
            old_schema_version: 1,
            new_schema_version: 2,
        },
    );

    // Schema version is now bumped to 2
    assert_eq!(client.schema_version(), 2);

    // Verify migrated data can be read correctly by the v2 client
    let fixture_client = upgrade_fixture::UpgradeFixtureClient::new(&env, &client.address);
    let summary = fixture_client
        .get_v2_summary()
        .expect("v2 summary should be present after migration");
    assert!(summary.migrated);
    assert_eq!(summary.card_count, 3);
    assert_eq!(summary.cards_per_round, 2);

    // 5. Calling migrate a second time is strictly idempotent (no-op)
    let event_count_before = env.events().all().events().len();
    client.migrate(&owner);
    assert_eq!(client.schema_version(), 2);
    let event_count_after = env.events().all().events().len();
    assert_eq!(
        event_count_before, event_count_after,
        "second call to migrate must be a no-op and emit no events"
    );
}

#[test]
fn admin_and_gameplay_mutations_emit_events() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);

    client.set_cards_per_round(&owner, &2);
    assert_emitted(&env, &client.address, CardsPerRoundUpdated { value: 2 });

    let admin = Address::generate(&env);
    client.set_role(&owner, &admin, &Role::Admin, &true);
    assert_emitted(
        &env,
        &client.address,
        RoleUpdated {
            account: admin.clone(),
            role: Role::Admin,
            enabled: true,
        },
    );

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);
    let card = client.next_card(&owner, &round_id);
    assert_emitted(&env, &client.address, CardDrawn { round_id, index: 0 });

    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(correct);
    assert_emitted(
        &env,
        &client.address,
        AnswerSubmitted {
            round_id,
            player: owner.clone(),
            correct: true,
            points: 200,
        },
    );
}

#[test]
fn faster_correct_answers_earn_more_points_and_wrong_answers_earn_zero() {
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
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &5u64, &None);
    let fast = Address::generate(&env);
    let slow = Address::generate(&env);
    let wrong = Address::generate(&env);
    client.join_round(&fast, &round_id, &None);
    client.join_round(&slow, &round_id, &None);
    client.join_round(&wrong, &round_id, &None);
    for player in [&owner, &fast, &slow, &wrong] {
        client.start_round(player, &round_id);
    }

    let drawn_at = NOW + 10;
    env.ledger().set_timestamp(drawn_at);
    let card = client.next_card(&owner, &round_id);
    for player in [&fast, &slow, &wrong] {
        client.next_card(player, &round_id);
    }

    env.ledger().set_timestamp(drawn_at + 2);
    assert!(client.submit_answer(&fast, &round_id, &Answer::Title(card.title.clone())));
    assert_emitted(
        &env,
        &client.address,
        AnswerSubmitted {
            round_id,
            player: fast.clone(),
            correct: true,
            points: 100,
        },
    );
    assert!(!client.submit_answer(
        &wrong,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong"))
    ));
    assert_emitted(
        &env,
        &client.address,
        AnswerSubmitted {
            round_id,
            player: wrong.clone(),
            correct: false,
            points: 0,
        },
    );

    env.ledger()
        .set_timestamp(drawn_at + CARD_ANSWER_WINDOW_SECONDS);
    assert!(client.submit_answer(&slow, &round_id, &Answer::Title(card.title.clone())));

    let scores = client.get_round_scores(&round_id);
    let fast_points = scores.get(fast.clone()).unwrap();
    let slow_points = scores.get(slow.clone()).unwrap();
    assert_eq!(fast_points, 100);
    assert_eq!(slow_points, 55);
    assert!(fast_points > slow_points);
    assert_eq!(scores.get(wrong.clone()).unwrap(), 0);
    assert_eq!(scores.get(owner.clone()).unwrap(), 0);
}
