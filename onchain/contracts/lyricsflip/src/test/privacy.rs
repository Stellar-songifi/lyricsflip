use super::*;

// ---------------------------------------------------------------------------
// LF-278 – no public view or event maps a live card to its answer
// ---------------------------------------------------------------------------

#[test]
fn attacker_cannot_recover_live_answer_from_views_or_events() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &4);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    client.start_round(&owner, &round_id);
    // Ground truth, as only the drawing player would see it.
    client.next_card(&owner, &round_id);
    let empty = String::from_str(&env, "");

    // Event: CardDrawn carries no card id.
    assert_emitted(&env, &client.address, CardDrawn { round_id, index: 0 });
    let live = current_card_full(&env, &client, &owner, round_id);

    // Catalogue reads draw `cards_per_round` cards; lower it so the artist
    // and year lookups (one matching card each) have enough cards. The live
    // round keeps the four cards it already snapshotted.
    client.set_cards_per_round(&owner, &1);

    // Views: every round card, looked up any public way, comes back redacted.
    let assert_redacted = |c: &Card| {
        assert_eq!(c.title, empty, "title leaked for card {}", c.card_id);
        assert_eq!(c.artist, empty, "artist leaked for card {}", c.card_id);
        assert_eq!(c.year, 0, "year leaked for card {}", c.card_id);
    };
    // Card ids are assumed known (e.g. read off-ledger); the view must still redact.
    for card_id in client.get_round_cards(&owner, &round_id).iter() {
        assert_redacted(&client.get_card(&card_id));
    }
    for c in client.get_cards_of_genre(&Genre::Pop).iter() {
        assert_redacted(&c);
    }
    for c in client.get_cards_of_artist(&live.artist).iter() {
        assert_redacted(&c);
    }
    for c in client.get_cards_of_a_year(&live.year).iter() {
        assert_redacted(&c);
    }

    // After the round is over, the reveal event and full card are public.
    env.ledger()
        .set_timestamp(NOW + MAX_ROUND_DURATION_SECONDS + MAX_ROUND_BUFFER_SECONDS + 1);
    client.finalize_round(&owner, &round_id);
    assert_emitted(
        &env,
        &client.address,
        CardRevealed {
            round_id,
            index: 0,
            card_id: live.card_id,
        },
    );
    assert_eq!(client.get_card(&live.card_id).title, live.title);
}
