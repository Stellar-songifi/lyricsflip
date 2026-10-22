//! Resource-budget regression tests (LF-033). Each test records CPU and
//! memory for one call with realistic data and fails if it exceeds the
//! ceiling in `budget_thresholds.rs`.

extern crate std;

use crate::budget_thresholds::*;
use crate::{
    Answer, Card, Genre, LyricsFlip, LyricsFlipClient, Milestone, QuestionKind,
    MAX_CARDS_PER_ROUND, MAX_ROUND_PLAYERS,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

const CATALOGUE_SIZE: u64 = 500;

fn setup_catalogue<'a>() -> (Env, LyricsFlipClient<'a>, Address) {
    setup_catalogue_sized(CATALOGUE_SIZE)
}

fn setup_catalogue_sized<'a>(size: u64) -> (Env, LyricsFlipClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_780_000_000);
    env.cost_estimate().budget().reset_unlimited();

    let owner = Address::generate(&env);
    let contract_id = env.register(LyricsFlip, (owner.clone(),));
    let client = LyricsFlipClient::new(&env, &contract_id);

    for i in 0..size {
        let card = Card {
            card_id: 0,
            genre: Genre::Pop,
            artist: String::from_str(&env, &std::format!("Artist {}", i)),
            title: String::from_str(&env, &std::format!("Title {}", i)),
            year: 1950 + (i % 70),
            difficulty: 2,
            lyrics: String::from_str(&env, "sample lyric line"),
        };
        client.add_card(&owner, &card);
    }
    (env, client, owner)
}

/// Creates an 8-player round (owner + 7 joiners) with `cards_per_round`
/// cards and starts it, returning the round id and the 7 joiners (the
/// owner is the 8th player).
fn setup_full_round(
    env: &Env,
    client: &LyricsFlipClient,
    owner: &Address,
    cards_per_round: u32,
) -> (u64, std::vec::Vec<Address>) {
    client.set_cards_per_round(owner, &cards_per_round);
    let round_id = client.create_round(owner, &Some(Genre::Pop), &42u64, &None);

    let mut joiners = std::vec::Vec::new();
    for _ in 1..MAX_ROUND_PLAYERS {
        let player = Address::generate(env);
        client.join_round(&player, &round_id, &None);
        joiners.push(player);
    }
    for player in joiners.iter() {
        client.start_round(player, &round_id);
    }
    // The owner's ready-up is the 8th, which starts the round for everyone.
    client.start_round(owner, &round_id);

    (round_id, joiners)
}

/// Draws and answers every remaining card in the round for `player`. The
/// answer content doesn't matter for these budget tests — `submit_answer`
/// records "answered" before it checks correctness — so a wrong guess is
/// used throughout to avoid needing the real card text.
fn answer_every_card(env: &Env, client: &LyricsFlipClient, player: &Address, round_id: u64, cards: u32) {
    for _ in 0..cards {
        client.next_card(player, &round_id);
        client.submit_answer(player, &round_id, &Answer::Title(String::from_str(env, "wrong")));
    }
}

fn measure<F: FnOnce()>(env: &Env, name: &str, max_cpu: u64, max_mem: u64, call: F) {
    env.cost_estimate().budget().reset_default();
    call();
    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();
    std::println!("{name}: cpu={cpu} mem={mem}");
    assert!(cpu <= max_cpu, "{name} CPU {cpu} exceeds {max_cpu}");
    assert!(mem <= max_mem, "{name} memory {mem} exceeds {max_mem}");
    env.cost_estimate().budget().reset_unlimited();
}

#[test]
fn create_round_budget() {
    let (env, client, owner) = setup_catalogue();
    measure(
        &env,
        "create_round",
        CREATE_ROUND_MAX_CPU,
        CREATE_ROUND_MAX_MEM,
        || {
            client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
        },
    );
}

#[test]
fn start_round_budget() {
    let (env, client, owner) = setup_catalogue();
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    let mut players = std::vec::Vec::new();
    for _ in 1..MAX_ROUND_PLAYERS {
        let player = Address::generate(&env);
        client.join_round(&player, &round_id, &None);
        players.push(player);
    }
    for player in players.iter() {
        client.start_round(player, &round_id);
    }
    // The last ready-up starts the round for all 8 players.
    measure(
        &env,
        "start_round",
        START_ROUND_MAX_CPU,
        START_ROUND_MAX_MEM,
        || {
            client.start_round(&owner, &round_id);
        },
    );
}

#[test]
fn build_question_card_budget() {
    let (env, client, _owner) = setup_catalogue();
    let card = client.get_card(&1u64);
    for kind in [
        QuestionKind::Title,
        QuestionKind::Artist,
        QuestionKind::Year,
    ] {
        measure(
            &env,
            "build_question_card",
            BUILD_QUESTION_CARD_MAX_CPU,
            BUILD_QUESTION_CARD_MAX_MEM,
            || {
                client.build_question_card(&card, &7u64, &kind);
            },
        );
    }
}

