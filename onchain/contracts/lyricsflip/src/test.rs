//! Unit tests for the `lyricsflip` contract.
//!
//! Coverage targets:
//! - Every public function (happy path + key error paths).
//! - Every `Error` variant.
//! - `build_question_card` with all three `QuestionKind` values (LF-029).
//! - LF-011 (O(limit) random selection) and LF-012 (TTL survival).
//!
//! Run with `cargo test` inside `onchain/`.

extern crate std;

use crate::{
    Answer, AnswerSubmitted, Card, CardAdded, CardDrawn, CardRemoved, CardUpdated,
    CardsPerRoundUpdated, Error, Genre, LyricsFlip, LyricsFlipClient, Milestone, QuestionKind,
    Role, RoleUpdated, RoundCancelled, RoundCompleted, RoundLeft, CARD_ANSWER_WINDOW_SECONDS,
    DEFAULT_MAX_PLAYERS, LOBBY_TIMEOUT_SECONDS, MAX_CARDS_PER_BATCH, MAX_LYRICS_LEN,
    MAX_PAGE_LIMIT, MAX_ROUND_PLAYERS,
};
use soroban_sdk::{
    testutils::{Address as _, ContractEvents, Events, Ledger},
    Address, Env, Event, Map, String, Vec,
};

/// 2026-05-28, so cards up to year 2026 pass validation.
const NOW: u64 = 1_780_000_000;
use crate::{
    Answer, Card, Error, Genre, LyricsFlip, LyricsFlipClient, Milestone, Role, RoleUpdated,
    RoundCancelled, RoundCompleted, RoundLeft, CARD_ANSWER_WINDOW_SECONDS, DEFAULT_MAX_PLAYERS,
    LOBBY_TIMEOUT_SECONDS, MAX_PAGE_LIMIT,
};
use soroban_sdk::{
    events::Event as _,
    testutils::{Address as _, ContractEvents, Events, Ledger},
    Address, Env, Map, String,
};
//! Unit tests for the `lyricsflip` contract.
//!
//! Coverage targets:
//! - Every public function (happy path + key error paths).
//! - Every `Error` variant.
//! - `build_question_card` with all three `QuestionKind` values (LF-029)
//!   plus the LF-010 small-card-set edge cases.
//!
//! Run with `cargo test` inside `onchain/`.

use crate::{
    Answer, Card, Error, Genre, LyricsFlip, LyricsFlipClient, QuestionKind, Role, MAX_PAGE_LIMIT,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    xdr, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

fn setup<'a>() -> (Env, LyricsFlipClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
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

/// Seed N cards with the same genre, cycling through distinct artists/titles
/// so `build_question_card` can always find 3 unique distractors.
fn seed_cards(env: &Env, client: &LyricsFlipClient, owner: &Address, count: u64) {
    seed_cards_genre(env, client, owner, count, Genre::Pop);
}

fn seed_cards_genre(
    env: &Env,
    client: &LyricsFlipClient,
    owner: &Address,
    count: u64,
    genre: Genre,
) {
    for i in 0..count {
        // Each card gets a unique artist and title so artist/title distractor
        // generation always finds 3 distinct values.
        let artist = alloc_string(env, &format_u64("Artist", i));
        let title = alloc_string(env, &format_u64("Title", i));
        let card = Card {
            card_id: 0,
            genre,
            artist,
            title,
            year: 2000 + i,
            lyrics: String::from_str(env, "sample lyric line"),
        };
        client.add_card(owner, &card);
    }
}

/// Build a string of the form `<prefix><number>` without std::format!.
fn format_u64(prefix: &str, n: u64) -> [u8; 32] {
    let prefix_bytes = prefix.as_bytes();
    let mut buf = [0u8; 32];
    let mut tmp = [0u8; 20];
    let mut len = 0usize;
    let mut m = n;
    if m == 0 {
        tmp[0] = b'0';
        len = 1;
    } else {
        while m > 0 {
            tmp[len] = b'0' + (m % 10) as u8;
            m /= 10;
            len += 1;
        }
    }
    let p = prefix_bytes.len().min(12);
    buf[..p].copy_from_slice(&prefix_bytes[..p]);
    for i in 0..len {
        buf[p + i] = tmp[len - 1 - i];
    }
    buf
}

fn alloc_string(env: &Env, bytes: &[u8; 32]) -> String {
    // find actual length (NUL-terminated)
    let mut end = 32;
    while end > 0 && bytes[end - 1] == 0 {
        end -= 1;
    }
    // We know bytes are ASCII, so convert via &str.
    let s = core::str::from_utf8(&bytes[..end]).unwrap_or("X");
    String::from_str(env, s)
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

#[test]
fn constructor_grants_owner_admin() {
    let (_env, client, owner) = setup();
    assert!(client.is_admin(&Role::Admin, &owner));
}

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
// set_cards_per_round
// ---------------------------------------------------------------------------

#[test]
fn set_cards_per_round_rejects_zero() {
    let (_env, client, owner) = setup();
    let result = client.try_set_cards_per_round(&owner, &0);
    assert!(result.is_err());
}

#[test]
fn set_cards_per_round_requires_admin() {
    let (env, client, _owner) = setup();
    let non_admin = Address::generate(&env);
    let result = client.try_set_cards_per_round(&non_admin, &5);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// create_round
// ---------------------------------------------------------------------------

#[test]
fn create_round_requires_a_genre() {
    let (env, client, owner) = setup();
    let _ = env;
    let result = client.try_create_round(&owner, &None, &1u64);
    assert!(result.is_err());
}

#[test]
fn round_count_tracks_creates() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    assert_eq!(client.get_round_count(), 0);

    for seed in 0..3u64 {
        client.create_round(&owner, &Some(Genre::Pop), &seed);
    }
    assert_eq!(client.get_round_count(), 3);
}

// ---------------------------------------------------------------------------
// join_round
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// start_round / ready tracking
// ---------------------------------------------------------------------------

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
fn total_rounds_increments_once_per_player_when_three_player_round_starts() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);

    let player2 = Address::generate(&env);
    let player3 = Address::generate(&env);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64);
    client.join_round(&player2, &round_id);
    client.join_round(&player3, &round_id);

    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);
    client.start_round(&player3, &round_id);

    let round = client.get_round(&round_id);
    assert!(
        round.is_started,
        "round should start once all players are ready"
    );

    assert_eq!(client.get_player_stat(&owner).total_rounds, 1);
    assert_eq!(client.get_player_stat(&player2).total_rounds, 1);
    assert_eq!(client.get_player_stat(&player3).total_rounds, 1);
}

