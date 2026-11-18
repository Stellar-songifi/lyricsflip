Looking at the current file, I need to understand the existing types before implementing. The file references `types.rs` which I don't have, but I need to work with what's referenced. Let me implement the changes carefully based on the existing code structure.

Key observations:
- `DataKey::OpenRounds` is used in `read_open_rounds` and `remove_open_round`
- `Round` struct has fields I can see: `round_id, admin, genre, wager_amount, start_time, is_started, is_completed, end_time, next_card_index, is_cancelled, answer_window, lobby_timeout, round_duration, is_private, solo`
- `PlayerStats` has `rounds_won, total_rounds, current_streak, max_streak`
- `QuestionKind::{Title, Artist, Year}`
- `Answer::{Title, Artist, Year}`

Since I can't modify `types.rs`, I need to be careful. The step says to add `question_mode: QuestionMode` to `Round` and `solo_rounds_completed`/`solo_best_score` to `PlayerStats`, plus new `DataKey` variants. These are in `types.rs`. But the task says "Implement the contract-side changes for all four issues in `lib.rs`". 

I'll need to reference these new types/keys assuming they'll be added to `types.rs`. Since I must return only `lib.rs`, I'll write code that uses `QuestionMode`, `DataKey::OpenRoundAt`, `DataKey::OpenRoundPos`, `DataKey::OpenRoundsCount`, `DataKey::RoundCardKind`, `DataKey::KeeperReward`, and the new `PlayerStats` fields. This assumes `types.rs` is updated in tandem (which is the natural companion change).

Let me write the complete file.

For LF-266:
- `read_open_rounds` iterates `0..count` reading `OpenRoundAt(i)`
- `remove_open_round` swap-removes
- Add `cleanup_expired_lobbies` helper

For LF-269:
- Add `question_mode` param to create functions
- Store per-card kind in `RoundCardKind((round_id, card_index))`
- `get_question` reads stored kind
- `submit_answer_internal` checks variant match

For LF-270:
- `FINALIZE_GRACE_SECONDS` constant
- keeper reward config
- finalize allows any caller after grace

For LF-273:
- solo rounds don't increment `rounds_won`
- claim_reward gates on multiplayer

Let me write it. I need to be careful about the `Round` struct construction - it now needs `question_mode`. And `PlayerStats` needs the new fields but those are constructed via `PlayerStats::zero()` and mutated, so I just reference fields.

For `create_round` signature change - this is a public API change. The step says add `question_mode` parameter. I'll add it.

Let me also handle the `build_question_card` - it takes `kind` already, so `get_question` just needs to pass the stored kind.

For `submit_answer`, the current code matches `answer` against card fields. I need to check the kind matches. Let me look up the card's kind via `RoundCardKind((round_id, current_index))`.

Let me write the full file now.

For the keeper reward, I'll add `DataKey::KeeperReward` (u64) with a setter `set_keeper_reward`. In finalize, if caller is not a player and past grace, pay keeper reward... but there's no escrow yet. The step says "optionally paying the keeper reward from the fee". Since escrow isn't wired, I'll just record/emit it. Actually let me keep it simple - store the config and emit in event, but since there's no token transfer mechanism, I'll note it. Actually the `refund_wager` shows wagers aren't escrowed. I'll add the config and a comment, and include keeper reward in the event if applicable. Let me just add the setter and constant, and in finalize compute whether keeper is eligible.

Let me be pragmatic: add `FINALIZE_GRACE_SECONDS`, `set_keeper_reward`/`get_keeper_reward`, and in finalize allow non-participants after grace. For the reward, since no escrow, I'll just track it conceptually - I'll emit it in the RoundCompleted event? No, that changes event. I'll keep it minimal and add a comment. Actually, let me add a `keeper_reward` field to the event... no, can't change events easily. I'll just add the config setter and note in comment that payout happens when escrow lands.

Let me write the file now.

For `read_open_rounds` with pagination - `get_open_rounds` calls `read_open_rounds` then slices. I'll keep `read_open_rounds` returning full Vec by iterating count, but that's O(n) read. The step says "rewrite `read_open_rounds` to iterate `0..count` reading `OpenRoundAt(i)` (with pagination)". So I should make `get_open_rounds` read directly with pagination instead of materializing the whole vec. Let me rewrite `get_open_rounds` to read slots directly.

