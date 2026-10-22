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
extern crate upgrade_fixture;

use crate::{
    Answer, AnswerSubmitted, AnswerWindowUpdated, Card, CardAdded, CardDrawn,
    CardRemoved, CardUpdated, CardsPerRoundUpdated, ContractUpgraded, Error, Genre, LegacyRound,
    LobbyTimeoutUpdated, LyricsFlip, LyricsFlipClient, Milestone, QuestionKind, Role,
    RoleUpdated, RoundBufferUpdated, RoundCancelled, RoundCompleted, RoundDurationUpdated,
    RoundLeft, SchemaMigrated, CARD_ANSWER_WINDOW_SECONDS, DEFAULT_MAX_PLAYERS,
    DEFAULT_ROUND_BUFFER_SECONDS, LOBBY_TIMEOUT_SECONDS, MAX_ANSWER_WINDOW_SECONDS,
    MAX_CARDS_PER_BATCH, MAX_LOBBY_TIMEOUT_SECONDS, MAX_LYRICS_LEN, MAX_PAGE_LIMIT,
    MAX_CARDS_PER_ROUND, MAX_ROUND_BUFFER_SECONDS, MAX_ROUND_DURATION_SECONDS, MAX_ROUND_PLAYERS,
    MIN_ANSWER_WINDOW_SECONDS, MIN_LOBBY_TIMEOUT_SECONDS, MIN_ROUND_BUFFER_SECONDS,
    MIN_ROUND_DURATION_SECONDS,
};
use soroban_sdk::{
    testutils::{Address as _, ContractEvents, Events, Ledger},
    xdr, Address, BytesN, Env, Event, Map, String, Vec,
};

/// 2026-05-28, so cards up to year 2026 pass validation.
const NOW: u64 = 1_780_000_000;

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
        difficulty: 2,
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
            difficulty: 2,
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

#[test]
fn set_cards_per_round_rejects_above_cap() {
    let (_env, client, owner) = setup();
    client.set_cards_per_round(&owner, &MAX_CARDS_PER_ROUND);
    assert_eq!(
        client.try_set_cards_per_round(&owner, &(MAX_CARDS_PER_ROUND + 1)),
        Err(Ok(Error::InvalidCardsPerRound.into()))
    );
}

#[test]
fn set_max_players_rejects_above_cap() {
    let (_env, client, owner) = setup();
    client.set_max_players(&owner, &MAX_ROUND_PLAYERS);
    assert_eq!(
        client.try_set_max_players(&owner, &(MAX_ROUND_PLAYERS + 1)),
        Err(Ok(Error::MaxPlayersTooHigh.into()))
    );
}

// ---------------------------------------------------------------------------
// create_round
// ---------------------------------------------------------------------------

#[test]
fn create_round_requires_a_genre() {
    let (env, client, owner) = setup();
    let _ = env;
    let result = client.try_create_round(&owner, &None, &1u64, &None);
    assert!(result.is_err());
}

#[test]
fn round_count_tracks_creates() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    assert_eq!(client.get_round_count(), 0);

    for seed in 0..3u64 {
        client.create_round(&owner, &Some(Genre::Pop), &seed, &None);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);

    let result = client.try_join_round(&owner, &round_id, &None);
    assert!(result.is_err(), "the round creator is already a player");
}

#[test]
fn join_round_rejects_after_start() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &3);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);

    let late_player = Address::generate(&env);
    let result = client.try_join_round(&late_player, &round_id, &None);
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    client.join_round(&player2, &round_id, &None);
    client.join_round(&player3, &round_id, &None);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    client.join_round(&player2, &round_id, &None);
    client.join_round(&player3, &round_id, &None);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);

    let _c1 = client.next_card(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 1);
    assert!(!round.is_completed);

    let _c2 = client.next_card(&owner, &round_id);
    let round = client.get_round(&round_id);
    assert_eq!(round.next_card_index, 2);
    // `finalize_round` completes the round, so the last card can still be answered.
    assert!(!round.is_completed);
    assert_eq!(
        client.try_next_card(&owner, &round_id),
        Err(Ok(Error::NoMoreCards.into()))
    );
}

