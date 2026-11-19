use super::*;

// ---------------------------------------------------------------------------
// add_card / get_card
// ---------------------------------------------------------------------------

#[test]
fn add_card_requires_admin() {
    let (env, client, _owner) = setup();
    let non_admin = Address::generate(&env);
    let card = sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999);
    let result = client.try_add_card(&non_admin, &card);
    assert!(result.is_err());
}

#[test]
fn add_card_and_get_card_round_trip() {
    let (env, client, owner) = setup();
    let card = sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999);
    client.add_card(&owner, &card);

    let stored = client.get_card(&1);
    assert_eq!(stored.title, card.title);
    assert_eq!(stored.artist, card.artist);
    assert_eq!(stored.year, 1999);
}

#[test]
fn get_card_errors_for_nonexistent_id() {
    let (_env, client, _owner) = setup();
    let result = client.try_get_card(&999);
    assert!(result.is_err());
}

#[test]
fn card_counts_track_adds() {
    let (env, client, owner) = setup();
    assert_eq!(client.get_cards_count(), 0);
    assert_eq!(client.get_genre_card_count(&Genre::Pop), 0);

    seed_cards(&env, &client, &owner, 3);
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Rock, "Artist B", "Title B", 1990),
    );

    assert_eq!(client.get_cards_count(), 4);
    assert_eq!(client.get_genre_card_count(&Genre::Pop), 3);
    assert_eq!(client.get_genre_card_count(&Genre::Rock), 1);
    assert_eq!(client.get_genre_card_count(&Genre::Jazz), 0);
}

// ---------------------------------------------------------------------------
// get_cards_of_genre / artist / year
// ---------------------------------------------------------------------------

#[test]
fn get_cards_of_genre_returns_requested_amount() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 6);
    client.set_cards_per_round(&owner, &4);

    let cards = client.get_cards_of_genre(&Genre::Pop, &99u64);
    assert_eq!(cards.len(), 4);
}

#[test]
fn get_cards_of_genre_errors_when_empty() {
    let (_env, client, _owner) = setup();
    let result = client.try_get_cards_of_genre(&Genre::Jazz, &1u64);
    assert!(result.is_err());
}

#[test]
fn get_cards_of_a_year_errors_when_empty() {
    let (_env, client, _owner) = setup();
    let result = client.try_get_cards_of_a_year(&1975u64, &1u64);
    assert!(result.is_err());
}

#[test]
fn get_cards_of_artist_errors_when_no_cards() {
    let (env, client, _owner) = setup();
    let result = client.try_get_cards_of_artist(&String::from_str(&env, "Nobody"), &1u64);
    assert!(result.is_err());
}

#[test]
fn get_cards_of_artist_returns_requested_amount() {
    let (env, client, owner) = setup();
    // Add 4 cards for the same artist.
    for i in 0..4u64 {
        client.add_card(
            &owner,
            &Card {
                card_id: 0,
                genre: Genre::Rock,
                artist: String::from_str(&env, "The Same Artist"),
                title: alloc_string(&env, &format_u64("Song ", i)),
                year: 2000 + i,
                difficulty: 2,
                lyrics: String::from_str(&env, "lyric"),
            },
        );
    }
    // Dummy card to reach cards_per_round.
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Other", "Other Song", 1990),
    );
    client.set_cards_per_round(&owner, &2);

    let cards = client.get_cards_of_artist(&String::from_str(&env, "The Same Artist"), &3u64);
    assert_eq!(cards.len(), 2);
}

#[test]
fn get_cards_of_year_returns_requested_amount() {
    let (env, client, owner) = setup();
    for i in 0..4u64 {
        client.add_card(
            &owner,
            &Card {
                card_id: 0,
                genre: Genre::Jazz,
                artist: alloc_string(&env, &format_u64("Artist ", i)),
                title: alloc_string(&env, &format_u64("Track ", i)),
                year: 1990,
                difficulty: 2,
                lyrics: String::from_str(&env, "lyric"),
            },
        );
    }
    client.set_cards_per_round(&owner, &2);

    let cards = client.get_cards_of_a_year(&1990u64, &55u64);
    assert_eq!(cards.len(), 2);
}

// ---------------------------------------------------------------------------
// LF-161 – normalize title/artist before duplicate checks
// ---------------------------------------------------------------------------