#[test]
fn total_rounds_unchanged_when_round_never_fully_starts() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);

    let player2 = Address::generate(&env);
    let player3 = Address::generate(&env);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64);
    client.join_round(&player2, &round_id);
    client.join_round(&player3, &round_id);

    // Only some players mark ready; the round never reaches full ready count.
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    let round = client.get_round(&round_id);
    assert!(
        !round.is_started,
        "round should not start until every player is ready"
    );

    assert_eq!(client.get_player_stat(&owner).total_rounds, 0);
    assert_eq!(client.get_player_stat(&player2).total_rounds, 0);
    assert_eq!(client.get_player_stat(&player3).total_rounds, 0);
}

#[test]
fn start_round_rejects_already_ready_player() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);

    client.start_round(&owner, &round_id);
    // Second ready call by the same player should fail.
    let result = client.try_start_round(&owner, &round_id);
    assert!(result.is_err());
}

#[test]
fn start_round_rejects_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);

    let outsider = Address::generate(&env);
    let result = client.try_start_round(&outsider, &round_id);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// next_card
// ---------------------------------------------------------------------------

#[test]
fn next_card_advances_index_and_completes_round() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    client.start_round(&owner, &round_id);

    let _c1 = client.next_card(&round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 1);
    assert!(!round.is_completed);

    let _c2 = client.next_card(&round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 2);
    // `finalize_round` completes the round, so the last card can still be answered.
    assert!(!round.is_completed);
    assert_eq!(
        client.try_next_card(&round_id),
        Err(Ok(Error::RoundCompleted.into()))
    );
}

#[test]
fn next_card_errors_when_round_not_started() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);

    let result = client.try_next_card(&round_id);
    assert!(result.is_err());
}

#[test]
fn next_card_errors_when_round_completed() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 1);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    client.start_round(&owner, &round_id);
    client.next_card(&round_id);

    let result = client.try_next_card(&round_id);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// build_question_card — LF-029
// ---------------------------------------------------------------------------

/// Seed cards with enough variety that all three question kinds can find
/// 3 unique distractors. We need ≥4 distinct titles, artists, and years.
fn seed_diverse_cards(env: &Env, client: &LyricsFlipClient, owner: &Address) {
    let data = [
        (Genre::Pop, "Drake", "God's Plan", 2018u64),
        (Genre::Pop, "Rihanna", "Umbrella", 2007),
        (Genre::Pop, "Adele", "Rolling in the Deep", 2010),
        (Genre::Pop, "Ed Sheeran", "Shape of You", 2017),
        (Genre::Pop, "Beyonce", "Crazy in Love", 2003),
        (Genre::Rock, "Nirvana", "Smells Like Teen Spirit", 1991),
        (Genre::Rock, "Queen", "Bohemian Rhapsody", 1975),
        (Genre::Rock, "The Beatles", "Let It Be", 1970),
        (Genre::HipHop, "Kendrick Lamar", "HUMBLE.", 2017),
        (Genre::HipHop, "Jay-Z", "Empire State of Mind", 2009),
    ];
    for (genre, artist, title, year) in data.iter() {
        client.add_card(
            owner,
            &Card {
                card_id: 0,
                genre: *genre,
                artist: String::from_str(env, artist),
                title: String::from_str(env, title),
                year: *year,
                lyrics: String::from_str(env, "na na na na"),
            },
        );
    }
}