Let me restructure:
- `open_rounds_count(env) -> u32` reads `OpenRoundsCount`
- `get_open_rounds` reads `start..min(start+limit, count)` directly from `OpenRoundAt(i)`
- `remove_open_round` swap-removes

For cleanup of expired lobbies: I'll add a helper `cleanup_expired_lobbies` that scans open rounds and removes expired ones. But scanning all is O(n). The step says "invoked from the lobby read path or a dedicated entry point". I'll add a dedicated entry point `cleanup_expired_lobbies(env, caller, max_scan)` that anyone can call, scanning up to max_scan slots. And optionally call a bounded cleanup in `get_open_rounds`? That would make reads non-deterministic cost. Better: dedicated entry point. Let me add `cleanup_expired_lobbies`.

Actually to keep it bounded and O(1)-ish per operation, I'll make cleanup a separate entry point that scans a bounded window.

Let me write it all.

For `Round` construction in `create_round_internal`, add `question_mode`.

For per-card kind storage in Mixed mode: after selecting cards, iterate and for each card index, pick kind via PRNG and store `RoundCardKind((round_id, i))`. For non-mixed, store the fixed kind for all cards (or just derive from mode in get_question). Simpler: always store per-card kind. For TitleOnly store Title for all, etc. For Mixed pick randomly.

Let me use `get_random_numbers` or a simple LCG to pick kind. I'll use a simple deterministic pick based on seed and index.

Let me write helper `pick_question_kind(env, mode, seed, index) -> QuestionKind`.

For Mixed: use LCG on (seed, index) to pick 0/1/2.

Now `get_question` reads `RoundCardKind((round_id, current_index))`.

For `submit_answer_internal` and `submit_answer`, check the answer variant matches the card's kind. If mismatch, score 0 (or reject). Step says "score 0 (or reject)". I'll score 0 - treat as wrong. Actually "only accepts the Answer variant that matches" - so reject with error? The acceptance says "answers of the wrong variant score 0". So score 0, not reject. Let me score 0.

Wait, but there's also the `answer_time <= window` check. If variant mismatches, is_correct = false. Let me add kind check to is_correct.

Let me define a helper `answer_matches_kind(answer, kind) -> bool`.

Now let me write the whole file.

For `create_solo_round`, add `question_mode` param.

For `create_round`, add `question_mode` param.

For `create_round_with_filter`, add `question_mode` param.

Let me write.

For `PlayerStats` new fields - I reference `stats.solo_rounds_completed` and `stats.solo_best_score`. These must exist in types.rs. I'll assume they do.

For finalize solo handling:
```
if round.solo {
    // update solo stats only
    for player in players {
        let mut stats = ...;
        stats.solo_rounds_completed += 1;
        let score = scores.get(player).unwrap_or(0);
        if score > stats.solo_best_score { stats.solo_best_score = score; }
        // do NOT increment rounds_won
    }
} else {
    // existing winner logic
}
```

But `determine_round_winners` is used for the event. For solo, winners would be the player if score>0. That's fine for event but we don't increment rounds_won.

For claim_reward gating:
```
Milestone::FirstWin => stats.rounds_won >= 1,
Milestone::TenWins => stats.rounds_won >= 10,
```
Since solo no longer increments rounds_won, this naturally gates. But step also says "require at least 2 players". Hmm, rounds_won only increments in multiplayer finalize now. But to be safe, the acceptance is "Solo rounds alone can't unlock multiplayer milestones." Since solo doesn't touch rounds_won, that's satisfied. I'll keep the existing checks but they now only reflect multiplayer wins. Good.

Actually wait - the step says "gate FirstWin/TenWins on multiplayer rounds_won and require at least two players." The "require at least two players" might mean at finalize time only count if players.len() >= 2. Let me add that check in finalize: only increment rounds_won if players.len() >= 2 (and not solo). That's cleaner.

Let me implement: in finalize, `let players = Self::read_round_players(...)`. If `round.solo || players.len() < 2`, don't increment rounds_won; instead update solo stats if solo.

Actually if it's a multiplayer round with only 1 player (possible?), don't count as win. Let me do:
```
let is_multiplayer = !round.solo && players.len() >= 2;
if is_multiplayer {
    // increment rounds_won for winners
} else if round.solo {
    // update solo stats
}
```

Good.

Now let me write the complete file. I'll preserve everything else.