#[test]
fn next_card_errors_when_round_not_started() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 2);
    client.set_cards_per_round(&owner, &2);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);

    let result = client.try_next_card(&owner, &round_id);
    assert!(result.is_err());
}

#[test]
fn next_card_errors_when_round_completed() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 1);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);
    client.next_card(&owner, &round_id);

    let result = client.try_next_card(&owner, &round_id);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// build_question_card Ã¢Â€Â” LF-029
// ---------------------------------------------------------------------------

/// Seed cards with enough variety that all three question kinds can find
/// 3 unique distractors. We need Ã¢Â‰Â¥4 distinct titles, artists, and years.
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
                difficulty: 2,
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

    // All four options should be within Ã‚Â±5 years of the correct year.
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

/// Parse a decimal `soroban_sdk::String` into a `u64` without std.
fn parse_year_u64(s: &soroban_sdk::String) -> u64 {
    let mut n: u64 = 0;
    for byte in s.to_bytes().iter() {
        n = n.wrapping_mul(10).wrapping_add((byte - b'0') as u64);
    }
    n
}

// ---------------------------------------------------------------------------
// build_question_card Ã¢Â€Â” LF-010 small card sets
// ---------------------------------------------------------------------------

/// 4 distinct cards: a question card must still have 4 unique options Ã¢Â€Â”
/// including the correct one Ã¢Â€Â” without panicking with `AmountExceedsLimit`.
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &7u64, &None);
    client.start_round(&owner, &round_id);

    let round = client.get_round(&round_id);
    assert!(round.is_started);

    let card = client.next_card(&owner, &round_id);

    let correct = client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    assert!(correct);

    let stats = client.get_player_stat(&owner);
    assert_eq!(stats.current_streak, 1);
    assert_eq!(stats.max_streak, 1);

    client.next_card(&owner, &round_id);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &5u64, &None);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&owner, &round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Artist(card.artist.clone()));
    assert!(correct);
}

#[test]
fn submit_answer_year_kind_accepted() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &6u64, &None);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&owner, &round_id);
    let correct = client.submit_answer(&owner, &round_id, &Answer::Year(card.year));
    assert!(correct);
}

#[test]
fn submit_answer_rejects_non_participant() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &8u64, &None);
    client.start_round(&owner, &round_id);
    client.next_card(&owner, &round_id);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &9u64, &None);

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
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let first_card = client.next_card(&owner, &round_id);
    let _ = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(106);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(first_card.title.clone())));
    env.ledger().set_timestamp(130);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-a"))
    ));

    env.ledger().set_timestamp(195);
    let second_card = client.next_card(&owner, &round_id);
    let _ = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(206);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(second_card.title.clone())));
    env.ledger().set_timestamp(240);
    assert!(!client.submit_answer(
        &player2,
        &round_id,
        &Answer::Title(String::from_str(&env, "wrong-b"))
    ));

    let scores = client.get_round_scores(&round_id);
    // Two correct answers, 5s after grace: 2 * (100 - 5 * 5).
    assert_eq!(scores.get(owner.clone()).unwrap(), 150u64);
    assert_eq!(scores.get(player2.clone()).unwrap(), 0u64);

    client.finalize_round(&owner, &round_id);
    let events = env.events().all();

    let owner_stats = client.get_player_stat(&owner);
    assert_eq!(owner_stats.rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);

    let winners = soroban_sdk::vec![&env, owner.clone()];
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);

    let _event_count_before_second_finalize = env
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &99u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(45);
    let card = client.next_card(&owner, &round_id);
    let _ = client.next_card(&player2, &round_id);
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &3u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&owner, &round_id);
    let p2_card = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    env.ledger().set_timestamp(101);
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone())));

    client.finalize_round(&owner, &round_id);

    assert_eq!(client.get_player_stat(&owner).rounds_won, 1);
    assert_eq!(client.get_player_stat(&player2).rounds_won, 0);
}

