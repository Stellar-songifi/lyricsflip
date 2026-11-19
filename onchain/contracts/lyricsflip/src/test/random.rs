use super::*;

// ---------------------------------------------------------------------------
// LF-011 – partial Fisher-Yates is O(limit), not O(coupon-collector)
// ---------------------------------------------------------------------------

/// Confirms that `get_random_numbers(amount=50, limit=50)` — the worst-case
/// scenario that caused the coupon-collector blowup — now runs in a fixed
/// number of iterations. We check this indirectly: seed the contract with
/// `MAX_CARDS_PER_ROUND` cards, call `get_cards_of_genre` (which internally
/// calls `get_random_numbers(amount == limit)`), and assert every card comes
/// back with no panics or budget exhaustion.
#[test]
fn get_random_numbers_worst_case_amount_equals_limit() {
    let (env, client, owner) = setup();

    // LF-154 caps cards per round, so the worst case is now
    // amount == limit == MAX_CARDS_PER_ROUND.
    for i in 0..MAX_CARDS_PER_ROUND as u64 {
        let title = soroban_sdk::String::from_str(&env, &std::format!("T{}", i));
        // Unique titles via seeded shuffle are not required here; we only care
        // that the function returns every card without panicking.
        let card = Card {
            card_id: 0,
            genre: Genre::Pop,
            artist: soroban_sdk::String::from_str(&env, "A"),
            title,
            year: 1950 + i,
            difficulty: 2,
            lyrics: soroban_sdk::String::from_str(&env, "lyric"),
        };
        client.add_card(&owner, &card);
    }
    client.set_cards_per_round(&owner, &MAX_CARDS_PER_ROUND);

    // This must complete without panicking (no infinite loop).
    let cards = client.get_cards_of_genre(&Genre::Pop);
    assert_eq!(
        cards.len(),
        MAX_CARDS_PER_ROUND,
        "expected every card back when amount == limit"
    );
}

/// Verifies that `get_random_numbers` returns the requested `amount` without
/// panicking across a variety of (amount, limit) pairs and seeds.
#[test]
fn get_random_numbers_returns_correct_count_for_various_inputs() {
    let (env, client, owner) = setup();
    for i in 0..20u64 {
        client.add_card(
            &owner,
            &sample_card(
                &env,
                Genre::Jazz,
                "Artist",
                &std::format!("Title {}", i),
                1970 + i,
            ),
        );
    }

    for amount in [1u32, 5, 10, 15, 20] {
        client.set_cards_per_round(&owner, &amount);
        let cards = client.get_cards_of_genre(&Genre::Jazz);
        assert_eq!(
            cards.len(),
            amount,
            "expected {amount} cards, got {}",
            cards.len()
        );
    }
}