/// Assert that the four options are all distinct strings and that one of them
/// matches `correct`.
fn assert_four_unique_options_with_correct(env: &Env, q: &crate::QuestionCard, correct: &String) {
    let opts = [
        q.option_one.clone(),
        q.option_two.clone(),
        q.option_three.clone(),
        q.option_four.clone(),
    ];
    // All four must be distinct.
    for i in 0..4 {
        for j in (i + 1)..4 {
            assert_ne!(opts[i], opts[j], "options must be distinct");
        }
    }
    // Exactly one must equal the correct answer.
    let found = opts.iter().any(|o| o == correct);
    assert!(found, "correct answer not present in options");
    let _ = env;
}

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
        // Parse the year string.
        let bytes = std::string::ToString::to_string(opt);
        let parsed: i64 = bytes.parse().expect("year option should be a number");
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

/// Parse a decimal `soroban_sdk::String` into a `u64` without std.
fn parse_year_u64(s: &soroban_sdk::String) -> u64 {
    let mut n: u64 = 0;
    for byte in s.to_bytes().iter() {
        n = n.wrapping_mul(10).wrapping_add((byte - b'0') as u64);
    }
    n
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

// ---------------------------------------------------------------------------
// submit_answer
// ---------------------------------------------------------------------------

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

    client.next_card(&round_id);
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
fn submit_answer_artist_kind_accepted() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &5u64);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Artist(card.artist.clone()));
    assert!(correct);
}

#[test]
fn submit_answer_year_kind_accepted() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &6u64);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Year(card.year));
    assert!(correct);
}

#[test]
fn submit_answer_rejects_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &8u64);
    client.start_round(&owner, &round_id);
    client.next_card(&round_id);

    let outsider = Address::generate(&env);
    let result = client.try_submit_answer(
        &outsider,
        &round_id,
        &Answer::Title(String::from_str(&env, "x")),
    );
    assert!(result.is_err());
}

#[test]
fn submit_answer_rejects_on_unstarted_round() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &9u64);

    let result = client.try_submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "x")),
    );
    assert!(result.is_err());
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
                title: String::from_str(&env, &std::format!("Song {}", i)),
                title: alloc_string(&env, &format_u64("Song ", i)),
                year: 2000 + i,
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
                artist: String::from_str(&env, &std::format!("Artist {}", i)),
                title: String::from_str(&env, &std::format!("Track {}", i)),
                artist: alloc_string(&env, &format_u64("Artist ", i)),
                title: alloc_string(&env, &format_u64("Track ", i)),
                year: 1990,
                lyrics: String::from_str(&env, "lyric"),
            },
        );
    }
    client.set_cards_per_round(&owner, &2);

    let cards = client.get_cards_of_a_year(&1990u64, &55u64);
    assert_eq!(cards.len(), 2);
}

// ---------------------------------------------------------------------------
// set_role / is_admin
// ---------------------------------------------------------------------------

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

fn assert_emitted(env: &Env, contract_id: &Address, event: impl Event) {
    let expected = event.to_xdr(env, contract_id);
    assert!(
        env.events().all().events().contains(&expected),
        "expected event {:?} was not emitted",
        expected
    );
}
// ---------------------------------------------------------------------------
// finalize_round
// ---------------------------------------------------------------------------

fn assert_round_completed_event(
    env: &Env,
    events: &ContractEvents,
    contract_id: &Address,
    round_id: u64,
    winners: &soroban_sdk::Vec<Address>,
    scores: &Map<Address, u64>,
) {
    let expected = RoundCompleted {
        round_id,
        winners: winners.clone(),
        scores: scores.clone(),
    }
    .to_xdr(env, contract_id);
    assert!(
        events.events().contains(&expected),
        "expected RoundCompleted event to include the winning scores and round id"
    );
}

#[test]
fn finalize_round_e2e_single_winner_updates_stats_and_scores() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let first_card = client.next_card(&round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(first_card.title.clone())));
    env.ledger().set_timestamp(130);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-a"))
    ));

    env.ledger().set_timestamp(195);
    let second_card = client.next_card(&round_id);
    env.ledger().set_timestamp(200);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(second_card.title.clone())));
    env.ledger().set_timestamp(240);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-b"))
    ));

    let scores = client.get_round_scores(&round_id);
    // Two correct answers, 5s after each draw: 2 * (100 - 5 * 5).
    assert_eq!(scores.get(owner.clone()).unwrap(), 150u64);
    assert_eq!(scores.get(player2.clone()).unwrap(), 0u64);

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    let owner_stats = client.get_player_stat(&owner);
    assert_eq!(owner_stats.rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);

    let winners = soroban_sdk::vec![&env, owner.clone()];
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);

    let event_count_before_second_finalize = env
        .events()
        .all()
        .filter_by_contract(&client.address)
        .events()
        .len();
    let second_attempt = client.try_finalize_round(&owner, &round_id);
    assert!(second_attempt.is_err());
}