#[test]
fn finalize_round_e2e_exact_score_and_time_tie_produces_co_winners() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &1);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &11u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&owner, &round_id);
    let p2_card = client.next_card(&player2, &round_id);
    env.ledger().set_timestamp(100);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
    assert!(client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone())));

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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &17u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    let card = client.next_card(&owner, &round_id);
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &17u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(95);
    client.next_card(&owner, &round_id);
    client.next_card(&player2, &round_id);
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
        client.create_round(&owner, &Some(Genre::Pop), &seed, &None);
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
        client.create_round(&owner, &Some(Genre::Pop), &seed, &None);
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
    let r1 = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let r2 = client.create_round(&owner, &Some(Genre::Pop), &2u64, &None);
    let r3 = client.create_round(&owner, &Some(Genre::Pop), &3u64, &None);

    let open = client.get_open_rounds(&0, &10);
    assert_eq!(open.len(), 3);
    assert_eq!(open.get(0).unwrap(), r1);

    // A round with a second player stays open until everyone is ready.
    let player = Address::generate(&env);
    client.join_round(&player, &r2, &None);
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
        (Error::NoMoreCards, 34),
        (Error::RoundCancelled, 35),
        (Error::InvalidCardDifficulty, 36),
        (Error::InvalidDecade, 37),
        (Error::NoActiveCard, 38),
        (Error::AlreadyAnswered, 39),
        (Error::Paused, 40),
        (Error::InvalidAnswerWindow, 41),
        (Error::InvalidLobbyTimeout, 42),
        (Error::InvalidRoundDuration, 43),
        (Error::MaxPlayersTooHigh, 45),
    ];
    for (variant, code) in expected {
        assert_eq!(variant as u32, code, "{:?} was renumbered", variant);
    }
}

// ---------------------------------------------------------------------------
// LF-011 Ã¢Â€Â“ partial Fisher-Yates is O(limit), not O(coupon-collector)
// ---------------------------------------------------------------------------

/// Confirms that `get_random_numbers(amount=50, limit=50)` Ã¢Â€Â” the worst-case
/// scenario that caused the coupon-collector blowup Ã¢Â€Â” now runs in a fixed
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
    let cards = client.get_cards_of_genre(&Genre::Pop, &12345u64);
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
// LF-012 Ã¢Â€Â“ persistent storage survives a ledger advance past default TTL
// ---------------------------------------------------------------------------

/// After gameplay entries (cards, round, player stats) are written and the
/// ledger sequence advances well past Soroban's default minimum TTL, the
/// entries are still readable because `extend_ttl` was called on write.
#[test]
fn ttl_survival_game_entries_survive_ledger_advance() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &77u64, &None);
    client.start_round(&owner, &round_id);

    let card = client.next_card(&owner, &round_id);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);

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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);

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
        client.try_join_round(&late, &round_id, &None),
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.join_round(&Address::generate(&env), &round_id, &None);
    client.join_round(&Address::generate(&env), &round_id, &None);
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id, &None),
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    for _ in 1..MAX_ROUND_PLAYERS {
        client.join_round(&Address::generate(&env), &round_id, &None);
    }
    assert_eq!(client.get_players_round_count(&round_id), MAX_ROUND_PLAYERS);
    assert_eq!(
        client.try_join_round(&Address::generate(&env), &round_id, &None),
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
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(10);
    let card = client.next_card(&owner, &round_id);
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

// ---------------------------------------------------------------------------
// LF-174 Ã¢Â€Â” Emergency pause
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
        env.storage().instance().remove(&crate::DataKey::SchemaVersion);
    });

    // Initial code version and schema version must be 1
    assert_eq!(client.version(), 1);
    assert_eq!(client.schema_version(), 1);

    // 2. Upload the v2 fixture WASM
    let hash = env
        .deployer()
        .upload_contract_wasm(include_bytes!("../../../fixtures/upgrade_v2.wasm").as_slice());

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

// ---------------------------------------------------------------------------
// LF-004 Ã¢Â€Â” Players cannot answer the same card more than once (#421)
// ---------------------------------------------------------------------------