Let me carefully handle `get_open_rounds` rewrite:
```
pub fn get_open_rounds(env: Env, start: u32, limit: u32) -> Vec<u64> {
    let count = Self::open_rounds_count(&env);
    let end = start.saturating_add(limit.min(MAX_PAGE_LIMIT)).min(count);
    let mut out = Vec::new(&env);
    let mut i = start;
    while i < end {
        if let Some(id) = env.storage().persistent().get(&DataKey::OpenRoundAt(i)) {
            out.push_back(id);
        }
        i += 1;
    }
    out
}
```

`open_rounds_count`:
```
fn open_rounds_count(env: &Env) -> u32 {
    env.storage().persistent().get(&DataKey::OpenRoundsCount).unwrap_or(0)
}
```

`add_open_round`:
```
fn add_open_round(env: &Env, round_id: u64) {
    let count = Self::open_rounds_count(env);
    env.storage().persistent().set(&DataKey::OpenRoundAt(count), &round_id);
    env.storage().persistent().set(&DataKey::OpenRoundPos(round_id), &count);
    env.storage().persistent().set(&DataKey::OpenRoundsCount, &(count + 1));
    bump_persistent(env, &DataKey::OpenRoundAt(count));
    bump_persistent(env, &DataKey::OpenRoundPos(round_id));
    bump_persistent(env, &DataKey::OpenRoundsCount);
}
```

`remove_open_round`:
```
fn remove_open_round(env: &Env, round_id: u64, admin: &Address) {
    let pos: Option<u32> = env.storage().persistent().get(&DataKey::OpenRoundPos(round_id));
    let Some(pos) = pos else { return; };
    let count = Self::open_rounds_count(env);
    if count == 0 { return; }
    let last = count - 1;
    if pos != last {
        let moved: u64 = env.storage().persistent().get(&DataKey::OpenRoundAt(last)).unwrap();
        env.storage().persistent().set(&DataKey::OpenRoundAt(pos), &moved);
        env.storage().persistent().set(&DataKey::OpenRoundPos(moved), &pos);
        bump_persistent(env, &DataKey::OpenRoundAt(pos));
        bump_persistent(env, &DataKey::OpenRoundPos(moved));
    }
    env.storage().persistent().remove(&DataKey::OpenRoundAt(last));
    env.storage().persistent().remove(&DataKey::OpenRoundPos(round_id));
    env.storage().persistent().set(&DataKey::OpenRoundsCount, &last);
    bump_persistent(env, &DataKey::OpenRoundsCount);
    Self::dec_open_rounds_of(env, admin);
}
```

Wait, the original `remove_open_round` only decrements `open_rounds_of` if the round was found. My version returns early if no pos. Good.

But there's a subtlety: `remove_open_round` is called from `start_round` and `cancel_round`. For private/solo rounds, they were never added, so `OpenRoundPos` won't exist, and we return early without decrementing. Good - matches original behavior (original only decremented if found in vec).

But wait - original `remove_open_round` decrements `open_rounds_of(admin)` only if found. For private rounds, admin's count was never incremented, so we shouldn't decrement. My early return handles that. Good.

Now `cleanup_expired_lobbies`:
```
pub fn cleanup_expired_lobbies(env: Env, caller: Address, max_scan: u32) {
    caller.require_auth();
    let count = Self::open_rounds_count(&env);
    let scan = max_scan.min(count);
    let now = env.ledger().timestamp();
    let mut i = 0;
    while i < scan {
        // re-read count each iteration since removal shrinks it
        let current = Self::open_rounds_count(&env);
        if i >= current { break; }
        let round_id: u64 = env.storage().persistent().get(&DataKey::OpenRoundAt(i)).unwrap();
        let round = Self::read_round(&env, round_id);
        let created_at: u64 = env.storage().persistent().get(&DataKey::RoundCreatedAt(round_id)).unwrap_or(0);
        let expired = round.is_started || round.is_cancelled || now >= created_at + round.lobby_timeout;
        if expired {
            Self::remove_open_round(&env, round_id, &round.admin);
            // don't increment i; swap moved element into i
        } else {
            i += 1;
        }
    }
}
```

Hmm, but `read_round` on a started round... started rounds shouldn't be in open list. But if they are (shouldn't happen), removing is fine. Actually started rounds are removed from open list on start. So open list only has pending rounds. So expired = now >= created_at + lobby_timeout. Let me simplify: expired if `now >= created_at + round.lobby_timeout` OR round.is_cancelled OR round.is_started. Good.