#[test]
fn finalize_round_e2e_deadline_path_works_without_all_answers() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &99u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(45);
    let card = client.next_card(&round_id);
    env.ledger().set_timestamp(50);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    env.ledger().set_timestamp(70);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "not-the-answer"))
    ));

    let round = client.get_round(&round_id);
    env.ledger().set_timestamp(round.end_time + 1);

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.rounds_won, 1);
    let winners = soroban_sdk::vec![&env, owner.clone()];
    assert_round_completed_event(
        &env,
        &events,
        &client.address,
        round_id,
        &winners,
        &client.get_round_scores(&round_id),
    );
}

#[test]
fn finalize_round_e2e_tie_breaks_by_total_answer_time() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &3u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    env.ledger().set_timestamp(104);
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(card.title.clone())));

    client.finalize_round(&owner, &round_id);

    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
}

#[test]
fn finalize_round_e2e_exact_score_and_time_tie_produces_co_winners() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &11u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(card.title.clone())));

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 1);

    let winners = soroban_sdk::vec![&env, owner.clone(), player2.clone()];
    let scores = client.get_round_scores(&round_id);
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);
}

#[test]
fn finalize_round_rejects_early_and_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &17u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    let err = client.try_finalize_round(&owner, &round_id);
    assert!(err.is_err());

    let outsider = Address::generate(&env);
    let outsider_err = client.try_finalize_round(&outsider, &round_id);
    assert!(outsider_err.is_err());
}

#[test]
fn finalize_round_e2e_no_correct_answers_has_no_winners() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &17u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    client.next_card(&round_id);
    env.ledger().set_timestamp(100);
    assert!(!client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong"))
    ));
    env.ledger().set_timestamp(150);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-two"))
    ));

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    assert_eq!(client.get_player_stat(&owner).rounds_won, 0);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);

    let scores = client.get_round_scores(&round_id);
    assert_eq!(scores.get(owner.clone()).unwrap(), 0u64);
    assert_eq!(scores.get(player2.clone()).unwrap(), 0u64);

    let winners = soroban_sdk::vec![&env];
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);
}

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

#[test]
fn get_rounds_paginates_and_respects_limit() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    for seed in 0..5u64 {
        client.create_round(&owner, &Some(Genre::Pop), &seed);
    }

    let page = client.get_rounds(&1, &2);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap().round_id, 1);
    assert_eq!(page.get(1).unwrap().round_id, 2);

    let page = client.get_rounds(&4, &10);
    assert_eq!(page.len(), 2, "only rounds 4 and 5 remain");
    assert_eq!(page.get(0).unwrap().round_id, 4);

    // Round ids start at 1, so start = 0 behaves like start = 1.
    assert_eq!(client.get_rounds(&0, &1).get(0).unwrap().round_id, 1);
    assert_eq!(client.get_rounds(&6, &10).len(), 0);
    assert_eq!(client.get_rounds(&1, &0).len(), 0);
}

#[test]
fn get_rounds_clamps_limit_to_max() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let total = MAX_PAGE_LIMIT as u64 + 5;
    for seed in 0..total {
        client.create_round(&owner, &Some(Genre::Pop), &seed);
    }

    let page = client.get_rounds(&1, &u32::MAX);
    assert_eq!(page.len(), MAX_PAGE_LIMIT);
    assert_eq!(client.get_open_rounds(&0, &u32::MAX).len(), MAX_PAGE_LIMIT);
}

#[test]
fn open_rounds_drop_rounds_once_started() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    let r1 = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    let r2 = client.create_round(&owner, &Some(Genre::Pop), &2u64);
    let r3 = client.create_round(&owner, &Some(Genre::Pop), &3u64);

    let open = client.get_open_rounds(&0, &10);
    assert_eq!(open.len(), 3);
    assert_eq!(open.get(0).unwrap(), r1);

    // A round with a second player stays open until everyone is ready.
    let player = Address::generate(&env);
    client.join_round(&player, &r2);
    client.start_round(&owner, &r2);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 3);
    client.start_round(&player, &r2);

    client.start_round(&owner, &r1);

    let open = client.get_open_rounds(&0, &10);
    assert_eq!(open.len(), 1);
    assert_eq!(open.get(0).unwrap(), r3);

    // Offset pagination.
    assert_eq!(client.get_open_rounds(&1, &10).len(), 0);
    assert_eq!(client.get_open_rounds(&5, &10).len(), 0);
}

// ---------------------------------------------------------------------------
// Error code stability
// ---------------------------------------------------------------------------

