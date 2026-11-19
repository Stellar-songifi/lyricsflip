use super::*;

#[test]
fn build_question_card_title_kind_has_four_unique_options_with_correct_title() {
    let (env, client, owner) = setup();
    seed_diverse_cards(&env, &client, &owner);
    client.set_cards_per_round(&owner, &5);

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &42u64, &QuestionKind::Title);

    assert_eq!(q.kind, QuestionKind::Title);
    assert_four_unique_options_with_correct(&env, &q, &card.title);
}

#[test]
fn build_question_card_artist_kind_has_four_unique_options_with_correct_artist() {
    let (env, client, owner) = setup();
    seed_diverse_cards(&env, &client, &owner);
    client.set_cards_per_round(&owner, &5);

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &99u64, &QuestionKind::Artist);

    assert_eq!(q.kind, QuestionKind::Artist);
    assert_four_unique_options_with_correct(&env, &q, &card.artist);
}

#[test]
fn build_question_card_year_kind_has_four_unique_options_with_correct_year() {
    let (env, client, owner) = setup();
    seed_diverse_cards(&env, &client, &owner);
    client.set_cards_per_round(&owner, &5);

    let card = client.get_card(&1);
    // Correct year as string.
    let correct_year_str = {
        let y = card.year;
        let mut tmp = [0u8; 20];
        let mut len = 0usize;
        let mut m = y;
        while m > 0 {
            tmp[len] = b'0' + (m % 10) as u8;
            m /= 10;
            len += 1;
        }
        let mut buf = [0u8; 20];
        for i in 0..len {
            buf[i] = tmp[len - 1 - i];
        }
        String::from_str(&env, core::str::from_utf8(&buf[..len]).unwrap_or("0"))
    };

    let q = client.build_question_card(&card, &7u64, &QuestionKind::Year);

    assert_eq!(q.kind, QuestionKind::Year);
    assert_four_unique_options_with_correct(&env, &q, &correct_year_str);
}

#[test]
fn build_question_card_year_distractors_are_close_to_correct_year() {
    let (env, client, owner) = setup();
    seed_diverse_cards(&env, &client, &owner);
    client.set_cards_per_round(&owner, &5);

    let card = client.get_card(&1); // year = 2018
    let q = client.build_question_card(&card, &3u64, &QuestionKind::Year);

    // All four options should be within ±5 years of the correct year.
    let options = [
        q.option_one.clone(),
        q.option_two.clone(),
        q.option_three.clone(),
        q.option_four.clone(),
    ];
    for opt in options.iter() {
        // Parse the year string without std (the contract stores years as
        // plain decimal `String`s via `u64_to_string`).
        let parsed = parse_year_u64(opt) as i64;
        let diff = (parsed - card.year as i64).abs();
        assert!(
            diff <= 5,
            "distractor year {parsed} is more than 5 away from {}",
            card.year
        );
    }
}

// ---------------------------------------------------------------------------
// build_question_card — LF-010 small card sets
// ---------------------------------------------------------------------------

/// 4 distinct cards: a question card must still have 4 unique options —
/// including the correct one — without panicking with `AmountExceedsLimit`.
#[test]
fn build_question_card_with_four_distinct_cards_has_four_unique_options() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &4);

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &42u64, &QuestionKind::Title);

    assert_eq!(q.kind, QuestionKind::Title);
    assert_four_unique_options_with_correct(&env, &q, &card.title);
}

/// 3 cards: fewer than 4 distinct titles exist, so the call must fail with
/// `NotEnoughDistinctCards` instead of looping until the CPU budget is burned
/// (or panicking with `AmountExceedsLimit`, which 3 < 10 used to trigger).
#[test]
fn build_question_card_with_three_cards_fails_with_not_enough_distinct_cards() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &3);

    let card = client.get_card(&1);
    let result = client.try_build_question_card(&card, &99u64, &QuestionKind::Title);

    let inner = result.unwrap_err();
    let code: u32 = match inner {
        Ok(e) => {
            assert!(
                e.is_type(xdr::ScErrorType::Contract),
                "expected a contract error, got {:?}",
                e
            );
            e.get_code()
        }
        Err(soroban_sdk::InvokeError::Contract(c)) => c,
        Err(other) => panic!("expected NotEnoughDistinctCards, got {:?}", other),
    };
    assert_eq!(code, Error::NotEnoughDistinctCards as u32);
}

/// 15 cards: the call must succeed (catalogue larger than the old fixed
/// sample of 10) and produce 4 unique options.
#[test]
fn build_question_card_with_fifteen_cards_succeeds() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 15);
    client.set_cards_per_round(&owner, &15);

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &7u64, &QuestionKind::Title);

    assert_eq!(q.kind, QuestionKind::Title);
    assert_four_unique_options_with_correct(&env, &q, &card.title);
}

#[test]
fn lf160_current_year_card_options_are_within_bounds() {
    let (env, client, owner) = setup();
    let current_year = 1970 + env.ledger().timestamp() / 31_556_952;
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "A", "T", current_year),
    );
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "B", "T2", current_year - 1),
    );
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "C", "T3", current_year - 2),
    );
    client.add_card(
        &owner,
        &sample_card(&env, Genre::Pop, "D", "T4", current_year - 3),
    );

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &7u64, &QuestionKind::Year);
    for year in parse_all_year_options(&q).iter() {
        assert!(
            *year >= 1900 && *year <= current_year,
            "option {year} outside [1900, {current_year}]"
        );
    }
}

#[test]
fn lf160_min_year_card_options_are_within_bounds() {
    let (env, client, owner) = setup();
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "A", "T", 1900));
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "B", "T2", 1901));
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "C", "T3", 1902));
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "D", "T4", 1903));

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &7u64, &QuestionKind::Year);
    for year in parse_all_year_options(&q).iter() {
        assert!(*year >= 1900, "option {year} is below MIN_CARD_YEAR");
    }
}

#[test]
fn lf160_edge_year_card_still_has_four_unique_options() {
    let (env, client, owner) = setup();
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "A", "T", 1900));
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "B", "T2", 1950));
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "C", "T3", 2000));
    client.add_card(&owner, &sample_card(&env, Genre::Pop, "D", "T4", 2010));

    let card = client.get_card(&1);
    let q = client.build_question_card(&card, &11u64, &QuestionKind::Year);
    let opts = [
        q.option_one.clone(),
        q.option_two.clone(),
        q.option_three.clone(),
        q.option_four.clone(),
    ];
    for i in 0..4 {
        for j in (i + 1)..4 {
            assert_ne!(opts[i], opts[j], "duplicate option at {i},{j}");
        }
    }
}