/// LF-181: re-run with a 5,000-card catalogue (10x the 500 used above) to
/// confirm distractor selection stays bounded rather than scaling with
/// catalogue size.
#[test]
fn build_question_card_budget_large_catalogue() {
    const LARGE_CATALOGUE_SIZE: u64 = 5_000;
    let (env, client, _owner) = setup_catalogue_sized(LARGE_CATALOGUE_SIZE);
    let card = client.get_card(&1u64);
    for kind in [
        QuestionKind::Title,
        QuestionKind::Artist,
        QuestionKind::Year,
    ] {
        measure(
            &env,
            "build_question_card (5,000-card catalogue)",
            BUILD_QUESTION_CARD_MAX_CPU,
            BUILD_QUESTION_CARD_MAX_MEM,
            || {
                client.build_question_card(&card, &7u64, &kind);
            },
        );
    }
}

/// LF-181: a single `submit_answer` call (no draw), isolated from the
/// combined `answer_and_next` dispatcher measured above.
#[test]
fn submit_answer_budget() {
    let (env, client, owner) = setup_catalogue();
    let (round_id, joiners) = setup_full_round(&env, &client, &owner, MAX_CARDS_PER_ROUND);

    // Everyone but the owner finishes their deck first so the owner's last
    // answer is measured under a realistic, fully-populated round (scores
    // and answer-time maps at their largest for this round).
    for player in joiners.iter() {
        answer_every_card(&env, &client, player, round_id, MAX_CARDS_PER_ROUND);
    }
    answer_every_card(&env, &client, &owner, round_id, MAX_CARDS_PER_ROUND - 1);
    client.next_card(&owner, &round_id);

    measure(
        &env,
        "submit_answer",
        SUBMIT_ANSWER_MAX_CPU,
        SUBMIT_ANSWER_MAX_MEM,
        || {
            client.submit_answer(&owner, &round_id, &Answer::Title(String::from_str(&env, "wrong")));
        },
    );
}

/// LF-181 / LF-154: `finalize_round` at the worst case the contract allows,
/// `MAX_ROUND_PLAYERS` × `MAX_CARDS_PER_ROUND`, so its players × cards loop
/// (`are_all_required_answers_submitted`) can never exceed the budget.
#[test]
fn finalize_round_budget() {
    let (env, client, owner) = setup_catalogue();
    let (round_id, joiners) = setup_full_round(&env, &client, &owner, MAX_CARDS_PER_ROUND);

    for player in joiners.iter() {
        answer_every_card(&env, &client, player, round_id, MAX_CARDS_PER_ROUND);
    }
    answer_every_card(&env, &client, &owner, round_id, MAX_CARDS_PER_ROUND);

    measure(
        &env,
        "finalize_round",
        FINALIZE_ROUND_MAX_CPU,
        FINALIZE_ROUND_MAX_MEM,
        || {
            client.finalize_round(&owner, &round_id);
        },
    );
}

/// LF-181: `claim_reward`, including the cross-contract `mint` call into
/// the NFT contract.
#[test]
fn claim_reward_budget() {
    let (env, client, owner) = setup_catalogue();
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
    client.set_nft_contract(&owner, &nft_id);

    // Win a round as the owner so FirstWin is reached.
    client.set_cards_per_round(&owner, &1u32);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    client.start_round(&owner, &round_id);
    let card = client.next_card(&owner, &round_id);
    client.submit_answer(&owner, &round_id, &Answer::Title(card.title.clone()));
    client.finalize_round(&owner, &round_id);

    measure(
        &env,
        "claim_reward",
        CLAIM_REWARD_MAX_CPU,
        CLAIM_REWARD_MAX_MEM,
        || {
            client.claim_reward(&owner, &Milestone::FirstWin);
        },
    );
}

#[test]
fn create_solo_round_budget() {
    let (env, client, owner) = setup_catalogue();
    client.set_cards_per_round(&owner, &5);
    measure(
        &env,
        "create_solo_round",
        CREATE_SOLO_ROUND_MAX_CPU,
        CREATE_SOLO_ROUND_MAX_MEM,
        || {
            client.create_solo_round(&owner, &Some(Genre::Pop), &42u64);
        },
    );
}

#[test]
fn answer_and_next_budget() {
    let (env, client, owner) = setup_catalogue();
    client.set_cards_per_round(&owner, &5);
    let round_id = client.create_round(&owner, &Some(Genre::Pop), &42u64, &None);
    client.start_round(&owner, &round_id);
    let card = client.next_card(&owner, &round_id);
    measure(
        &env,
        "answer_and_next",
        ANSWER_AND_NEXT_MAX_CPU,
        ANSWER_AND_NEXT_MAX_MEM,
        || {
            client.answer_and_next(&owner, &round_id, &Answer::Title(card.title.clone()));
        },
    );
}