/// A second submit_answer for the same card by the same player must fail
/// with Error::AlreadyAnswered.
#[test]
fn lf004_second_answer_for_same_card_fails_with_already_answered() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &55u64, &None);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

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
    assert_eq!(err, crate::Error::AlreadyAnswered.into());
}

/// Repeated wrong-then-correct guessing is blocked: each successive call
/// returns AlreadyAnswered after the first submission.
#[test]
fn lf004_cannot_guess_until_correct_by_resubmitting() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &66u64, &None);
    client.start_round(&owner, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

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
        crate::Error::AlreadyAnswered.into(),
        "second answer attempt must be rejected even if the first was wrong"
    );
}

/// Streaks cannot grow by more than 1 per card: a player who has answered
/// N cards correctly has a streak of exactly N (not N*2 from double-answers).
#[test]
fn lf004_streak_cannot_grow_more_than_one_per_card() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &3);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &13u64, &None);
    client.start_round(&owner, &round_id);

    // Draw and answer cards 1, 2, and 3 Ã¢Â€Â” one answer per card.
    for i in 0..3u64 {
        env.ledger().set_timestamp(NOW + 5 + i * 30);
        let card = client.next_card(&owner, &round_id);
        env.ledger().set_timestamp(NOW + 8 + i * 30);
        client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));

        // Attempt a second answer; it must fail, not add to the streak.
        env.ledger().set_timestamp(NOW + 10 + i * 30);
        let _ = client.try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    }

    let stats = client.get_player_stat(&owner);
    // Answered 3 cards correctly, 1 answer per card Ã¢Â†Â’ streak must be exactly 3.
    assert_eq!(
        stats.current_streak, 3,
        "streak must equal the number of cards answered, not double from re-submissions"
    );
    assert_eq!(stats.max_streak, 3);
}

/// Other players can still answer the same card Ã¢Â€Â” AlreadyAnswered is
/// per-player, not per-card.
#[test]
fn lf004_other_players_can_still_answer_same_card() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 4);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &99u64, &None);
    let player2 = Address::generate(&env);
    client.join_round(&player2, &round_id, &None);
    client.start_round(&owner, &round_id);
    client.start_round(&player2, &round_id);

    env.ledger().set_timestamp(NOW + 5);
    let card = client.next_card(&owner, &round_id);

    // Owner answers first.
    env.ledger().set_timestamp(NOW + 8);
    assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));

    // player2 can still answer the same card â AlreadyAnswered is per-player.
    let p2_card = client.next_card(&player2, &round_id);
    // player2 can still answer the same card Ã¢Â€Â” AlreadyAnswered is per-player.
    env.ledger().set_timestamp(NOW + 10);
    assert!(
        client.submit_answer(&player2, &round_id, &Answer::Title(p2_card.title.clone())),
        "player2 must be allowed to answer a card that owner has already answered"
    );

    // But owner cannot answer again.
    env.ledger().set_timestamp(NOW + 11);
    let err = client
        .try_submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, crate::Error::AlreadyAnswered.into());
}

// ---------------------------------------------------------------------------
// LF-003 Ã¢Â€Â” Last card of a round can be answered (#420)
// ---------------------------------------------------------------------------