/// Clients map on these numeric codes; renumbering any of them is a breaking
/// change. Update `onchain/README.md` and `frontend/src/lib/stellar/errors.ts`
/// together with this test.
#[test]
fn error_codes_are_stable() {
    let expected = [
        (Error::AlreadyInitialized, 1u32),
        (Error::NonExistingRound, 2),
        (Error::RoundAlreadyStarted, 3),
        (Error::NonExistingGenre, 4),
        (Error::RoundAlreadyJoined, 5),
        (Error::InvalidCardsPerRound, 6),
        (Error::ArtistCardsIsZero, 7),
        (Error::EmptyYearCards, 8),
        (Error::EmptyGenreCards, 9),
        (Error::RoundNotStarted, 10),
        (Error::RoundCompleted, 11),
        (Error::NotAParticipant, 12),
        (Error::AlreadyReady, 13),
        (Error::NotAuthorized, 14),
        (Error::AmountExceedsLimit, 15),
        (Error::LimitMustBeGreaterThanZero, 16),
        (Error::NonExistingCard, 17),
        (Error::RoundNotReady, 18),
        (Error::RoundAlreadyFinalized, 19),
        (Error::NotEnoughDistinctCards, 20),
        (Error::RoundCancelled, 20),
        (Error::RoundFull, 21),
        (Error::InvalidMaxPlayers, 22),
        (Error::NftContractNotSet, 23),
        (Error::MilestoneNotReached, 24),
        (Error::MilestoneAlreadyClaimed, 25),
        (Error::InvalidCardTitle, 26),
        (Error::InvalidCardArtist, 27),
        (Error::InvalidCardLyrics, 28),
        (Error::InvalidCardYear, 29),
        (Error::LyricsTooLong, 30),
        (Error::DuplicateCard, 31),
        (Error::BatchTooLarge, 32),
        (Error::NotPendingOwner, 33),
    ];
    for (variant, code) in expected {
        assert_eq!(variant as u32, code, "{:?} was renumbered", variant);
    }
}

// ---------------------------------------------------------------------------
// LF-011 – partial Fisher-Yates is O(limit), not O(coupon-collector)
// ---------------------------------------------------------------------------

/// Confirms that `get_random_numbers(amount=50, limit=50)` — the worst-case
/// scenario that caused the coupon-collector blowup — now runs in a fixed
/// number of iterations. We check this indirectly: seed the contract with 50
/// cards, call `get_cards_of_genre` (which internally calls
/// `get_random_numbers(amount=50, limit=50)`), and assert the result is
/// exactly 50 distinct card IDs with no panics or budget exhaustion.
#[test]
fn get_random_numbers_worst_case_amount_equals_limit() {
    let (env, client, owner) = setup();

    // Add 50 distinct cards (all Pop genre).
    for i in 0..50u64 {
        let title = soroban_sdk::String::from_str(&env, &std::format!("T{}", i));
        // Unique titles via seeded shuffle are not required here; we only care
        // that the function returns 50 results without panicking.
        let card = Card {
            card_id: 0,
            genre: Genre::Pop,
            artist: soroban_sdk::String::from_str(&env, "A"),
            title,
            year: 1950 + i,
            lyrics: soroban_sdk::String::from_str(&env, "lyric"),
        };
        client.add_card(&owner, &card);
    }
    client.set_cards_per_round(&owner, &50);

    // This must complete without panicking (no infinite loop).
    let cards = client.get_cards_of_genre(&Genre::Pop, &12345u64);
    assert_eq!(
        cards.len(),
        50,
        "expected exactly 50 cards back when amount == limit == 50"
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
        let cards = client.get_cards_of_genre(&Genre::Jazz, &(amount as u64 * 7 + 3));
        assert_eq!(
            cards.len(),
            amount,
            "expected {amount} cards, got {}",
            cards.len()
        );
    }
}

// ---------------------------------------------------------------------------
// LF-012 – persistent storage survives a ledger advance past default TTL
// ---------------------------------------------------------------------------

/// After gameplay entries (cards, round, player stats) are written and the
/// ledger sequence advances well past Soroban's default minimum TTL, the
/// entries are still readable because `extend_ttl` was called on write.
#[test]
fn ttl_survival_game_entries_survive_ledger_advance() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &77u64);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&round_id);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // Advance ledger sequence far beyond the Soroban default minimum TTL
    // (4 096 ledgers). If entries were never extended they would be
    // unreadable at this point.
    env.ledger().set_sequence_number(100_000);

    // All entries written during gameplay must still be readable.
    let _round = client.get_round(&round_id);
    let _card_back = client.get_card(&1);
    let stats = client.get_player_stat(&owner);
    assert_eq!(
        stats.total_rounds, 1,
        "player stats should still be readable after ledger advance"
    );
    assert_eq!(stats.current_streak, 1);
}

/// Cards added before a large ledger advance are still readable afterwards.
#[test]
fn ttl_survival_cards_survive_ledger_advance() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);

    env.ledger().set_sequence_number(200_000);

    // Cards and genre index should still be accessible.
    let _card = client.get_card(&1);
    let cards = client.get_cards_of_genre(&Genre::Pop, &999u64);
    assert_eq!(cards.len(), 3);
}

#[test]
fn leave_round_refunds_wager_and_frees_the_seat() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&player2, &round_id);

    client.leave_round(&player2, &round_id);
    let events = env.events().all();
    let expected = RoundLeft {
        round_id,
        player: player2.clone(),
        refunded: client.get_round(&round_id).wager_amount,
    }
    .to_xdr(&env, &client.address);
    assert!(events.events().contains(&expected));

    assert_eq!(client.get_players_round_count(&round_id), 1);
    // player2's ready flag is dropped, so the admin alone starts the round.
    client.start_round(&owner, &round_id);
    assert!(client.get_round(&round_id).is_started);
}

