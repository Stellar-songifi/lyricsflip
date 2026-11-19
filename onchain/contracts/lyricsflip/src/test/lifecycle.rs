use super::*;

#[test]
fn winner_claims_nft_reward_via_cross_contract_mint() {
    let (env, client, owner) = setup();
    let nft_id = env.register(
        lyricsflip_nft::LyricsFlipNFT,
        (
            owner.clone(),
            client.address.clone(),
            String::from_str(&env, "LyricsFlip"),
            String::from_str(&env, "LFLIP"),
            String::from_str(&env, "https://example.com/metadata/"),
        ),
    );
    let nft = lyricsflip_nft::LyricsFlipNFTClient::new(&env, &nft_id);

    assert_eq!(
        client.try_claim_reward(&owner, &Milestone::FirstWin),
        Err(Ok(Error::NftContractNotSet.into()))
    );
    client.set_nft_contract(&owner, &nft_id);
    assert_eq!(
        client.try_claim_reward(&owner, &Milestone::FirstWin),
        Err(Ok(Error::MilestoneNotReached.into()))
    );

    seed_cards(&env, &client, &owner, 1);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);
    let card = client.next_card(&owner, &round_id);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    client.finalize_round(&owner, &round_id);

    let token_id = client.claim_reward(&owner, &Milestone::FirstWin);
    assert_eq!(token_id, 1);
    assert_eq!(nft.owner_of(&1), owner);
    assert!(client.is_milestone_claimed(&owner, &Milestone::FirstWin));
    assert_eq!(
        client.try_claim_reward(&owner, &Milestone::FirstWin),
        Err(Ok(Error::MilestoneAlreadyClaimed.into()))
    );
    assert_eq!(nft.token_count(), 1);
}

// ---------------------------------------------------------------------------
// LF-003 — Last card of a round can be answered (#420)
// ---------------------------------------------------------------------------

/// cards_per_round = 1: draw the only card then submit an answer — must succeed.
/// Before the fix, next_card set is_completed = true immediately, causing
/// submit_answer to reject with RoundCompleted on the very first answer.
#[test]
fn lf003_single_card_round_can_be_answered() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &7u64, &None);
    client.start_round(&owner, &round_id);

    // Draw the only card in the round.
    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

    // Submitting an answer for the last (and only) card must not panic.
    env.ledger().set_timestamp(NOW + 10);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(
        correct,
        "answer to the only card in a 1-card round must be accepted"
    );

    // Round is not yet completed — only finalize_round sets is_completed.
    let round = client.get_round(&round_id);
    assert!(
        !round.is_completed,
        "round must not be completed until finalize_round is called"
    );

    // Finalize succeeds because the one card has been answered.
    client.finalize_round(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert!(
        round.is_completed,
        "round must be completed after finalize_round"
    );
    assert!(
        round.end_time > 0,
        "end_time must be set when the round completes"
    );
}

/// cards_per_round = 3: answer to the 3rd card is accepted; round is marked
/// completed only after finalize_round, not after drawing the last card.
#[test]
fn lf003_three_card_round_last_card_is_answerable() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 6);
    client.set_cards_per_round(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &77u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    // Draw and answer cards 1 and 2.
    for i in 0..2u64 {
        env.ledger().set_timestamp(NOW + 5 + i * 30);
        let card = client.next_card(&owner, &round_id);
        let p2_card = client.next_card(&player2, &round_id);
        env.ledger().set_timestamp(NOW + 8 + i * 30);
        client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
        client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone()));
    }

    // Draw card 3 (the last one).
    env.ledger().set_timestamp(NOW + 65);
    let last_card = client.next_card(&owner, &round_id);
    let p2_last_card = client.next_card(&player2, &round_id);

    // Round must NOT be completed yet — players must still be able to answer.
    let round = client.get_round(&round_id);
    assert!(
        !round.is_completed,
        "round must not be completed after drawing the last card — answer window is still open"
    );

    // Both players can answer the last card.
    env.ledger().set_timestamp(NOW + 70);
    let owner_correct =
        client.submit_answer(&owner, &round_id, &Answer::Title(last_card.title.clone()));
    let p2_correct = client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(p2_last_card.title.clone()),
    );
    assert!(owner_correct, "owner must be able to answer the last card");
    assert!(p2_correct, "player2 must be able to answer the last card");

    // Finalizing after all answers succeeds and sets end_time.
    client.finalize_round(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert!(round.is_completed);
    assert!(round.end_time > 0, "end_time must be set by finalize_round");
}