/// cards_per_round = 1: draw the only card then submit an answer Ã¢Â€Â” must succeed.
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

    // Round is not yet completed Ã¢Â€Â” only finalize_round sets is_completed.
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

    // Round must NOT be completed yet Ã¢Â€Â” players must still be able to answer.
    let round = client.get_round(&round_id);
    assert!(
        !round.is_completed,
        "round must not be completed after drawing the last card Ã¢Â€Â” answer window is still open"
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
    let err = client.try_next_card(&owner, &round_id).unwrap_err().unwrap();
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

#[derive(Clone, Copy)]
enum Simulation {
    AllCorrect,
    ExactTie,
    AllWrong,
    Abandoned,
}

fn simulate_eight_player_round(scenario: Simulation) {
    let (env, client, owner) = setup();
    if matches!(scenario, Simulation::AllCorrect) {
        client.add_card(
            &owner,
            &Card {
                difficulty: 3,
                ..sample_card(&env, Genre::Pop, "Hard Artist", "Hard Song", 1994)
            },
        );
        client.add_card(
            &owner,
            &Card {
                difficulty: 1,
                ..sample_card(&env, Genre::Pop, "Easy Artist", "Easy Song", 1996)
            },
        );
        client.set_cards_per_round(&owner, &2);
    } else {
        seed_cards(&env, &client, &owner, 8);
        client.set_cards_per_round(&owner, &1);
    }

    let mut players = std::vec![owner.clone()];
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &123u64, &None);
    for _ in 1..MAX_ROUND_PLAYERS {
        let player = Address::generate(&env);
        client.join_round(&player, &round_id, &None);
        players.push(player);
    }
    for player in players.iter() {
        client.start_round(player, &round_id);
    }

    match scenario {
        Simulation::AllCorrect => {
            let answer_card = |start: u64| {
                for (i, player) in players.iter().enumerate() {
                    env.ledger().set_timestamp(start);
                    let card = client.next_card(player, &round_id);
                    let delay = match (card.difficulty, i) {
                        (3, 0) => 7,
                        (3, 1) => 8,
                        (1, 0) => 9,
                        (1, 1) => 6,
                        _ => 9,
                    };
                    env.ledger().set_timestamp(start + delay);
                    assert!(client.submit_answer(
                        player,
                        &round_id,
                        &Answer::Title(card.title.clone())
                    ));
                }
            };
            answer_card(NOW + 10);
            let second_start = env.ledger().timestamp();
            answer_card(second_start);
            let score_tie = client.get_round_scores(&round_id);
            assert_eq!(score_tie.get(owner.clone()).unwrap(), 370);
            assert_eq!(score_tie.get(players[1].clone()).unwrap(), 370);
            assert!(score_tie.get(players[2].clone()).unwrap() < 370);
            let times = env.as_contract(&client.address, || {
                env.storage()
                    .persistent()
                    .get::<_, Map<Address, u64>>(&crate::DataKey::RoundAnswerTimes(round_id))
                    .unwrap()
            });
            assert_eq!(times.get(owner.clone()).unwrap(), 16);
            assert_eq!(times.get(players[1].clone()).unwrap(), 14);
        }
        Simulation::ExactTie => {
            for player in players.iter() {
                env.ledger().set_timestamp(NOW + 10);
                let card = client.next_card(player, &round_id);
                env.ledger().set_timestamp(NOW + 12);
                assert!(client.submit_answer(
                    player,
                    &round_id,
                    &Answer::Title(card.title.clone())
                ));
            }
        }
        Simulation::AllWrong => {
            for player in players.iter() {
                env.ledger().set_timestamp(NOW + 10);
                let _ = client.next_card(player, &round_id);
                env.ledger().set_timestamp(NOW + 12);
                assert!(!client.submit_answer(
                    player,
                    &round_id,
                    &Answer::Title(String::from_str(&env, "wrong"))
                ));
            }
        }
        Simulation::Abandoned => {
            env.ledger().set_timestamp(NOW + 10);
            let card = client.next_card(&owner, &round_id);
            env.ledger().set_timestamp(NOW + 11);
            assert!(client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone())));
            env.ledger()
                .set_timestamp(client.get_round(&round_id).end_time + 1);
            client.finalize_round(&players[1], &round_id);
        }
    }

    let events = if matches!(scenario, Simulation::Abandoned) {
        env.events().all()
    } else {
        client.finalize_round(&owner, &round_id);
        env.events().all()
    };
    let scores = client.get_round_scores(&round_id);
    let mut winners = soroban_sdk::Vec::new(&env);
    match scenario {
        Simulation::AllCorrect => winners.push_back(players[1].clone()),
        Simulation::Abandoned => winners.push_back(owner.clone()),
        Simulation::ExactTie => {
            for player in players.iter() {
                winners.push_back(player.clone());
            }
        }
        Simulation::AllWrong => {}
    }
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);
    assert_round_completed_event(
        &env,
        &events,
        &client.address,
        round_id,
        &winners,
        &scores,
    );

    for player in players.iter() {
        let stats = client.get_player_stat(player);
        assert_eq!(stats.total_rounds, 1);
        assert_eq!(
            stats.rounds_won,
            if winners.first_index_of(player).is_some() {
                1
            } else {
                0
            }
        );
    }
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
    assert_eq!(client.get_round_scores(&round_id).get(owner.clone()), Some(200));
}