#[test]
fn lf161_case_variant_duplicate_rejected() {
    let (env, client, owner) = setup();
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Drake", "Hotline Bling", 2015),
    );
    let dup = sample_card(&env, Genre::Pop, "drake", "hotline bling", 2015);
    assert_eq!(
        client.try_add_card(&owner, &dup),
        Err(Ok(Error::DuplicateCard.into()))
    );
}

#[test]
fn lf161_display_value_preserved() {
    let (env, client, owner) = setup();
    let id = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Drake", "Hotline Bling", 2015),
    );
    let stored = client.get_card(&id);
    assert_eq!(stored.artist, String::from_str(&env, "Drake"));
    assert_eq!(stored.title, String::from_str(&env, "Hotline Bling"));
}

#[test]
fn lf161_artist_index_is_case_insensitive() {
    let (env, client, owner) = setup();
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Drake", "Hotline Bling", 2015),
    );
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Drake", "God's Plan", 2018),
    );
    client.set_cards_per_round(&owner, &2);
    for lookup in ["Drake", "drake", "DRAKE"] {
        let cards = client.get_cards_of_artist(&String::from_str(&env, lookup), &1);
        assert_eq!(cards.len(), 2, "lookup {lookup} should match both cards");
    }
}

#[test]
fn eight_player_all_correct_round_uses_answer_timing() {
    simulate_eight_player_round(Simulation::AllCorrect);
}

#[test]
fn eight_player_exact_tie_splits_the_winner_set() {
    simulate_eight_player_round(Simulation::ExactTie);
}

#[test]
fn eight_player_all_wrong_round_has_no_winner() {
    simulate_eight_player_round(Simulation::AllWrong);
}

#[test]
fn eight_player_abandoned_round_can_be_finalized_by_a_keeper() {
    simulate_eight_player_round(Simulation::Abandoned);
}

#[test]
fn legacy_cards_default_to_medium_difficulty_when_read() {
    let (env, client, owner) = setup();
    let card_id = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Legacy Artist", "Legacy Song", 1999),
    );
    env.as_contract(&client.address, || {
        env.storage().persistent().set(
            &crate::DataKey::Card(card_id),
            &crate::LegacyCard {
                card_id,
                genre: Genre::Pop,
                artist: String::from_str(&env, "Legacy Artist"),
                title: String::from_str(&env, "Legacy Song"),
                year: 1999,
                lyrics: String::from_str(&env, "sample lyric line"),
            },
        );
    });

    assert_eq!(client.get_card(&card_id).difficulty, 2);
}

#[test]
fn seeded_card_removals_preserve_genre_indexes() {
    let (env, client, owner) = setup();
    let mut cards = std::vec::Vec::new();
    for i in 0..20u64 {
        let genre = if i % 2 == 0 { Genre::Pop } else { Genre::Rock };
        let id = client.add_card(
            &owner,
            &sample_card(
                &env,
                genre,
                &std::format!("Seeded Artist {i}"),
                &std::format!("Seeded Title {i}"),
                1990 + i % 5,
            ),
        );
        cards.push((id, genre));
    }

    for step in 0..cards.len() {
        let remove_idx = (step * 7) % cards.len();
        let (card_id, _) = cards.remove(remove_idx);
        client.remove_card(&owner, &card_id);
        assert_eq!(client.get_cards_count(), cards.len() as u64);

        for genre in [Genre::Pop, Genre::Rock] {
            let expected: std::vec::Vec<u64> = cards
                .iter()
                .filter(|(_, card_genre)| *card_genre == genre)
                .map(|(id, _)| *id)
                .collect();
            if !expected.is_empty() {
                assert_eq!(genre_ids(&client, &owner, genre), expected);
            } else {
                assert_eq!(client.get_genre_card_count(&genre), 0);
            }
        }
    }
}

#[test]
fn lf161_rejects_leading_or_trailing_whitespace() {
    let (env, client, owner) = setup();
    let base = sample_card(&env, Genre::Pop, "Artist", "Title", 2000);
    let cases = [
        (
            String::from_str(&env, " Title"),
            base.artist.clone(),
            Error::InvalidCardTitle,
        ),
        (
            String::from_str(&env, "Title "),
            base.artist.clone(),
            Error::InvalidCardTitle,
        ),
        (
            base.title.clone(),
            String::from_str(&env, " Artist"),
            Error::InvalidCardArtist,
        ),
        (
            base.title.clone(),
            String::from_str(&env, "Artist "),
            Error::InvalidCardArtist,
        ),
    ];
    for (title, artist, err) in cases {
        let card = Card {
            title,
            artist,
            ..base.clone()
        };
        assert_eq!(client.try_add_card(&owner, &card), Err(Ok(err.into())));
    }
    assert_eq!(client.get_cards_count(), 0);
}