#[test]
fn leave_round_fails_after_start_and_for_admin() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);

    assert_eq!(
        client.try_leave_round(&owner, &round_id),
        Err(Ok(Error::NotAuthorized.into()))
    );
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);
    assert_eq!(
        client.try_leave_round(&player2, &round_id),
        Err(Ok(Error::RoundAlreadyStarted.into()))
    );
}

#[test]
fn cancel_round_refunds_everyone_and_blocks_join_and_start() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);

    client.cancel_round(&owner, &round_id);
    let events = env.events().all();
    let expected = RoundCancelled {
        round_id,
        cancelled_by: owner.clone(),
        refunded_players: soroban_sdk::vec![&env, owner.clone(), player2.clone()],
        refund_per_player: 0,
    }
    .to_xdr(&env, &client.address);
    assert!(events.events().contains(&expected));

    assert!(client.get_round(&round_id).is_cancelled);
    assert_eq!(client.get_open_rounds(&0, &10).len(), 0);
    let late = Address::generate(&env);
    assert_eq!(
        client.try_join_round(&late, &round_id),
        Err(Ok(Error::RoundCancelled.into()))
    );
    assert_eq!(
        client.try_start_round(&player2, &round_id),
        Err(Ok(Error::RoundCancelled.into()))
    );
    assert_eq!(
        client.try_cancel_round(&owner, &round_id),
        Err(Ok(Error::RoundCancelled.into()))
    );
}

#[test]
fn anyone_can_cancel_only_after_lobby_timeout() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    env.ledger().set_timestamp(1_000);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_cancel_round(&stranger, &round_id),
        Err(Ok(Error::NotAuthorized.into()))
    );
    env.ledger().set_timestamp(1_000 + LOBBY_TIMEOUT_SECONDS);
    client.cancel_round(&stranger, &round_id);
    assert!(client.get_round(&round_id).is_cancelled);
}

#[test]
fn join_round_fails_with_round_full_past_max_players() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    assert_eq!(client.get_max_players(), DEFAULT_MAX_PLAYERS);
    client.set_max_players(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
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

fn card_n(env: &Env, genre: Genre, n: u64) -> Card {
    let artist = std::format!("Artist {}", n % 3);
    let title = std::format!("Title {}", n);
    sample_card(env, genre, &artist, &title, 1990 + n % 5)
}

fn genre_ids(client: &LyricsFlipClient, owner: &Address, genre: Genre) -> std::vec::Vec<u64> {
    // Draw every card of the genre and collect their ids, sorted.
    let count = client.get_genre_card_count(&genre);
    client.set_cards_per_round(owner, &count);
    let mut ids: std::vec::Vec<u64> = client
        .get_cards_of_genre(&genre, &1)
        .iter()
        .map(|c| c.card_id)
        .collect();
    ids.sort();
    ids
}

fn sorted_ids(cards: Vec<Card>) -> std::vec::Vec<u64> {
    let mut ids: std::vec::Vec<u64> = cards.iter().map(|c| c.card_id).collect();
    ids.sort();
    ids
}

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
        sorted_ids(client.get_cards_of_artist(&artist_z, &1)),
        std::vec![a]
    );
    assert_eq!(
        sorted_ids(client.get_cards_of_a_year(&2005, &1)),
        std::vec![a]
    );

    client.set_cards_per_round(&owner, &2);
    let artist_a = String::from_str(&env, "Artist A");
    assert_eq!(
        sorted_ids(client.get_cards_of_artist(&artist_a, &1)),
        std::vec![b, c]
    );
    assert_eq!(
        sorted_ids(client.get_cards_of_a_year(&1999, &1)),
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
        sorted_ids(client.get_cards_of_artist(&artist_a, &1)),
        std::vec![b, c]
    );
    assert_eq!(
        sorted_ids(client.get_cards_of_a_year(&1999, &1)),
        std::vec![b, c]
    );

    // The moved card (c) can itself be removed cleanly.
    client.remove_card(&owner, &c);
    client.set_cards_per_round(&owner, &1);
    assert_eq!(genre_ids(&client, &owner, Genre::Pop), std::vec![b]);
    assert_eq!(
        sorted_ids(client.get_cards_of_a_year(&1999, &1)),
        std::vec![b]
    );

    client.remove_card(&owner, &b);
    assert_eq!(client.get_cards_count(), 0);
    assert_eq!(client.get_genre_card_count(&Genre::Pop), 0);
    assert_eq!(
        client.try_get_cards_of_artist(&artist_a, &1),
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
    assert_eq!(client.get_cards_of_artist(&artist0, &1).len(), 7);
    client.set_cards_per_round(&owner, &4);
    assert_eq!(client.get_cards_of_a_year(&1990, &1).len(), 4);
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

#[test]
fn join_round_rejects_when_full() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
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

/// Chosen behaviour: answers after the card window are accepted but scored
/// as wrong, so the player still completes the card.
#[test]
fn answer_after_card_window_is_scored_as_wrong() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 1);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(10);
    let card = client.next_card(&round_id);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    client.start_round(&owner, &round_id);
    let card = client.next_card(&round_id);
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