Now for LF-269, `pick_question_kind`:
```
fn pick_question_kind(env: &Env, mode: QuestionMode, seed: u64, index: u32) -> QuestionKind {
    match mode {
        QuestionMode::TitleOnly => QuestionKind::Title,
        QuestionMode::ArtistOnly => QuestionKind::Artist,
        QuestionMode::YearOnly => QuestionKind::Year,
        QuestionMode::Mixed => {
            let mut s = seed
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407)
                .wrapping_add(index as u64);
            s = s.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
            match s % 3 {
                0 => QuestionKind::Title,
                1 => QuestionKind::Artist,
                _ => QuestionKind::Year,
            }
        }
    }
}
```

Store per-card kind in create_round_internal after cards selected:
```
for (i, card_id) in cards.iter().enumerate() {
    let kind = Self::pick_question_kind(env, question_mode, seed, i as u32);
    env.storage().persistent().set(&DataKey::RoundCardKind((round_id, i as u32)), &kind);
    bump_persistent(env, &DataKey::RoundCardKind((round_id, i as u32)));
}
```

But `cards.iter().enumerate()` - soroban Vec iter doesn't have enumerate. Use index loop.

`get_question`:
```
let kind: QuestionKind = env.storage().persistent()
    .get(&DataKey::RoundCardKind((round_id, current_index)))
    .unwrap_or(QuestionKind::Title);
Self::build_question_card(env, card, round_id, kind)
```

`submit_answer_internal` and `submit_answer` - check kind:
```
let kind: QuestionKind = env.storage().persistent()
    .get(&DataKey::RoundCardKind((round_id, current_index)))
    .unwrap_or(QuestionKind::Title);
let variant_matches = match (&answer, kind) {
    (Answer::Title(_), QuestionKind::Title) => true,
    (Answer::Artist(_), QuestionKind::Artist) => true,
    (Answer::Year(_), QuestionKind::Year) => true,
    _ => false,
};
let is_correct = variant_matches && answer_time <= window && match answer {...};
```

For `submit_answer` (the public one), same logic. Let me update both.

Now `create_solo_round` - add question_mode param, and it calls create_round_internal with question_mode. Then builds first question with the stored kind for card 0.

Let me write the full file now.

For `Round` construction, add `question_mode`. The `Round` struct in types.rs must have this field. I'll assume it's added.

Also `RoundV3`/`LegacyRound` conversions - those are in types.rs, not my concern.

Let me also add `set_keeper_reward`/`get_keeper_reward` and `FINALIZE_GRACE_SECONDS`.

For finalize keeper logic:
```
let is_participant = Self::is_round_player(&env, round_id, &caller);
let grace_deadline = round.end_time + FINALIZE_GRACE_SECONDS;
let past_grace = round.end_time != 0 && now >= grace_deadline;
if !is_participant && !past_grace {
    panic_with_error!(env, Error::NotAParticipant);
}
```

Wait, but the original also requires the round to be ready (all answered or past deadline). For non-participant keeper, they can only finalize after grace, which is after deadline, so is_past_deadline is true. Good.

But there's an issue: the original checks `is_round_player` first, then checks cancelled/finalized. Let me reorder: check cancelled/finalized first, then participant/grace.

Let me restructure finalize:
```
pub fn finalize_round(env: Env, caller: Address, round_id: u64) {
    caller.require_auth();
    let round = Self::read_round(&env, round_id);
    if round.is_cancelled {
        panic_with_error!(env, Error::RoundCancelled);
    }
    if env.storage().persistent().get(&DataKey::RoundFinalized(round_id)).unwrap_or(false) {
        panic_with_error!(env, Error::RoundAlreadyFinalized);
    }
    let now = env.ledger().timestamp();
    let is_participant = Self::is_round_player(&env, round_id, &caller);
    let past_grace = round.end_time != 0 && now >= round.end_time + FINALIZE_GRACE_SECONDS;
    if !is_participant && !past_grace {
        panic_with_error!(env, Error::NotAParticipant);
    }
    let is_all_cards_answered = Self::are_all_required_answers_submitted(&env, round_id);
    let is_past_deadline = round.end_time != 0 && now >= round.end_time;
    if !is_all_cards_answered && !is_past_deadline {
        panic_with_error!(env, Error::RoundNotReady);
    }
    ...
}
```

Good.