// ---------------------------------------------------------------------------
// LF-161 Â– normalize title/artist before duplicate checks
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
// ---------------------------------------------------------------------------
// LF-160 Â– year distractors stay within [MIN_CARD_YEAR, current_year]
// ---------------------------------------------------------------------------

fn parse_all_year_options(q: &crate::QuestionCard) -> std::vec::Vec<u64> {
    let opts = [
        q.option_one.clone(),
        q.option_two.clone(),
        q.option_three.clone(),
        q.option_four.clone(),
    ];
    opts.iter().map(|o| parse_year_u64(o)).collect()
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

// ---------------------------------------------------------------------------
// LF-158 – Make round duration and answer window configurable (#644)
// ---------------------------------------------------------------------------

// LF-162: private round requires the invite preimage; absent from the lobby.
#[test]
fn lf162_private_round_requires_invite_code() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &2);

    // Compute sha256("magic-code") on-chain style.
    let code = String::from_str(&env, "magic-code");
    let bytes = code.to_bytes();
    let hash: BytesN<32> = env.crypto().sha256(&bytes).into();

    let round_id = client.create_round(
        &owner,
        &Some(Genre::Pop),
        &162u64,
        &Some(hash.clone()),
    );

    // Not in lobby.
    let open = client.get_open_rounds(&0u32, &10u32);
    assert_eq!(open.len(), 0, "private round must not appear in get_open_rounds");

    // Joining without the code is rejected.
    let stranger = Address::generate(&env);
    let err = client
        .try_join_round(&stranger, &round_id, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::NotAuthorized.into());

    // Joining with the wrong code is rejected.
    let wrong = String::from_str(&env, "wrong-code");
    let err = client
        .try_join_round(&stranger, &round_id, &Some(wrong))
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::NotAuthorized.into());

    // Joining with the right code succeeds.
    client.join_round(&stranger, &round_id, &Some(code.clone()));

    // Player count went from 1 (owner) to 2.
    let players = client.get_round_players(&round_id);
    assert_eq!(players.len(), 2);
    assert_eq!(
        client.get_round_players(&round_id).first_index_of(&stranger),
        Some(1)
    );
}

// LF-162: public rounds are unaffected.
#[test]
fn lf162_public_round_still_joinable_without_code() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 3);
    client.set_cards_per_round(&owner, &2);

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &162u64, &None);
    assert_eq!(client.get_open_rounds(&0u32, &10u32).len(), 1);

    let stranger = Address::generate(&env);
    client.join_round(&stranger, &round_id, &None);
    assert_eq!(client.get_round_players(&round_id).len(), 2);
}

// LF-163: a solo round starts in one call with exactly one signature.
#[test]
fn lf163_solo_round_starts_in_one_call() {
    let (env, client, owner) = setup();
    seed_cards(&env, &client, &owner, 5);
    client.set_cards_per_round(&owner, &2);
    env.ledger().set_timestamp(NOW + 5);

    let qc = client.create_solo_round(&owner, &Some(Genre::Pop), &163u64);

    // Round exists, started, flagged solo, not in OpenRounds.
    assert_eq!(client.get_round_count(), 1);
    let round = client.get_round(&1u64);
    assert!(round.is_started, "solo round must be started");
    assert!(round.solo, "round.solo must be true");
    assert_eq!(round.start_time, NOW + 5);
    assert!(round.end_time > round.start_time);
    assert_eq!(client.get_open_rounds(&0u32, &10u32).len(), 0,
               "solo round must not appear in OpenRounds");

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

    let round_id = client.create_round(&owner, &Some(Genre::Pop), &12345u64, &None);
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
        let card = client.next_card(&owner, &round_id);

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
    let r1 = client.create_round(&owner, &Some(Genre::Pop), &1u64, &None);
    let round_1 = client.get_round(&r1);
    assert_eq!(round_1.answer_window, 15);
    assert_eq!(round_1.lobby_timeout, 600);
    assert_eq!(round_1.round_duration, 2 * (15 + 15)); // 60s

    // Modify global configuration
    client.set_answer_window(&owner, &30);
    client.set_lobby_timeout(&owner, &120);
    client.set_round_buffer(&owner, &25);

    // Create Round 2 under the updated configuration
    let r2 = client.create_round(&owner, &Some(Genre::Pop), &2u64, &None);
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
    let card1 = client.next_card(&owner, &r1);

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
    let card2 = client.next_card(&owner, &r2);

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
    assert_eq!(client.schema_version(), 4);

    // Calling migrate is a clean, idempotent no-op
    client.migrate(&owner);
    assert_eq!(client.schema_version(), 4);
}

