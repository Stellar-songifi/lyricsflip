use crate::*;

impl LyricsFlip {
    pub(crate) fn player_round_count(env: &Env, player: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::PlayerRoundCount(player.clone()))
            .unwrap_or(0)
    }

    /// LF-286: appends `round_id` to `player`'s round-history index.
    pub(crate) fn push_player_round(env: &Env, player: &Address, round_id: u64) {
        let count = Self::player_round_count(env, player);
        let at_key = DataKey::PlayerRoundAt((player.clone(), count));
        env.storage().persistent().set(&at_key, &round_id);
        bump_persistent(env, &at_key);
        let count_key = DataKey::PlayerRoundCount(player.clone());
        env.storage().persistent().set(&count_key, &(count + 1));
        bump_persistent(env, &count_key);
    }

    /// LF-286: removes `round_id` from `player`'s index, keeping order. Only
    /// called on leave, before the round starts, so the entry is near the end.
    pub(crate) fn remove_player_round(env: &Env, player: &Address, round_id: u64) {
        let count = Self::player_round_count(env, player);
        let mut i = count;
        while i > 0 {
            i -= 1;
            let id: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::PlayerRoundAt((player.clone(), i)))
                .unwrap();
            if id == round_id {
                for j in i..count - 1 {
                    let next: u64 = env
                        .storage()
                        .persistent()
                        .get(&DataKey::PlayerRoundAt((player.clone(), j + 1)))
                        .unwrap();
                    env.storage()
                        .persistent()
                        .set(&DataKey::PlayerRoundAt((player.clone(), j)), &next);
                }
                env.storage()
                    .persistent()
                    .remove(&DataKey::PlayerRoundAt((player.clone(), count - 1)));
                env.storage()
                    .persistent()
                    .set(&DataKey::PlayerRoundCount(player.clone()), &(count - 1));
                return;
            }
        }
    }
}

pub(crate) fn get_player_rounds(env: Env, player: Address, start: u32, limit: u32) -> Vec<u64> {
    let count = LyricsFlip::player_round_count(&env, &player);
    let end = start.saturating_add(limit.min(MAX_PAGE_LIMIT)).min(count);
    let mut ids: Vec<u64> = Vec::new(&env);
    for i in start..end {
        ids.push_back(
            env.storage()
                .persistent()
                .get(&DataKey::PlayerRoundAt((player.clone(), count - 1 - i)))
                .unwrap(),
        );
    }
    ids
}

pub(crate) fn is_milestone_claimed(env: Env, player: Address, milestone: Milestone) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::MilestoneClaimed((player, milestone)))
        .unwrap_or(false)
}

pub(crate) fn get_player_stat(env: Env, player: Address) -> PlayerStats {
    let stats: PlayerStats = env
        .storage()
        .persistent()
        .get(&DataKey::PlayerStats(player.clone()))
        .unwrap_or(PlayerStats::zero());
    // Extend TTL on read so active players' stats don't get archived.
    if env
        .storage()
        .persistent()
        .has(&DataKey::PlayerStats(player.clone()))
    {
        bump_persistent(&env, &DataKey::PlayerStats(player));
    }
    stats
}

pub(crate) fn reset_milestone(env: Env, caller: Address, player: Address, milestone: Milestone) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    env.storage()
        .persistent()
        .remove(&DataKey::MilestoneClaimed((player.clone(), milestone)));
    MilestoneReset { player, milestone }.publish(&env);
}

pub(crate) fn claim_winnings(env: Env, caller: Address, round_id: u64) -> i128 {
    caller.require_auth();
    let round = LyricsFlip::read_round(&env, round_id);
    if round.wager_amount == 0 {
        return 0;
    }
    let escrow = env
        .storage()
        .instance()
        .get::<_, Address>(&DataKey::EscrowContract)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotAuthorized));
    EscrowClient::new(&env, &escrow).claim_winnings(&caller, &round_id)
}

pub(crate) fn claim_reward(env: Env, caller: Address, milestone: Milestone) -> u128 {
    caller.require_auth();
    LyricsFlip::require_not_paused(&env);
    let nft_contract = LyricsFlip::get_nft_contract(env.clone())
        .unwrap_or_else(|| panic_with_error!(env, Error::NftContractNotSet));

    let claimed_key = DataKey::MilestoneClaimed((caller.clone(), milestone));
    if env.storage().persistent().has(&claimed_key) {
        panic_with_error!(env, Error::MilestoneAlreadyClaimed);
    }

    let stats = LyricsFlip::get_player_stat(env.clone(), caller.clone());
    let reached = match milestone {
        Milestone::FirstWin => stats.rounds_won >= 1,
        Milestone::Streak5 => stats.max_streak >= 5,
        Milestone::TenWins => stats.rounds_won >= 10,
    };
    if !reached {
        panic_with_error!(env, Error::MilestoneNotReached);
    }

    set_persistent(&env, &claimed_key, &true);
    // Pass the milestone discriminant as `kind` so the NFT contract
    // records which achievement this badge represents (LF-168).
    let token_id = NftClient::new(&env, &nft_contract).mint(
        &env.current_contract_address(),
        &caller,
        &(milestone as u32),
    );

    RewardClaimed {
        player: caller,
        milestone,
        token_id,
    }
    .publish(&env);

    token_id
}
