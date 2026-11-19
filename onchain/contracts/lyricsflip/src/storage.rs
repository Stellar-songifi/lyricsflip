//! Storage helpers: TTL policy, write/bump helpers and round-state readers.

use crate::*;

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
//   LIFETIME_THRESHOLD = 7 days — extend only when less than this remains,
//                        avoiding a per-call extend when lots of TTL is left.
// ---------------------------------------------------------------------------
pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS; // ~30 days
pub const LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS; // ~7 days

/// Extend instance storage TTL (owner, admin map, counters, config).
#[inline]
pub(crate) fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

/// Extend a single persistent storage entry by key.
#[inline]
pub(crate) fn bump_persistent<K>(env: &Env, key: &K)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    soroban_sdk::Val: soroban_sdk::TryFromVal<Env, K>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

/// LF-274: write a persistent entry and extend its TTL in one call. Every
/// persistent write must go through this helper so no key can be archived
/// while the round it belongs to is still in use.
#[inline]
pub(crate) fn set_persistent<K, V>(env: &Env, key: &K, value: &V)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

impl LyricsFlip {
    pub(crate) fn read_round(env: &Env, round_id: u64) -> Round {
        let stored: Val = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingRound));
        let map: soroban_sdk::Map<soroban_sdk::Val, soroban_sdk::Val> =
            match soroban_sdk::Map::try_from_val(env, &stored) {
                Ok(m) => m,
                Err(_) => panic_with_error!(env, Error::NonExistingRound),
            };
        let mut round = if map.len() == 10 {
            let legacy = LegacyRound::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound));
            Round::from(legacy)
        } else if map.len() == 13 {
            // Lazy upgrade of schema-v3 rounds (pre LF-162/163) to the
            // current layout: missing flags default to false.
            let v3 = RoundV3::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound));
            Round::from(v3)
        } else if map.len() == 15 {
            // Lazy upgrade of schema-v4 rounds (pre LF-291).
            let v4 = RoundV4::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound));
            Round::from(v4)
        } else {
            Round::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound))
        };
        // LF-291: migrated rounds default to the global player cap.
        if round.max_players == 0 {
            round.max_players = Self::get_max_players(env.clone());
            env.storage()
                .persistent()
                .set(&DataKey::Round(round_id), &round);
        }
        bump_persistent(env, &DataKey::Round(round_id));
        round
    }
    pub(crate) fn read_round_cards(env: &Env, round_id: u64) -> Vec<u64> {
        let cards = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCards(round_id))
            .unwrap_or(Vec::new(env));
        bump_persistent(env, &DataKey::RoundCards(round_id));
        cards
    }
    pub(crate) fn read_round_players(env: &Env, round_id: u64) -> Vec<Address> {
        let players = env
            .storage()
            .persistent()
            .get(&DataKey::RoundPlayers(round_id))
            .unwrap_or(Vec::new(env));
        bump_persistent(env, &DataKey::RoundPlayers(round_id));
        players
    }
    pub(crate) fn read_open_rounds(env: &Env) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OpenRounds)
            .unwrap_or(Vec::new(env))
    }
    pub(crate) fn remove_open_round(env: &Env, round_id: u64, admin: &Address) {
        let mut open = Self::read_open_rounds(env);
        if let Some(idx) = open.first_index_of(round_id) {
            open.remove(idx);
            env.storage().persistent().set(&DataKey::OpenRounds, &open);
            // LF-175: the round is leaving the lobby (start, cancel, or
            // expiry via cancel-after-timeout), so free the admin's slot.
            Self::dec_open_rounds_of(env, admin);
        }
    }
    /// Number of public lobby rounds `address` currently has open.
    pub(crate) fn open_rounds_of(env: &Env, address: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::OpenRoundsOf(address.clone()))
            .unwrap_or(0)
    }
    /// Reserves one of `address`'s open-lobby slots.
    pub(crate) fn inc_open_rounds_of(env: &Env, address: &Address) {
        let key = DataKey::OpenRoundsOf(address.clone());
        let count = Self::open_rounds_of(env, address) + 1;
        env.storage().persistent().set(&key, &count);
        bump_persistent(env, &key);
    }
    /// Frees one of `address`'s open-lobby slots; removes the key at zero
    /// so empty accounts leave no storage dust behind.
    pub(crate) fn dec_open_rounds_of(env: &Env, address: &Address) {
        let key = DataKey::OpenRoundsOf(address.clone());
        let count = Self::open_rounds_of(env, address);
        if count <= 1 {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &(count - 1));
            bump_persistent(env, &key);
        }
    }

    pub(crate) fn is_round_player(env: &Env, round_id: u64, player: &Address) -> bool {
        let players = Self::read_round_players(env, round_id);
        for p in players.iter() {
            if p == *player {
                return true;
            }
        }
        false
    }
    /// LF-264: true when `player` is on the round's invite allowlist (or is
    /// the round admin, who may always join their own round).
    pub(crate) fn is_round_invitee(env: &Env, round_id: u64, player: &Address) -> bool {
        let round = Self::read_round(env, round_id);
        if round.admin == *player {
            return true;
        }
        let invitees: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundInvitees(round_id))
            .unwrap_or(Vec::new(env));
        invitees.contains(player)
    }
    /// True while `card_id` belongs to a round that is still playable, i.e.
    /// neither finalized nor cancelled and not past its self-heal deadline
    /// (round deadline once started, lobby timeout before that).
    /// LF-265: true when `round_id` is a lobby (not started, not cancelled)
    /// that has been open longer than its `lobby_timeout`. Such a lobby can
    /// only be cancelled.
    pub(crate) fn is_lobby_expired(env: &Env, round_id: u64, now: u64) -> bool {
        let round = Self::read_round(env, round_id);
        if round.is_started || round.is_cancelled {
            return false;
        }
        let created_at: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::RoundCreatedAt(round_id))
            .unwrap_or(0);
        now >= created_at.saturating_add(round.lobby_timeout)
    }
    /// A round constrains its cards' answer fields until it is finalized or
    /// cancelled, or until it can no longer be played at all. Rounds whose
    /// deadline (or lobby timeout) has passed are skipped so abandoned
    /// rounds can never permanently freeze a card.
    pub(crate) fn is_round_live(env: &Env, round_id: u64) -> bool {
        if env
            .storage()
            .persistent()
            .get(&DataKey::RoundFinalized(round_id))
            .unwrap_or(false)
        {
            return false;
        }
        let round = Self::read_round(env, round_id);
        if round.is_cancelled || round.is_completed {
            return false;
        }
        let now = env.ledger().timestamp();
        if round.is_started {
            now < round.end_time
        } else {
            let created_at: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::RoundCreatedAt(round_id))
                .unwrap_or(0);
            now < created_at + round.lobby_timeout
        }
    }
    pub(crate) fn assert_round_pending(env: &Env, round: &Round) {
        if round.is_cancelled {
            panic_with_error!(env, Error::RoundCancelled);
        }
        if round.is_started {
            panic_with_error!(env, Error::RoundAlreadyStarted);
        }
    }
}
