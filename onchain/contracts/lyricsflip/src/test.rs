//! Representative behavior-coverage tests ported from
//! `onchain/src/tests/test_lyricsflip.cairo` (round lifecycle, card queries,
//! answer submission, and access control). These are written against the
//! soroban-sdk 22 testutils API but have not been `cargo test`-verified in
//! this environment (no Rust toolchain available) — run `cargo test` inside
//! `onchain/` before relying on them.

extern crate std;

use crate::{Answer, Card, Genre, LyricsFlip, LyricsFlipClient, Role};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup<'a>() -> (Env, LyricsFlipClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let owner = Address::generate(&env);
    let contract_id = env.register(LyricsFlip, (owner.clone(),));
    let client = LyricsFlipClient::new(&env, &contract_id);
    (env, client, owner)
}

fn sample_card(env: &Env, genre: Genre, artist: &str, title: &str, year: u64) -> Card {
    Card {
        card_id: 0,
        genre,
        artist: String::from_str(env, artist),
        title: String::from_str(env, title),
        year,
        lyrics: String::from_str(env, "sample lyric line"),
    }
}

#[test]
fn constructor_grants_owner_admin() {
    let (_env, client, owner) = setup();
    assert!(client.is_admin(&Role::Admin, &owner));
}

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
fn create_round_requires_a_genre() {
    let (env, client, owner) = setup();
    let _ = env;
    let result = client.try_create_round(&owner, &None, &1u64);
    assert!(result.is_err());
}

fn seed_cards(env: &Env, client: &LyricsFlipClient, owner: &Address, count: u64) {
    for i in 0..count {
        let card = sample_card(env, Genre::Pop, "Artist A", "Title A", 2000 + i);
        client.add_card(owner, &card);
    }
}

#[test]
fn round_requires_all_players_ready_before_starting() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);

    client.start_round(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert!(
        !round.is_started,
        "round should not auto-start until every player is ready"
    );

    client.start_round(&player2, &round_id);
    let round = client.get_round(&round_id);
    assert!(
        round.is_started,
        "round should start once all players signal ready"
    );
}

#[test]
fn join_round_rejects_duplicate_join() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);

    let result = client.try_join_round(&owner, &round_id);
    assert!(result.is_err(), "the round creator is already a player");
}

#[test]
fn join_round_rejects_after_start() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    client.start_round(&owner, &round_id);

    let late_player = Address::generate(&env);
    let result = client.try_join_round(&late_player, &round_id);
    assert!(result.is_err());
}

#[test]
fn submit_answer_updates_streak_and_reports_correctness() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &7u64);
    client.start_round(&owner, &round_id);

    let round = client.get_round(&round_id);
    assert!(round.is_started);

    let card = client.next_card(&round_id);

    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(correct);

    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.current_streak, 1);
    assert_eq!(stats.max_streak, 1);

    let wrong = client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "definitely not the title")),
    );
    assert!(!wrong);
    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.current_streak, 0);
    assert_eq!(stats.max_streak, 1);
}

#[test]
fn get_cards_of_genre_returns_requested_amount() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 6);
    client.set_cards_per_round(&owner, &4);

    let cards = client.get_cards_of_genre(&Genre::Pop, &99u64);
    assert_eq!(cards.len(), 4);
}

#[test]
fn get_cards_of_a_year_errors_when_empty() {
    let (_env, client, _owner) = setup();
    let result = client.try_get_cards_of_a_year(&1975u64, &1u64);
    assert!(result.is_err());
}

#[test]
fn set_role_is_owner_gated_and_updates_is_admin() {
    let (env, client, owner) = setup();
    let new_admin = Address::generate(&env);
    assert!(!client.is_admin(&Role::Admin, &new_admin));

    client.set_role(&owner, &new_admin, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &new_admin));

    let outsider = Address::generate(&env);
    let result = client.try_set_role(&outsider, &new_admin, &Role::Admin, &false);
    assert!(result.is_err(), "only the owner may grant/revoke admin");
}

// ── LF-011: bounded random sampling ─────────────────────────────────────────

/// Direct unit coverage for the partial Fisher-Yates sampler: full cover,
/// range, determinism, and the card-ID offset.
#[test]
fn lf011_random_numbers_full_cover() {
    let env = Env::default();
    let out = crate::LyricsFlip::get_random_numbers(&env, 42, 50, 50, true);

    assert_eq!(out.len(), 50);

    // Full coverage: every index in 0..50 appears exactly once.
    let mut seen = [false; 50];
    for v in out.iter() {
        assert!(v < 50, "index out of range: {v}");
        assert!(!seen[v as usize], "duplicate index: {v}");
        seen[v as usize] = true;
    }

    // Deterministic for a given (seed, ledger) state.
    let again = crate::LyricsFlip::get_random_numbers(&env, 42, 50, 50, true);
    assert_eq!(out, again);

    // Card-ID mode offsets into 1..=limit.
    let ids = crate::LyricsFlip::get_random_numbers(&env, 7, 50, 50, false);
    assert_eq!(ids.len(), 50);
    for id in ids.iter() {
        assert!((1..=50).contains(&id), "card id out of range: {id}");
    }
}

/// Worst case for the old retry-on-collision sampler: `amount == limit`
/// degenerates into coupon-collector behavior with an unbounded loop.
/// Drives the sampler through `create_round` (50 cards, 50 per round) and
/// records the metered CPU cost of the invocation.
#[test]
fn lf011_random_numbers_bounded_budget() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 50);
    client.set_cards_per_round(&owner, &50);

    // Internally draws amount == limit == 50 via get_random_numbers.
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &9u64);
    assert_eq!(round_id, 1);

    let resources = env.cost_estimate().resources();
    std::println!(
        "LF-011 budget: instructions={} mem_bytes={}",
        resources.instructions,
        resources.mem_bytes
    );
    // Worst-case draw must stay far below mainnet budget limits; the old
    // unbounded loop had no such guarantee.
    assert!(
        resources.instructions < 2_000_000,
        "cpu budget exceeded: {}",
        resources.instructions
    );
}
