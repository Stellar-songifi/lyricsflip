use super::*;

#[test]
fn add_card_returns_id_and_stores_it() {
    let (env, client, owner) = setup();
    let mut card = sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999);
    card.card_id = 42;
    assert_eq!(client.add_card(&owner, &card), 1);
    assert_emitted(
        &env,
        &client.address,
        CardAdded {
            card_id: 1,
            genre: Genre::Pop,
        },
    );
    assert_eq!(client.get_card(&1).card_id, 1);
}

#[test]
fn add_card_rejects_invalid_cards() {
    let (env, client, owner) = setup();
    let ok = sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999);
    let empty = String::from_str(&env, "");

    let cases = [
        (
            Card {
                title: empty.clone(),
                ..ok.clone()
            },
            Error::InvalidCardTitle,
        ),
        (
            Card {
                artist: empty.clone(),
                ..ok.clone()
            },
            Error::InvalidCardArtist,
        ),
        (
            Card {
                lyrics: empty.clone(),
                ..ok.clone()
            },
            Error::InvalidCardLyrics,
        ),
        (
            Card {
                year: 0,
                ..ok.clone()
            },
            Error::InvalidCardYear,
        ),
        (
            Card {
                year: 1899,
                ..ok.clone()
            },
            Error::InvalidCardYear,
        ),
        (
            Card {
                year: 2027,
                ..ok.clone()
            },
            Error::InvalidCardYear,
        ),
        (
            Card {
                difficulty: 0,
                ..ok.clone()
            },
            Error::InvalidCardDifficulty,
        ),
        (
            Card {
                lyrics: String::from_str(&env, &"a".repeat(MAX_LYRICS_LEN as usize + 1)),
                ..ok.clone()
            },
            Error::LyricsTooLong,
        ),
    ];
    for (card, err) in cases {
        assert_eq!(client.try_add_card(&owner, &card), Err(Ok(err.into())));
    }
    assert_eq!(client.get_cards_count(), 0);

    // Boundaries are accepted.
    client.add_card(
        &owner,
        &Card {
            year: 1900,
            ..ok.clone()
        },
    );
    let lyrics = String::from_str(&env, &"a".repeat(MAX_LYRICS_LEN as usize));
    let edge = sample_card(&env, Genre::Pop, "Artist B", "Title B", 2026);
    client.add_card(&owner, &Card { lyrics, ..edge });
}

#[test]
fn add_card_rejects_duplicates() {
    let (env, client, owner) = setup();
    let card = sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999);
    client.add_card(&owner, &card);

    // Same title + artist, even with other fields changed.
    let dup = Card {
        genre: Genre::Rock,
        year: 2001,
        ..card.clone()
    };
    assert_eq!(
        client.try_add_card(&owner, &dup),
        Err(Ok(Error::DuplicateCard.into()))
    );

    // Same title by a different artist is fine.
    let other = sample_card(&env, Genre::Pop, "Artist B", "Title A", 1999);
    assert_eq!(client.add_card(&owner, &other), 2);
}

#[test]
fn update_card_moves_indexes() {
    let (env, client, owner) = setup();
    let a = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999),
    );
    let b = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title B", 1999),
    );
    let c = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title C", 1999),
    );

    let updated = sample_card(&env, Genre::Rock, "Artist Z", "Title A2", 2005);
    client.update_card(&owner, &a, &updated);
    assert_emitted(
        &env,
        &client.address,
        CardUpdated {
            card_id: a,
            genre: Genre::Rock,
        },
    );

    let stored = client.get_card(&a);
    assert_eq!(
        stored,
        Card {
            card_id: a,
            ..updated.clone()
        }
    );
    assert_eq!(client.get_cards_count(), 3);

    assert_eq!(genre_ids(&client, &owner, Genre::Pop), std::vec![b, c]);
    assert_eq!(genre_ids(&client, &owner, Genre::Rock), std::vec![a]);

    client.set_cards_per_round(&owner, &1);
    let artist_z = String::from_str(&env, "Artist Z");
    assert_eq!(
        sorted_ids(client.get_cards_of_artist(&artist_z)),
        std::vec![a]
    );
    assert_eq!(sorted_ids(client.get_cards_of_a_year(&2005)), std::vec![a]);

    client.set_cards_per_round(&owner, &2);
    let artist_a = String::from_str(&env, "Artist A");
    assert_eq!(
        sorted_ids(client.get_cards_of_artist(&artist_a)),
        std::vec![b, c]
    );
    assert_eq!(
        sorted_ids(client.get_cards_of_a_year(&1999)),
        std::vec![b, c]
    );

    // Title + artist of another card is a duplicate; keeping its own is not.
    let clash = sample_card(&env, Genre::Pop, "Artist A", "Title B", 1999);
    assert_eq!(
        client.try_update_card(&owner, &a, &clash),
        Err(Ok(Error::DuplicateCard.into()))
    );
    client.update_card(
        &owner,
        &a,
        &Card {
            year: 2006,
            ..updated.clone()
        },
    );
    assert_eq!(
        client.try_update_card(&owner, &99, &updated),
        Err(Ok(Error::NonExistingCard.into()))
    );

    // The old title + artist is free again.
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999),
    );
}