// ----------------------------------------------------------------------------
// LF-156: Move admin flags out of instance storage, and make admins enumerable
// ----------------------------------------------------------------------------

#[test]
fn test_lf156_admin_flags_in_persistent_storage_not_instance() {
    let (env, client, owner) = setup();

    // Owner is admin
    assert!(client.is_admin(&Role::Admin, &owner));

    // get_admins returns current set containing owner
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);

    // Instance storage holds only global configuration - ZERO Admin keys in instance!
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(owner.clone())),
            "Instance storage must not contain DataKey::Admin"
        );
        assert_eq!(
            env.storage()
                .persistent()
                .get::<_, bool>(&crate::DataKey::Admin(owner.clone())),
            Some(true),
            "Persistent storage must hold DataKey::Admin"
        );
    });
}

#[test]
fn test_lf156_admin_addition_and_enumeration() {
    let (env, client, owner) = setup();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    assert!(!client.is_admin(&Role::Admin, &admin1));
    assert!(!client.is_admin(&Role::Admin, &admin2));

    // Add admin1 and admin2
    client.set_role(&owner, &admin1, &Role::Admin, &true);
    client.set_role(&owner, &admin2, &Role::Admin, &true);

    assert!(client.is_admin(&Role::Admin, &admin1));
    assert!(client.is_admin(&Role::Admin, &admin2));

    // get_admins returns all 3 current admins
    let admins = client.get_admins();
    assert_eq!(admins.len(), 3);
    assert_eq!(admins.get(0).unwrap(), owner);
    assert_eq!(admins.get(1).unwrap(), admin1);
    assert_eq!(admins.get(2).unwrap(), admin2);

    // Adding duplicate does not duplicate entry in get_admins
    client.set_role(&owner, &admin1, &Role::Admin, &true);
    assert_eq!(client.get_admins().len(), 3);

    // Verify instance storage remains pure
    env.as_contract(&client.address, || {
        assert!(!env.storage().instance().has(&crate::DataKey::Admin(admin1.clone())));
        assert!(!env.storage().instance().has(&crate::DataKey::Admin(admin2.clone())));
        assert!(env.storage().persistent().has(&crate::DataKey::Admin(admin1.clone())));
        assert!(env.storage().persistent().has(&crate::DataKey::Admin(admin2.clone())));
    });
}

#[test]
fn test_lf156_admin_revocation_removes_key_without_tombstone() {
    let (env, client, owner) = setup();

    let admin1 = Address::generate(&env);
    client.set_role(&owner, &admin1, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &admin1));
    assert_eq!(client.get_admins().len(), 2);

    // Revoke admin1
    client.set_role(&owner, &admin1, &Role::Admin, &false);
    assert!(!client.is_admin(&Role::Admin, &admin1));

    // get_admins excludes revoked admin
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);

    // On revoke, remove the entry instead of writing false (no tombstone!)
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .persistent()
                .has(&crate::DataKey::Admin(admin1.clone())),
            "Revocation must remove key from persistent storage (no false tombstone)"
        );
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(admin1.clone())),
            "Instance storage must not contain revoked admin key"
        );
    });
}

