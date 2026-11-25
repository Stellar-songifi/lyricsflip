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
    Answer, AnswerSubmitted, AnswerWindowUpdated, Card, CardAdded, CardDrawn, CardRemoved,
    CardRevealed, CardUpdated, CardsPerRoundUpdated, ContractUpgraded, DataKey, Error, Genre,
    LegacyRound, LobbyTimeoutUpdated, LyricsFlip, LyricsFlipClient, Milestone, QuestionKind, Role,
    RoleUpdated, RoundBufferUpdated, RoundCancelled, RoundCompleted, RoundDurationUpdated,
    RoundLeft, SchemaMigrated, CARD_ANSWER_WINDOW_SECONDS, DEFAULT_MAX_PLAYERS,
    DEFAULT_ROUND_BUFFER_SECONDS, LOBBY_TIMEOUT_SECONDS, MAX_ANSWER_WINDOW_SECONDS,
    MAX_CARDS_PER_BATCH, MAX_CARDS_PER_ROUND, MAX_LOBBY_TIMEOUT_SECONDS, MAX_LYRICS_LEN,
    MAX_OPEN_ROUNDS_PER_ADDRESS, MAX_PAGE_LIMIT, MAX_ROUND_BUFFER_SECONDS,
    MAX_ROUND_DURATION_SECONDS, MAX_ROUND_PLAYERS, MIN_ANSWER_WINDOW_SECONDS,
    MIN_LOBBY_TIMEOUT_SECONDS, MIN_ROUND_BUFFER_SECONDS, MIN_ROUND_DURATION_SECONDS,
};
use soroban_sdk::{
    testutils::{Address as _, ContractEvents, Events, Ledger},
    xdr, Address, Env, Event, Map, String, Vec,
};

/// 2026-05-28, so cards up to year 2026 pass validation.
const NOW: u64 = 1_780_000_000;

mod admin;
mod cards;
mod cards_validation;
mod config;
mod finalize;
mod gameplay;
mod lifecycle;
mod lobbies;
mod pause;
mod privacy;
mod questions;
mod random;
mod rounds;
mod storage;

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

/// Parse a decimal `soroban_sdk::String` into a `u64` without std.
fn parse_year_u64(s: &soroban_sdk::String) -> u64 {
    let mut n: u64 = 0;
    for byte in s.to_bytes().iter() {
        n = n.wrapping_mul(10).wrapping_add((byte - b'0') as u64);
    }
    n
}

/// Draws the caller's next card and returns the full `Card` (answer
/// included) straight from contract storage. `next_card` itself only
/// returns the redacted `QuestionCard` (LF-142), but tests need the answer.
pub(crate) fn next_card_full(
    env: &Env,
    client: &LyricsFlipClient,
    player: &Address,
    round_id: u64,
) -> Card {
    client.next_card(player, &round_id);
    current_card_full(env, client, player, round_id)
}

/// The full `Card` the caller is currently answering in `round_id`.
pub(crate) fn current_card_full(
    env: &Env,
    client: &LyricsFlipClient,
    player: &Address,
    round_id: u64,
) -> Card {
    env.as_contract(&client.address, || {
        let idx: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlayerCardIndex((round_id, player.clone())))
            .unwrap();
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCards(round_id))
            .unwrap();
        env.storage()
            .persistent()
            .get(&DataKey::Card(ids.get(idx - 1).unwrap()))
            .unwrap()
    })
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

// ---------------------------------------------------------------------------
// LF-175 – cap open lobbies per address
// ---------------------------------------------------------------------------

/// Opens `MAX_OPEN_ROUNDS_PER_ADDRESS` public lobbies for `creator`.
fn fill_open_lobby_cap(
    client: &LyricsFlipClient,
    creator: &Address,
    _seed_base: u64,
) -> std::vec::Vec<u64> {
    (0..MAX_OPEN_ROUNDS_PER_ADDRESS)
        .map(|_| {
            client.create_round(
                creator,
                &Some(Genre::Pop),
                &Vec::new(creator.env()),
                &None,
                &0i128,
            )
        })
        .collect()
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
        .get_cards_of_genre(&genre)
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
        // Distractors for the question options; another genre, so the
        // round still draws the two Pop cards above.
        seed_cards_genre(&env, &client, &owner, 3, Genre::Rock);
        client.set_cards_per_round(&owner, &2);
    } else {
        seed_cards(&env, &client, &owner, 8);
        client.set_cards_per_round(&owner, &1);
    }

    let mut players = std::vec![owner.clone()];
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &Vec::new(&env), &None, &0i128);
    for _ in 1..MAX_ROUND_PLAYERS {
        let player = Address::generate(&env);
        client.join_round(&player, &round_id);
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
                    let card = next_card_full(&env, &client, player, round_id);
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
                let card = next_card_full(&env, &client, player, round_id);
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
                let _ = next_card_full(&env, &client, player, round_id);
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
            let card = next_card_full(&env, &client, &owner, round_id);
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
    assert_round_completed_event(&env, &events, &client.address, round_id, &winners, &scores);

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
// ---------------------------------------------------------------------------
// LF-160 – year distractors stay within [MIN_CARD_YEAR, current_year]
// ---------------------------------------------------------------------------

fn parse_all_year_options(q: &crate::QuestionCard) -> std::vec::Vec<u64> {
    let opts = [
        q.option_one.clone(),
        q.option_two.clone(),
        q.option_three.clone(),
        q.option_four.clone(),
    ];
    opts.iter().map(parse_year_u64).collect()
}