#[test]
fn remove_card_keeps_indexes_consistent() {
    let (env, client, owner) = setup();
    let a = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999),
    );
    let b = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title B", 1999),
    );
    let c = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title C", 1999),
    );

    client.remove_card(&owner, &a);
    assert_emitted(&env, &client.address, CardRemoved { card_id: a });

    assert_eq!(
        client.try_get_card(&a),
        Err(Ok(Error::NonExistingCard.into()))
    );
    assert_eq!(client.get_cards_count(), 2);
    assert_eq!(genre_ids(&client, &owner, Genre::Pop), std::vec![b, c]);
    let artist_a = String::from_str(&env, "Artist A");
    assert_eq!(
        sorted_ids(client.get_cards_of_artist(&artist_a)),
        std::vec![b, c]
    );
    assert_eq!(
        sorted_ids(client.get_cards_of_a_year(&1999)),
        std::vec![b, c]
    );

    // The moved card (c) can itself be removed cleanly.
    client.remove_card(&owner, &c);
    client.set_cards_per_round(&owner, &1);
    assert_eq!(genre_ids(&client, &owner, Genre::Pop), std::vec![b]);
    assert_eq!(sorted_ids(client.get_cards_of_a_year(&1999)), std::vec![b]);

    client.remove_card(&owner, &b);
    assert_eq!(client.get_cards_count(), 0);
    assert_eq!(client.get_genre_card_count(&Genre::Pop), 0);
    assert_eq!(
        client.try_get_cards_of_artist(&artist_a),
        Err(Ok(Error::ArtistCardsIsZero.into()))
    );
    assert_eq!(
        client.try_remove_card(&owner, &b),
        Err(Ok(Error::NonExistingCard.into()))
    );

    // Ids are not reused.
    let d = client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999),
    );
    assert_eq!(d, 4);
}

#[test]
fn update_and_remove_card_require_admin() {
    let (env, client, owner) = setup();
    let card = sample_card(&env, Genre::Pop, "Artist A", "Title A", 1999);
    let id = client.add_card(&owner, &card);
    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_update_card(&stranger, &id, &card),
        Err(Ok(Error::NotAuthorized.into()))
    );
    assert_eq!(
        client.try_remove_card(&stranger, &id),
        Err(Ok(Error::NotAuthorized.into()))
    );
    let mut cards = Vec::new(&env);
    cards.push_back(card);
    assert_eq!(
        client.try_add_cards(&stranger, &cards),
        Err(Ok(Error::NotAuthorized.into()))
    );
}

#[test]
fn add_cards_batch_of_20_returns_sequential_ids() {
    let (env, client, owner) = setup();
    client.add_card(&owner, &card_n(&env, Genre::Rock, 100));

    let mut cards = Vec::new(&env);
    for n in 0..20 {
        cards.push_back(card_n(&env, Genre::Pop, n));
    }
    let ids = client.add_cards(&owner, &cards);
    assert_eq!(ids.len(), 20);
    for (i, id) in ids.iter().enumerate() {
        assert_eq!(id, i as u64 + 2);
    }

    assert_eq!(client.get_cards_count(), 21);
    assert_eq!(client.get_genre_card_count(&Genre::Pop), 20);
    assert_eq!(
        genre_ids(&client, &owner, Genre::Pop),
        (2..=21).collect::<std::vec::Vec<u64>>()
    );

    client.set_cards_per_round(&owner, &7);
    let artist0 = String::from_str(&env, "Artist 0");
    assert_eq!(client.get_cards_of_artist(&artist0).len(), 7);
    client.set_cards_per_round(&owner, &4);
    assert_eq!(client.get_cards_of_a_year(&1990).len(), 4);
}