#[test]
fn owner_can_still_set_roles_after_revoking_own_admin() {
    let (env, client, owner) = setup();
    let other = Address::generate(&env);

    client.set_role(&owner, &owner, &Role::Admin, &false);
    assert!(!client.is_admin(&Role::Admin, &owner));

    client.set_role(&owner, &other, &Role::Admin, &true);
    client.set_role(&owner, &owner, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &other));
    assert!(client.is_admin(&Role::Admin, &owner));
}

#[test]
fn set_role_emits_role_updated() {
    let (env, client, owner) = setup();
    let other = Address::generate(&env);
    client.set_role(&owner, &other, &Role::Admin, &true);
    let expected = RoleUpdated {
        account: other,
        role: Role::Admin,
        enabled: true,
    }
    .to_xdr(&env, &client.address);
    assert!(env
        .events()
        .all()
        .filter_by_contract(&client.address)
        .events()
        .contains(&expected));
}

#[test]
fn ownership_transfer_end_to_end() {
    let (env, client, owner) = setup();
    let new_owner = Address::generate(&env);
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_transfer_ownership(&stranger, &new_owner),
        Err(Ok(Error::NotAuthorized.into()))
    );
    client.transfer_ownership(&owner, &new_owner);
    assert_eq!(client.pending_owner(), Some(new_owner.clone()));
    assert_eq!(
        client.try_accept_ownership(&stranger),
        Err(Ok(Error::NotPendingOwner.into()))
    );

    client.accept_ownership(&new_owner);
    assert_eq!(client.owner(), new_owner);
    assert_eq!(client.pending_owner(), None);
    assert!(client.is_admin(&Role::Admin, &new_owner));
    assert_eq!(
        client.try_set_role(&owner, &stranger, &Role::Admin, &true),
        Err(Ok(Error::NotAuthorized.into()))
    );
    client.set_role(&new_owner, &stranger, &Role::Admin, &true);
}

#[test]
fn upgrade_keeps_state_and_changes_version() {
    let (env, client, owner) = setup();
    let other = Address::generate(&env);
    client.set_role(&owner, &other, &Role::Admin, &true);
    assert_eq!(client.version(), 1);

    let hash = env
        .deployer()
        .upload_contract_wasm(include_bytes!("../../../fixtures/upgrade_v2.wasm").as_slice());
    assert_eq!(
        client.try_upgrade(&other, &hash),
        Err(Ok(Error::NotAuthorized.into()))
    );
    client.upgrade(&owner, &hash);

    assert_eq!(client.version(), 2);
    env.as_contract(&client.address, || {
        let stored: Address = env
            .storage()
            .instance()
            .get(&crate::DataKey::Owner)
            .unwrap();
        assert_eq!(stored, owner);
        assert!(env
            .storage()
            .instance()
            .get::<_, bool>(&crate::DataKey::Admin(other.clone()))
            .unwrap());
    });
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64);
    client.start_round(&owner, &round_id);
    let card = client.next_card(&round_id);
    assert_emitted(
        &env,
        &client.address,
        CardDrawn {
            round_id,
            index: 0,
            card_id: card.card_id,
        },
    );

    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(correct);
    assert_emitted(
        &env,
        &client.address,
        AnswerSubmitted {
            round_id,
            player: owner.clone(),
            correct: true,
            points: 100,
        },
    );
}

#[test]
fn faster_correct_answers_earn_more_points_and_wrong_answers_earn_zero() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &5u64);
    let fast = Address::generate(&env);
    let slow = Address::generate(&env);
    let wrong = Address::generate(&env);
    client.join_round(&fast, &round_id);
    client.join_round(&slow, &round_id);
    client.join_round(&wrong, &round_id);
    for player in [&owner, &fast, &slow, &wrong] {
        client.start_round(player, &round_id);
    }

    let drawn_at = NOW + 10;
    env.ledger().set_timestamp(drawn_at);
    let card = client.next_card(&round_id);

    env.ledger().set_timestamp(drawn_at + 2);
    assert!(client.submit_answer(&fast, &round_id, &Answer::Title(card.title.clone())));
    assert_emitted(
        &env,
        &client.address,
        AnswerSubmitted {
            round_id,
            player: fast.clone(),
            correct: true,
            points: 90,
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
    assert_eq!(fast_points, 90);
    assert_eq!(slow_points, 25);
    assert!(fast_points > slow_points);
    assert_eq!(scores.get(wrong.clone()).unwrap(), 0);
    assert_eq!(scores.get(owner.clone()).unwrap(), 0);
}

// ---------------------------------------------------------------------------
// LF-004 — Players cannot answer the same card more than once (#421)
// ---------------------------------------------------------------------------

/// A second submit_answer for the same card by the same player must fail
/// with Error::AlreadyAnswered.
#[test]
fn lf004_second_answer_for_same_card_fails_with_already_answered() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &55u64);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&round_id);

    // First answer is accepted.
    env.ledger().set_timestamp(NOW + 8);
    let first = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(first);

    // Second answer for the same card must be rejected with AlreadyAnswered.
    env.ledger().set_timestamp(NOW + 10);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, crate::Error::AlreadyAnswered);
}

