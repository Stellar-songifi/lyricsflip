use crate::*;

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

    env.storage().persistent().set(&claimed_key, &true);
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