Now the winner/stats logic:
```
let players = Self::read_round_players(&env, round_id);
let winners = Self::determine_round_winners(&env, round_id);
let scores = Self::get_round_scores(env.clone(), round_id);

if round.solo {
    // solo: update solo stats, no rounds_won
    for player in players.iter() {
        let mut stats = Self::get_player_stat(env.clone(), player.clone());
        stats.solo_rounds_completed += 1;
        let score = scores.get(player.clone()).unwrap_or(0);
        if score > stats.solo_best_score {
            stats.solo_best_score = score;
        }
        env.storage().persistent().set(&DataKey::PlayerStats(player.clone()), &stats);
        bump_persistent(&env, &DataKey::PlayerStats(player));
    }
} else if players.len() >= 2 {
    // multiplayer: increment rounds_won for winners
    for player in players.iter() {
        let mut is_winner = false;
        for winner in winners.iter() {
            if winner == player { is_winner = true; break; }
        }
        if is_winner {
            let mut stats = Self::get_player_stat(env.clone(), player.clone());
            stats.rounds_won += 1;
            env.storage().persistent().set(&DataKey::PlayerStats(player.clone()), &stats);
            bump_persistent(&env, &DataKey::PlayerStats(player));
        }
    }
}
```

Wait, but `round` is moved into `let mut round = round;` earlier. Let me keep `round.solo` accessible. I'll read `round.solo` before moving or use the mutable round. Actually I set `round.is_completed = true` etc. Let me capture `let is_solo = round.solo;` before.

Now the event `RoundCompleted` uses `winners` and `scores`. Fine.

Let me now write the complete file. This is long. Let me be thorough.

One concern: `QuestionMode` needs to be exported from types. I'll add it to the `pub use types::{...}` list.

Also `DataKey::OpenRoundAt`, `OpenRoundPos`, `OpenRoundsCount`, `RoundCardKind`, `KeeperReward` - these are in types.rs. I'll reference them.

Let me write.

For `create_round` signature - adding `question_mode` param. This breaks existing callers but that's the API change required.

Let me write the whole thing now.

Also need to handle `create_round_with_filter` - add question_mode.

Let me also make sure `build_question_card` is still public and works.

For `create_solo_round`, after creating, build first question with stored kind:
```
let kind: QuestionKind = env.storage().persistent()
    .get(&DataKey::RoundCardKind((round_id, 0u32)))
    .unwrap_or(QuestionKind::Title);
Self::build_question_card(env, card, round_id, kind)
```

Now writing the full file.

Let me also double check `get_open_rounds` - the original returned `open.slice(start..end)`. My rewrite reads slots directly. Good.

Also `read_open_rounds` is used in `create_round_internal` (old code) and `remove_open_round`. I'm replacing both. Let me remove `read_open_rounds` or keep it for compatibility? The step says rewrite it. I'll keep a `read_open_rounds` that materializes for any remaining callers, but actually nothing else uses it after my changes. Let me remove it and replace with `open_rounds_count`. Actually `get_open_rounds` used it. I'll rewrite `get_open_rounds` to not use it. Let me just remove `read_open_rounds` and add `open_rounds_count`.

Wait, is `read_open_rounds` referenced anywhere else? Only in `get_open_rounds`, `create_round_internal`, `remove_open_round`. All being rewritten. Good, remove it.

Let me write.

For the `Index` enum and card stuff - unchanged.

Now, one more: `create_round_internal` signature adds `question_mode: QuestionMode`. And `solo` param stays.

Let me write the final file.

I need to be careful with the `Round` struct literal - add `question_mode`.

Also `RoundV3`/`LegacyRound` -> `Round` conversions happen in types.rs, so `read_round` is fine.

Let me write it all out now.

For `submit_answer` public function, I need to add kind check. Let me update it.

Also `answer_and_next` calls `submit_answer_internal`, which I'll update.

Let me write.

Actually, I realize `submit_answer` (public) and `submit_answer_internal` are nearly duplicate. I'll update both with the kind check.

Let me write the complete file.

For keeper reward setter:
```
pub fn set_keeper_reward(env: Env, caller: Address, value: u64) {
    caller.require_auth();
    Self::assert_owner(&env, &caller);
    env.storage().instance().set(&DataKey::KeeperReward, &value);
    bump_instance(&env);
}

pub fn get_keeper_reward(env: Env) -> u64 {
    bump_instance(&env);
    env.storage().instance().get(&DataKey::KeeperReward).unwrap_or(0)
}
```