/// next_card returns NoMoreCards (not RoundCompleted) when the deck is exhausted.
#[test]
fn lf003_next_card_after_deck_exhausted_returns_no_more_cards() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &21u64, &None);
    client.start_round(&owner, &round_id);

    // Draw both cards.
    env.ledger().set_timestamp(NOW + 5);
    client.next_card(&owner, &round_id);
    env.ledger().set_timestamp(NOW + 35);
    client.next_card(&owner, &round_id);

    // A third call must fail with NoMoreCards, not RoundCompleted.
    env.ledger().set_timestamp(NOW + 65);
    let err = client
        .try_next_card(&owner, &round_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(
        err,
        crate::Error::NoMoreCards.into(),
        "exhausted deck must return NoMoreCards, not RoundCompleted"
    );
}

#[test]
fn create_round_filter_selects_decade_genre_and_difficulty_and_multiplies_points() {
    let (env, client, owner) = setup();
    for i in 0..3u64 {
        let card = Card {
            difficulty: 3,
            ..sample_card(
                &env,
                Genre::RnB,
                &std::format!("Nineties Artist {}", i),
                &std::format!("Nineties Track {}", i),
                1990 + i,
            )
        };
        client.add_card(&owner, &card);
    }
    client.add_card(
        &owner,
        &Card {
            difficulty: 3,
            ..sample_card(
                &env,
                Genre::RnB,
                "TwoThousands Artist",
                "TwoThousands Track",
                2000,
            )
        },
    );
    client.add_card(
        &owner,
        &Card {
            difficulty: 3,
            ..sample_card(&env, Genre::Pop, "Pop Artist", "Pop Track", 1995)
        },
    );
    client.add_card(
        &owner,
        &sample_card(&env, Genre::RnB, "Medium Artist", "Medium Track", 1995),
    );
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round_with_filter(
        &owner,
        &crate::RoundFilter {
            genre: Some(Genre::RnB),
            decade: Some(1990),
        },
        &Some(3),
        &22u64,
    );
    let round_cards = client.get_round_cards(&owner, &round_id);
    assert_eq!(round_cards.len(), 2);
    for card_id in round_cards.iter() {
        let card = client.get_card(&card_id);
        assert_eq!(card.genre, Genre::RnB);
        assert_eq!(card.year / 10 * 10, 1990);
        assert_eq!(card.difficulty, 3);
    }

    client.start_round(&owner, &round_id);
    let card = client.next_card(&owner, &round_id);
    env.ledger().set_timestamp(NOW + 7);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title)));
    assert_eq!(client.get_round_scores(&round_id).get(owner).unwrap(), 285);
}

#[test]
fn invalid_round_difficulty_and_decade_are_rejected() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let filter = crate::RoundFilter {
        genre: Some(Genre::Pop),
        decade: None,
    };

    assert_eq!(
        client.try_create_round_with_filter(&owner, &filter, &Some(4), &1u64),
        Err(Ok(Error::InvalidCardDifficulty.into()))
    );
    assert_eq!(
        client.try_create_round_with_filter(
            &owner,
            &crate::RoundFilter {
                genre: Some(Genre::Pop),
                decade: Some(1995),
            },
            &None,
            &1u64,
        ),
        Err(Ok(Error::InvalidDecade.into()))
    );
}

// LF-159: a first-ledger answer earns MAX_CORRECT_POINTS
#[test]
fn lf159_first_ledger_answer_gets_max_points() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);
    env.ledger().set_timestamp(NOW + 6);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    assert_eq!(
        client.get_round_scores(&round_id).get(owner.clone()),
        Some(200)
    );
    assert_eq!(
        client.get_round_scores(&round_id).get(owner.clone()),
        Some(200)
    );
}