#[test]
fn lf161_rejects_control_characters() {
    let (env, client, owner) = setup();
    let base = sample_card(&env, Genre::Pop, "Artist", "Title", 2000);
    let title_with_tab = String::from_str(&env, "Ti\ttle");
    let artist_with_nl = String::from_str(&env, "Art\nist");
    assert_eq!(
        client.try_add_card(
            &owner,
            &Card {
                title: title_with_tab,
                ..base.clone()
            }
        ),
        Err(Ok(Error::InvalidCardTitle.into()))
    );
    assert_eq!(
        client.try_add_card(
            &owner,
            &Card {
                artist: artist_with_nl,
                ..base.clone()
            }
        ),
        Err(Ok(Error::InvalidCardArtist.into()))
    );
}

// ----------------------------------------------------------------------------
// LF-176: removing or updating a card must not break rounds already using it
// ----------------------------------------------------------------------------

/// Acceptance test: a card removed *after* a round drew it must not break the
/// round. The round still reads and grades the card, and can be finalized.
#[test]
fn lf176_round_survives_removal_of_a_card_it_uses() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 6);
    client.set_cards_per_round(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &176u64, &None);
    client.start_round(&owner, &round_id);

    // Draw the first card, remember its id (ids start at 1) and title.
    env.ledger().set_timestamp(NOW + 5);
    let first = client.next_card(&owner, &round_id);
    let first_id = first.card_id;

    // Admin removes that very card mid-round.
    client.remove_card(&owner, &first_id);
    assert_eq!(
        client.try_get_card(&first_id),
        Err(Ok(Error::NonExistingCard.into())),
        "removed card must vanish from the public view"
    );

    // A removed card stays removed: it cannot be resurrected via update_card.
    let replacement = sample_card(&env, Genre::Pop, "New Artist", "New Title", 2001);
    assert_eq!(
        client.try_update_card(&owner, &first_id, &replacement),
        Err(Ok(Error::NonExistingCard.into()))
    );

    // The round must still grade the drawn card: submit_answer must not panic
    // with NonExistingCard, and the title answer is still correct.
    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(first.title.clone()));
    assert!(correct, "round must still grade a card removed mid-round");

    // Play out the remaining cards without any panic.
    for i in 0..2u64 {
        env.ledger().set_timestamp(NOW + 35 + i * 30);
        let card = client.next_card(&owner, &round_id);
        env.ledger().set_timestamp(NOW + 38 + i * 30);
        client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    }

    // Round finalizes cleanly (no NonExistingCard, no locked wager).
    client.finalize_round(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert!(
        round.is_completed,
        "round must finalize after a card was removed"
    );
}

/// `update_card` must reject answer-field changes while the card is in a
/// round that has not been finalized/cancelled.
#[test]
fn lf176_update_card_rejects_answer_change_on_live_round() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &177u64, &None);
    client.start_round(&owner, &round_id);
    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

    // Changing a non-answer field (difficulty) is allowed.
    let mut cosmetic = card.clone();
    cosmetic.difficulty = 3;
    client.update_card(&owner, &card.card_id, &cosmetic);

    // Changing an answer field (title) is rejected while the round is live.
    let mut tampered = card.clone();
    tampered.title = String::from_str(&env, "Tampered Title");
    assert_eq!(
        client.try_update_card(&owner, &card.card_id, &tampered),
        Err(Ok(Error::CardInActiveRound.into()))
    );

    // Play out the round: answer the first card, draw and answer the second.
    client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    env.ledger().set_timestamp(NOW + 35);
    let second = client.next_card(&owner, &round_id);
    env.ledger().set_timestamp(NOW + 38);
    client.submit_answer(&owner, &round_id, &Answer::Title(second.title.clone()));

    // After the round is finalized, the same update is allowed.
    client.finalize_round(&owner, &round_id);
    client.update_card(&owner, &card.card_id, &tampered);
}