/// Repeated wrong-then-correct guessing is blocked: each successive call
/// returns AlreadyAnswered after the first submission.
#[test]
fn lf004_cannot_guess_until_correct_by_resubmitting() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &66u64);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&round_id);

    // Submit a wrong answer first.
    env.ledger().set_timestamp(NOW + 8);
    let wrong = client.submit_answer(
        &owner,
        &round_id,
        &Answer::Title(String::from_str(&env, "definitely-wrong")),
    );
    assert!(!wrong, "wrong answer must return false");

    // Attempting to submit a second answer (even a correct one) must fail.
    env.ledger().set_timestamp(NOW + 9);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(
        err,
        crate::Error::AlreadyAnswered,
        "second answer attempt must be rejected even if the first was wrong"
    );
}

/// Streaks cannot grow by more than 1 per card: a player who has answered
/// N cards correctly has a streak of exactly N (not N*2 from double-answers).
#[test]
fn lf004_streak_cannot_grow_more_than_one_per_card() {
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &7u64);
    client.start_round(&owner, &round_id);

    // Draw the only card in the round.
    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&round_id);

    // Submitting an answer for the last (and only) card must not panic.
    env.ledger().set_timestamp(NOW + 10);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(correct, "answer to the only card in a 1-card round must be accepted");

    // Round is not yet completed — only finalize_round sets is_completed.
    let round = client.get_round(&round_id);
    assert!(!round.is_completed, "round must not be completed until finalize_round is called");

    // Finalize succeeds because the one card has been answered.
    client.finalize_round(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert!(round.is_completed, "round must be completed after finalize_round");
    assert!(round.end_time > 0, "end_time must be set when the round completes");
}

/// cards_per_round = 3: answer to the 3rd card is accepted; round is marked
/// completed only after finalize_round, not after drawing the last card.
#[test]
fn lf003_three_card_round_last_card_is_answerable() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 6);
    client.set_cards_per_round(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &77u64);
    client.start_round(&owner, &round_id);

    for i in 0..3u64 {
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &13u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    // Draw and answer cards 1 and 2.
    for i in 0..2u64 {
        env.ledger().set_timestamp(NOW + 5 + i * 30);
        let card = client.next_card(&round_id);
        env.ledger().set_timestamp(NOW + 8 + i * 30);
        client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));

        // Attempt a second answer; it must fail, not add to the streak.
        env.ledger().set_timestamp(NOW + 10 + i * 30);
        let _ = client.try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    }

    let stats = client.get_player_stat(&owner);
    // Answered 3 cards correctly, 1 answer per card → streak must be exactly 3.
    assert_eq!(
        stats.current_streak, 3,
        "streak must equal the number of cards answered, not double from re-submissions"
    );
    assert_eq!(stats.max_streak, 3);
}

/// Other players can still answer the same card — AlreadyAnswered is
/// per-player, not per-card.
#[test]
fn lf004_other_players_can_still_answer_same_card() {
        client.submit_answer(&player2, &round_id, &Answer::Title(card.title.clone()));
    }

    // Draw card 3 (the last one).
    env.ledger().set_timestamp(NOW + 65);
    let last_card = client.next_card(&round_id);

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
    let p2_correct =
        client.submit_answer(&player2, &round_id, &Answer::Title(last_card.title.clone()));
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &88u64);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&round_id);

    // Owner answers first.
    env.ledger().set_timestamp(NOW + 8);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // player2 can still answer the same card — AlreadyAnswered is per-player.
    env.ledger().set_timestamp(NOW + 10);
    assert!(
        client.submit_answer(&player2, &round_id, &Answer::Title(card.title.clone())),
        "player2 must be allowed to answer a card that owner has already answered"
    );

    // But owner cannot answer again.
    env.ledger().set_timestamp(NOW + 11);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, crate::Error::AlreadyAnswered);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &21u64);
    client.start_round(&owner, &round_id);

    // Draw both cards.
    env.ledger().set_timestamp(NOW + 5);
    client.next_card(&round_id);
    env.ledger().set_timestamp(NOW + 35);
    client.next_card(&round_id);

    // A third call must fail with NoMoreCards, not RoundCompleted.
    env.ledger().set_timestamp(NOW + 65);
    let err = client.try_next_card(&round_id).unwrap_err().unwrap();
    assert_eq!(
        err,
        crate::Error::NoMoreCards,
        "exhausted deck must return NoMoreCards, not RoundCompleted"
    );
}
