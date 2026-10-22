//! Resource-budget ceilings for `test_budget`, measured with a 500-card
//! catalogue and 8 players (soroban-sdk 27 default budget). Each ceiling is
//! the measured value plus ~10% headroom; raise one only alongside a note in
//! the PR explaining the new cost.
//!
//! | Call                          | Measured CPU | Measured memory |
//! | ----------------------------- | ------------ | --------------- |
//! | `create_round`                | 20,003,252   | 6,763,970       |
//! | `start_round` (8th ready-up)  | 36,637,500   | 10,628,309      |
//! | `build_question_card` (Title) | 4,633,560    | 2,490,833       |
//! | `create_solo_round`           | 53,550,353   | 17,028,908      |
//! | `answer_and_next`             | 21,160,915   | 6,208,319       |

pub const CREATE_ROUND_MAX_CPU: u64 = 22_000_000;
pub const CREATE_ROUND_MAX_MEM: u64 = 7_450_000;

pub const START_ROUND_MAX_CPU: u64 = 40_300_000;
pub const START_ROUND_MAX_MEM: u64 = 11_700_000;

/// Covers every `QuestionKind`; Title is the most expensive.
pub const BUILD_QUESTION_CARD_MAX_CPU: u64 = 5_100_000;
pub const BUILD_QUESTION_CARD_MAX_MEM: u64 = 2_750_000;

// LF-163
pub const CREATE_SOLO_ROUND_MAX_CPU: u64 = 59_000_000;
pub const CREATE_SOLO_ROUND_MAX_MEM: u64 = 19_000_000;
// LF-164
pub const ANSWER_AND_NEXT_MAX_CPU: u64 = 24_000_000;
pub const ANSWER_AND_NEXT_MAX_MEM: u64 = 7_000_000;

// LF-181: thresholds below are conservative, unmeasured ceilings, not
// measured-value-plus-headroom like the ones above — getting real numbers
// requires running `cargo test`, which was out of scope for this change.
// Tighten these to a real measurement (see the `measure` helper's
// `std::println!` output) the next time these tests are run.

/// `submit_answer` alone (no draw). Comparable to `answer_and_next` minus
/// the `next_card` draw, so the same order of magnitude.
pub const SUBMIT_ANSWER_MAX_CPU: u64 = 20_000_000;
pub const SUBMIT_ANSWER_MAX_MEM: u64 = 600_000;

/// `finalize_round` with 8 players × 20 cards. Its two O(players × cards)
/// passes (`are_all_required_answers_submitted`, `determine_round_winners`)
/// make this the most expensive call in the file at realistic round sizes.
pub const FINALIZE_ROUND_MAX_CPU: u64 = 60_000_000;
pub const FINALIZE_ROUND_MAX_MEM: u64 = 15_000_000;

/// `claim_reward`, including the cross-contract `mint` call into the NFT
/// contract.
pub const CLAIM_REWARD_MAX_CPU: u64 = 15_000_000;
pub const CLAIM_REWARD_MAX_MEM: u64 = 3_000_000;