#[test]
fn add_cards_is_atomic_and_bounded() {
    let (env, client, owner) = setup();
    let mut cards = Vec::new(&env);
    cards.push_back(card_n(&env, Genre::Pop, 0));
    cards.push_back(card_n(&env, Genre::Pop, 0));
    assert_eq!(
        client.try_add_cards(&owner, &cards),
        Err(Ok(Error::DuplicateCard.into()))
    );
    assert_eq!(client.get_cards_count(), 0);

    let mut cards = Vec::new(&env);
    for n in 0..=MAX_CARDS_PER_BATCH as u64 {
        cards.push_back(card_n(&env, Genre::Pop, n));
    }
    assert_eq!(
        client.try_add_cards(&owner, &cards),
        Err(Ok(Error::BatchTooLarge.into()))
    );
}

/// Backs the `MAX_CARDS_PER_BATCH` figure documented in `onchain/README.md`:
/// a full batch stays within Soroban's per-transaction limits.
#[test]
fn add_cards_max_batch_fits_budget() {
    let (env, client, owner) = setup();
    let mut cards = Vec::new(&env);
    for n in 0..MAX_CARDS_PER_BATCH as u64 {
        cards.push_back(card_n(&env, Genre::Pop, n));
    }
    env.cost_estimate().budget().reset_default();
    client.add_cards(&owner, &cards);
    // Mainnet limits are enforced by default in tests, so reaching this point
    // already proves the batch fits; the asserts document the key figures.
    let res = env.cost_estimate().resources();
    std::println!("add_cards({}) resources: {:?}", MAX_CARDS_PER_BATCH, res);
    assert!(res.instructions <= 400_000_000);
    assert!(res.write_entries <= 200);
}

/// Adding card #1,000 to a genre costs about the same as adding card #1,
/// since indexes are stored per item instead of as one growing vector: the
/// ledger entries and bytes it reads and writes (what the network meters and
/// charges for) stay constant. Instruction counts are not compared because
/// the test host keeps the whole ledger in one in-memory map, so every write
/// gets slower as the test ledger grows regardless of the contract.
#[test]
fn add_card_cost_does_not_grow_with_index_size() {
    let (env, client, owner) = setup();
    env.cost_estimate().disable_resource_limits();
    env.cost_estimate().budget().reset_default();
    client.add_card(&owner, &card_n(&env, Genre::Pop, 0));
    let first = env.cost_estimate().resources();

    env.cost_estimate().budget().reset_unlimited();
    let mut cards = Vec::new(&env);
    for n in 1..999u64 {
        cards.push_back(card_n(&env, Genre::Pop, n));
        if cards.len() == MAX_CARDS_PER_BATCH {
            client.add_cards(&owner, &cards);
            cards = Vec::new(&env);
        }
    }
    if !cards.is_empty() {
        client.add_cards(&owner, &cards);
    }
    assert_eq!(client.get_genre_card_count(&Genre::Pop), 999);

    env.cost_estimate().budget().reset_default();
    client.add_card(&owner, &card_n(&env, Genre::Pop, 999));
    let thousandth = env.cost_estimate().resources();

    assert_eq!(thousandth.memory_read_entries, first.memory_read_entries);
    assert_eq!(thousandth.disk_read_entries, first.disk_read_entries);
    assert_eq!(thousandth.write_entries, first.write_entries);
    // Only the grown id/position numbers differ in encoded size.
    assert!(thousandth.write_bytes <= first.write_bytes + 16);
    assert!(thousandth.disk_read_bytes <= first.disk_read_bytes + 16);
}

/// Chosen behaviour: answers after the card window are accepted but scored
/// as wrong, so the player still completes the card.
#[test]
fn answer_after_card_window_is_scored_as_wrong() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(10);
    let card = next_card_full(&env, &client, &owner, round_id);
    env.ledger()
        .set_timestamp(10 + CARD_ANSWER_WINDOW_SECONDS + 1);
    assert!(!client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    assert_eq!(
        client.get_round_scores(&round_id).get(owner.clone()),
        Some(0)
    );

    // Answering was recorded, so the round can finalize; end_time is set to
    // the completion time.
    client.finalize_round(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert!(round.is_completed);
    assert_eq!(round.end_time, 10 + CARD_ANSWER_WINDOW_SECONDS + 1);
}