#[test]
fn test_lf156_owner_revoking_admin_maintains_owner_rights() {
    let (_env, client, owner) = setup();

    // Owner revokes own admin flag
    client.set_role(&owner, &owner, &Role::Admin, &false);
    assert!(!client.is_admin(&Role::Admin, &owner));
    assert_eq!(client.get_admins().len(), 0);

    // Owner can still manage roles and reinstate admin role
    client.set_role(&owner, &owner, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &owner));
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);
}

#[test]
fn test_lf156_accept_ownership_updates_persistent_admins() {
    let (env, client, owner) = setup();

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);
    client.accept_ownership(&new_owner);

    assert_eq!(client.owner(), new_owner);
    assert!(client.is_admin(&Role::Admin, &new_owner));

    let admins = client.get_admins();
    // Old owner and new owner are both admins
    assert_eq!(admins.len(), 2);
    assert_eq!(admins.get(0).unwrap(), owner);
    assert_eq!(admins.get(1).unwrap(), new_owner);

    env.as_contract(&client.address, || {
        assert!(!env.storage().instance().has(&crate::DataKey::Admin(new_owner.clone())));
        assert!(env.storage().persistent().has(&crate::DataKey::Admin(new_owner.clone())));
    });
}

#[test]
fn test_lf156_upgrade_migration_v3_to_v4() {
    let (env, client, owner) = setup();

    // Model a v3 deployment with owner admin flag stored in instance storage
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&crate::DataKey::SchemaVersion, &3u32);
        env.storage()
            .instance()
            .set(&crate::DataKey::Admin(owner.clone()), &true);
        env.storage()
            .persistent()
            .remove(&crate::DataKey::Admin(owner.clone()));
        env.storage().persistent().remove(&crate::DataKey::Admins);
    });

    assert_eq!(client.schema_version(), 3);

    // Migrate from v3 to v4
    client.migrate(&owner);

    // Schema version bumped to 4
    assert_eq!(client.schema_version(), 4);

    // Admin moved to persistent storage and out of instance storage
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(owner.clone())),
            "Migration must remove DataKey::Admin from instance storage"
        );
        assert_eq!(
            env.storage()
                .persistent()
                .get::<_, bool>(&crate::DataKey::Admin(owner.clone())),
            Some(true),
            "Migration must set DataKey::Admin in persistent storage"
        );
    });

    // get_admins now returns owner
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);

    // Second call is an idempotent no-op
    client.migrate(&owner);
    assert_eq!(client.schema_version(), 4);
}

#[test]
fn test_lf156_lazy_migration_of_legacy_admins() {
    let (env, client, _owner) = setup();

    let legacy_admin = Address::generate(&env);
    let legacy_revoked = Address::generate(&env);

    // Directly seed legacy instance storage entries
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&crate::DataKey::Admin(legacy_admin.clone()), &true);
        env.storage()
            .instance()
            .set(&crate::DataKey::Admin(legacy_revoked.clone()), &false);
    });

    // Query active legacy admin
    assert!(client.is_admin(&Role::Admin, &legacy_admin));
    // Query revoked legacy admin
    assert!(!client.is_admin(&Role::Admin, &legacy_revoked));

    // Verify lazy migration cleaned up instance storage
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(legacy_admin.clone())),
            "Instance storage legacy active entry must be removed"
        );
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(legacy_revoked.clone())),
            "Instance storage legacy false entry must be removed"
        );
        assert!(
            env.storage()
                .persistent()
                .has(&crate::DataKey::Admin(legacy_admin.clone())),
            "Persistent storage must now hold active admin"
        );
        assert!(
            !env.storage()
                .persistent()
                .has(&crate::DataKey::Admin(legacy_revoked.clone())),
            "Revoked admin must not have persistent entry"
        );
    });

    // Enumerable index now includes lazily-migrated active admin
    let admins = client.get_admins();
    let mut found = false;
    for i in 0..admins.len() {
        if admins.get(i).unwrap() == legacy_admin {
            found = true;
            break;
        }
    }
    assert!(found, "get_admins must include lazily migrated admin");
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
    assert!(round.is_completed, "round must finalize after a card was removed");
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

