//! Storage helpers: TTL policy, bump helpers and round/state readers.

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
        let round = if map.len() == 10 {
            let legacy = LegacyRound::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound));
            let round = Round::from(legacy);
            env.storage()
                .persistent()
                .set(&DataKey::Round(round_id), &round);
            round
        } else if map.len() == 13 {
            // Lazy upgrade of schema-v3 rounds (pre LF-162/163) to the
            // current layout: missing flags default to false.
            let v3 = RoundV3::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound));
            let round = Round::from(v3);
            env.storage()
                .persistent()
                .set(&DataKey::Round(round_id), &round);
            round
        } else {
            Round::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingRound))
        };
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

    // ---- LF-175: open-lobby cap per address ----

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
}