In finalize, if keeper (non-participant) finalizes, we could pay. Since no escrow, I'll just note it. Actually let me add a comment and not do token transfer. The step says "optionally". I'll leave a comment.

Now writing.

Let me make sure I handle the `players` variable in finalize correctly - I read it once.

Let me write the full file content now.```rust
#![no_std]

mod errors;
mod events;
mod types;

#[cfg(test)]
mod budget_thresholds;
#[cfg(test)]
mod test;
#[cfg(test)]
mod test_budget;

pub use errors::Error;
pub use events::{
    AnswerSubmitted, AnswerWindowUpdated, CardAdded, CardDrawn, CardRemoved, CardUpdated,
    CardsPerRoundUpdated, ContractUpgraded, LobbyTimeoutUpdated, OwnershipTransferStarted,
    OwnershipTransferred, Paused, PlayerReady, RewardClaimed, RoleUpdated, RoundBufferUpdated,
    RoundCancelled, RoundCompleted, RoundCreated, RoundDurationUpdated, RoundJoined, RoundLeft,
    RoundStarted, SchemaMigrated, Unpaused,
};
pub use types::{
    Answer, AnswerResult, Card, CardPos, DataKey, Genre, LegacyCard, LegacyRound, Milestone,
    PlayerStats, QuestionCard, QuestionKind, QuestionMode, Role, Round, RoundFilter, RoundV3,
};

use soroban_sdk::{
    contract, contractclient, contractimpl, panic_with_error, Address, Bytes, BytesN, Env, Map,
    String, TryFromVal, Val, Vec,
};

/// Bumped on every release that changes the contract's code; see `upgrade`.
pub const VERSION: u32 = 1;
/// Current persisted storage layout. Kept separate from the code version.
pub const SCHEMA_VERSION: u32 = 5;

pub const DEFAULT_ROUND_DURATION_SECONDS: u64 = 300;
pub const MIN_ROUND_DURATION_SECONDS: u64 = 10;
pub const MAX_ROUND_DURATION_SECONDS: u64 = 86_400;

/// Default cap on players per round when the owner hasn't set `max_players`.
pub const DEFAULT_MAX_PLAYERS: u32 = 8;

/// Seconds a player has to answer after a card is flipped (README card-flip
/// rule). Answers submitted after the window are accepted but scored as
/// wrong, so every player can still complete the round.
pub const CARD_ANSWER_WINDOW_SECONDS: u64 = 15;
pub const MIN_ANSWER_WINDOW_SECONDS: u64 = 5;
pub const MAX_ANSWER_WINDOW_SECONDS: u64 = 180;

/// Points for an instant correct answer; each elapsed second costs
/// `POINTS_DECAY_PER_SECOND`, down to `MIN_CORRECT_POINTS`.
pub const MAX_CORRECT_POINTS: u64 = 100;
pub const POINTS_DECAY_PER_SECOND: u64 = 5;

/// LF-159: answers within this many seconds of the draw earn full points.
pub const FIRST_LEDGER_GRACE_SECONDS: u64 = 6;
pub const MIN_CORRECT_POINTS: u64 = 10;

/// Seconds after creation after which anyone may cancel a round that never
/// started.
pub const LOBBY_TIMEOUT_SECONDS: u64 = 600;
pub const MIN_LOBBY_TIMEOUT_SECONDS: u64 = 30;
pub const MAX_LOBBY_TIMEOUT_SECONDS: u64 = 86_400;

/// LF-175: cap on public lobby rounds one address may leave open at once.
/// Creating a free (0-wager) round costs only a transaction fee, so without
/// a cap a single account could flood the open-lobby index and drown out
/// real lobbies.
pub const MAX_OPEN_ROUNDS_PER_ADDRESS: u32 = 3;

/// LF-270: seconds after a round's deadline before any address (a "keeper")
/// may finalize an abandoned round. Before this grace period only players in
/// the round may finalize it.
pub const FINALIZE_GRACE_SECONDS: u64 = 300;

/// Default per-card transaction latency buffer for dynamic round duration.
pub const DEFAULT_ROUND_BUFFER_SECONDS: u64 = 15;
pub const MIN_ROUND_BUFFER_SECONDS: u64 = 1;
pub const MAX_ROUND_BUFFER_SECONDS: u64 = 60;

/// The subset of the `lyricsflip-nft` interface the game contract calls.
///
/// `kind` maps directly to the `Milestone` discriminant (0 = FirstWin,
/// 1 = Streak5, 2 = TenWins) so the NFT contract records which achievement
/// a badge represents (LF-168).
#[contractclient(name = "NftClient")]
#[allow(dead_code)]
pub trait NftInterface {
    fn mint(env: Env, caller: Address, recipient: Address, kind: u32) -> u128;
}

/// Upper bound on the page size of the paginated list views (`get_rounds`,
/// `get_open_rounds`). Larger `limit` values are clamped to this.
pub const MAX_PAGE_LIMIT: u32 = 50;

// ---------------------------------------------------------------------------
// LF-012 – TTL policy
//
// Soroban persistent and instance entries are archived when their TTL expires.
// We extend TTLs on every write (and on reads for hot keys) so that active
// game data stays available on testnet / mainnet.
//
// Ledger cadence on Stellar mainnet ≈ 5 s, so:
//   DAY_IN_LEDGERS  ≈ 17 280 ledgers/day
//   BUMP_AMOUNT     = 30 days of ledgers
//   LIFETIME_THRESHOLD = 7 days — extend only when less than this remains,
//                        avoiding a per-call extend when lots of TTL is left.
// ---------------------------------------------------------------------------
pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS; // ~30 days
pub const LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS; // ~7 days

/// Extend instance storage TTL (owner, admin map, counters, config).
#[inline]
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

/// Extend a single persistent storage entry by key.
#[inline]
fn bump_persistent<K>(env: &Env, key: &K)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    soroban_sdk::Val: soroban_sdk::TryFromVal<Env, K>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}
/// Upper bound on the number of candidate cards inspected per fallback attempt
/// when building a question card. `build_question_card` never asks
/// `get_random_numbers` for more ids than `min(10, cards_count)`, so small
/// card sets no longer panic with `AmountExceedsLimit` (LF-010).
const MAX_DISTRACTOR_SAMPLE: u64 = 10;

/// Maximum number of players in a round. Keeps the `RoundPlayers` vector
/// (read on every join/answer/finalize) bounded.
pub const MAX_ROUND_PLAYERS: u32 = 8;

/// Maximum value accepted by `set_cards_per_round`. Together with
/// `MAX_ROUND_PLAYERS` this bounds the players x cards loops in
/// `start_round`, `finalize_round` and `are_all_required_answers_submitted`
/// (see `test_budget::finalize_round_budget`).
pub const MAX_CARDS_PER_ROUND: u32 = 20;

/// Card validation bounds. The upper year bound is the current year derived
/// from the ledger timestamp.
pub const MIN_CARD_YEAR: u64 = 1900;
pub const MAX_LYRICS_LEN: u32 = 1000;
const SECONDS_PER_YEAR: u64 = 31_556_952;

/// Maximum number of cards accepted by one `add_cards` call. See
/// `onchain/README.md` and `test::add_cards_max_batch_fits_budget`.
pub const MAX_CARDS_PER_BATCH: u32 = 20;
/// Maximum number of cards inspected when applying round filters.
pub const MAX_ROUND_FILTER_SCAN: u32 = 500;

/// One of the card index lists (see `DataKey::CardAt` and friends).
enum Index {
    All,
    Genre(Genre),
    Artist(String),
    Year(u64),
}

impl Index {
    fn of(env: &Env, card: &Card) -> [Index; 4] {
        [
            Index::All,
            Index::Genre(card.genre),
            Index::Artist(ascii_lower_string(env, &card.artist)),
            Index::Year(card.year),
        ]
    }

    fn count_key(&self) -> DataKey {
        match self {
            Index::All => DataKey::CardsCount,
            Index::Genre(g) => DataKey::GenreCardCount(*g),
            Index::Artist(a) => DataKey::ArtistCardCount(a.clone()),
            Index::Year(y) => DataKey::YearCardCount(*y),
        }
    }

    fn at_key(&self, i: u32) -> DataKey {
        match self {
            Index::All => DataKey::CardAt(i),
            Index::Genre(g) => DataKey::GenreCardAt((*g, i)),
            Index::Artist(a) => DataKey::ArtistCardAt((a.clone(), i)),
            Index::Year(y) => DataKey::YearCardAt((*y, i)),
        }
    }

    fn pos<'a>(&self, pos: &'a mut CardPos) -> &'a mut u32 {
        match self {