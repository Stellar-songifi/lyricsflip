use crate::*;

impl LyricsFlip {
    pub(crate) fn read_admins(env: &Env) -> Vec<Address> {
        if let Some(admins) = env.storage().persistent().get(&DataKey::Admins) {
            bump_persistent(env, &DataKey::Admins);
            admins
        } else {
            Vec::new(env)
        }
    }

    /// Panics with `Error::Paused` when the emergency pause is active.
    pub(crate) fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, Error::Paused);
        }
    }

    pub(crate) fn assert_owner(env: &Env, address: &Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        if *address != owner {
            panic_with_error!(env, Error::NotAuthorized);
        }
    }

    pub(crate) fn assert_admin(env: &Env, address: &Address) {
        if !Self::is_admin(env.clone(), Role::Admin, address.clone()) {
            panic_with_error!(env, Error::NotAuthorized);
        }
    }
}

pub(crate) fn __constructor(env: Env, owner: Address) {
    if env.storage().instance().has(&DataKey::Owner) {
        panic_with_error!(env, Error::AlreadyInitialized);
    }
    env.storage().instance().set(&DataKey::Owner, &owner);
    // LF-156: Store admins in persistent storage, not instance storage.
    set_persistent(&env, &DataKey::Admin(owner.clone()), &true);

    let mut admins = Vec::new(&env);
    admins.push_back(owner);
    set_persistent(&env, &DataKey::Admins, &admins);

    env.storage().instance().set(&DataKey::Paused, &false);
    env.storage()
        .instance()
        .set(&DataKey::SchemaVersion, &SCHEMA_VERSION);
    bump_instance(&env);
}

pub(crate) fn get_max_players(env: Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::MaxPlayers)
        .unwrap_or(DEFAULT_MAX_PLAYERS)
}

pub(crate) fn get_nft_contract(env: Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::NftContract)
}

pub(crate) fn get_cards_per_round(env: Env) -> u32 {
    bump_instance(&env);
    env.storage()
        .instance()
        .get(&DataKey::CardsPerRound)
        .unwrap_or(0)
}

pub(crate) fn get_answer_window(env: Env) -> u64 {
    bump_instance(&env);
    env.storage()
        .instance()
        .get(&DataKey::AnswerWindow)
        .unwrap_or(CARD_ANSWER_WINDOW_SECONDS)
}

pub(crate) fn get_lobby_timeout(env: Env) -> u64 {
    bump_instance(&env);
    env.storage()
        .instance()
        .get(&DataKey::LobbyTimeout)
        .unwrap_or(LOBBY_TIMEOUT_SECONDS)
}

pub(crate) fn get_round_duration(env: Env) -> Option<u64> {
    bump_instance(&env);
    env.storage().instance().get(&DataKey::RoundDuration)
}

pub(crate) fn get_round_buffer(env: Env) -> u64 {
    bump_instance(&env);
    env.storage()
        .instance()
        .get(&DataKey::RoundBuffer)
        .unwrap_or(DEFAULT_ROUND_BUFFER_SECONDS)
}

pub(crate) fn is_paused(env: Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

pub(crate) fn is_admin(env: Env, role: Role, address: Address) -> bool {
    let Role::Admin = role;
    if env
        .storage()
        .persistent()
        .get(&DataKey::Admin(address.clone()))
        .unwrap_or(false)
    {
        bump_persistent(&env, &DataKey::Admin(address));
        return true;
    }

    // Lazy migration for legacy unmigrated instance entries (LF-156)
    if let Some(is_enabled) = env
        .storage()
        .instance()
        .get::<_, bool>(&DataKey::Admin(address.clone()))
    {
        env.storage()
            .instance()
            .remove(&DataKey::Admin(address.clone()));
        if is_enabled {
            set_persistent(&env, &DataKey::Admin(address.clone()), &true);

            let mut admins = LyricsFlip::read_admins(&env);
            let mut found = false;
            for i in 0..admins.len() {
                if admins.get(i).unwrap() == address {
                    found = true;
                    break;
                }
            }
            if !found {
                admins.push_back(address);
                set_persistent(&env, &DataKey::Admins, &admins);
            }
            return true;
        }
    }

    false
}

pub(crate) fn get_admins(env: Env) -> Vec<Address> {
    LyricsFlip::read_admins(&env)
}

pub(crate) fn migrate_legacy_admins(env: Env, caller: Address, candidates: Vec<Address>) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);

    let mut admins = LyricsFlip::read_admins(&env);
    let mut index_changed = false;
    for address in candidates.iter() {
        let key = DataKey::Admin(address.clone());
        if let Some(enabled) = env.storage().instance().get::<_, bool>(&key) {
            env.storage().instance().remove(&key);
            RoleUpdated {
                account: address.clone(),
                role: Role::Admin,
                enabled,
            }
            .publish(&env);
            if enabled {
                set_persistent(&env, &key, &true);
                let mut found = false;
                for i in 0..admins.len() {
                    if admins.get(i).unwrap() == address {
                        found = true;
                        break;
                    }
                }
                if !found {
                    admins.push_back(address);
                    index_changed = true;
                }
            } else {
                env.storage().persistent().remove(&key);
                let mut remaining = Vec::new(&env);
                for existing in admins.iter() {
                    if existing != address {
                        remaining.push_back(existing);
                    } else {
                        index_changed = true;
                    }
                }
                admins = remaining;
            }
        }
    }

    if index_changed {
        set_persistent(&env, &DataKey::Admins, &admins);
    }
}

pub(crate) fn pause(env: Env, caller: Address) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    env.storage().instance().set(&DataKey::Paused, &true);
    bump_instance(&env);
    Paused {
        owner: caller.clone(),
    }
    .publish(&env);
}

pub(crate) fn unpause(env: Env, caller: Address) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    env.storage().instance().set(&DataKey::Paused, &false);
    bump_instance(&env);
    Unpaused {
        owner: caller.clone(),
    }
    .publish(&env);
}

pub(crate) fn set_cards_per_round(env: Env, caller: Address, value: u32) {
    caller.require_auth();
    LyricsFlip::assert_admin(&env, &caller);
    if value == 0 || value > MAX_CARDS_PER_ROUND {
        panic_with_error!(env, Error::InvalidCardsPerRound);
    }
    env.storage()
        .instance()
        .set(&DataKey::CardsPerRound, &value);
    bump_instance(&env);
    CardsPerRoundUpdated { value }.publish(&env);
}

pub(crate) fn set_role(env: Env, caller: Address, recipient: Address, role: Role, is_enable: bool) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    let Role::Admin = role;

    // Clean up any legacy instance entry to keep instance storage lean (LF-156)
    env.storage()
        .instance()
        .remove(&DataKey::Admin(recipient.clone()));

    let mut admins = LyricsFlip::read_admins(&env);

    if is_enable {
        set_persistent(&env, &DataKey::Admin(recipient.clone()), &true);

        let mut found = false;
        for i in 0..admins.len() {
            if admins.get(i).unwrap() == recipient {
                found = true;
                break;
            }
        }
        if !found {
            admins.push_back(recipient.clone());
            set_persistent(&env, &DataKey::Admins, &admins);
        }
    } else {
        // LF-156: On revoke, remove the entry instead of writing false
        env.storage()
            .persistent()
            .remove(&DataKey::Admin(recipient.clone()));

        let mut new_admins = Vec::new(&env);
        for i in 0..admins.len() {
            let a = admins.get(i).unwrap();
            if a != recipient {
                new_admins.push_back(a);
            }
        }
        set_persistent(&env, &DataKey::Admins, &new_admins);
    }

    RoleUpdated {
        account: recipient,
        role,
        enabled: is_enable,
    }
    .publish(&env);
}

pub(crate) fn owner(env: Env) -> Address {
    env.storage().instance().get(&DataKey::Owner).unwrap()
}

pub(crate) fn pending_owner(env: Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingOwner)
}

pub(crate) fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    env.storage()
        .instance()
        .set(&DataKey::PendingOwner, &new_owner);
    OwnershipTransferStarted {
        owner: caller,
        pending_owner: new_owner,
    }
    .publish(&env);
}

pub(crate) fn accept_ownership(env: Env, caller: Address) {
    caller.require_auth();
    if LyricsFlip::pending_owner(env.clone()) != Some(caller.clone()) {
        panic_with_error!(env, Error::NotPendingOwner);
    }
    let old_owner = LyricsFlip::owner(env.clone());
    env.storage().instance().set(&DataKey::Owner, &caller);
    env.storage().instance().remove(&DataKey::PendingOwner);
    // LF-156: Clean up legacy instance entry and store admin in persistent storage
    env.storage()
        .instance()
        .remove(&DataKey::Admin(caller.clone()));
    set_persistent(&env, &DataKey::Admin(caller.clone()), &true);

    let mut admins = LyricsFlip::read_admins(&env);
    let mut found = false;
    for i in 0..admins.len() {
        if admins.get(i).unwrap() == caller {
            found = true;
            break;
        }
    }
    if !found {
        admins.push_back(caller.clone());
        set_persistent(&env, &DataKey::Admins, &admins);
    }

    OwnershipTransferred {
        old_owner,
        new_owner: caller,
    }
    .publish(&env);
}

pub(crate) fn set_max_players(env: Env, caller: Address, value: u32) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    if value < 2 {
        panic_with_error!(env, Error::InvalidMaxPlayers);
    }
    if value > MAX_ROUND_PLAYERS {
        panic_with_error!(env, Error::MaxPlayersTooHigh);
    }
    let old = LyricsFlip::get_max_players(env.clone());
    env.storage().instance().set(&DataKey::MaxPlayers, &value);
    MaxPlayersUpdated { old, new: value }.publish(&env);
}

pub(crate) fn set_escrow_contract(env: Env, caller: Address, escrow: Address) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    env.storage()
        .instance()
        .set(&DataKey::EscrowContract, &escrow);
    EscrowContractUpdated {
        owner: caller,
        escrow,
    }
    .publish(&env);
}

pub(crate) fn set_nft_contract(env: Env, caller: Address, nft_contract: Address) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    let old = LyricsFlip::get_nft_contract(env.clone());
    env.storage()
        .instance()
        .set(&DataKey::NftContract, &nft_contract);
    NftContractUpdated {
        old,
        new: nft_contract,
    }
    .publish(&env);
}

pub(crate) fn set_answer_window(env: Env, caller: Address, value: u64) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    if !(MIN_ANSWER_WINDOW_SECONDS..=MAX_ANSWER_WINDOW_SECONDS).contains(&value) {
        panic_with_error!(env, Error::InvalidAnswerWindow);
    }
    env.storage().instance().set(&DataKey::AnswerWindow, &value);
    bump_instance(&env);
    AnswerWindowUpdated { value }.publish(&env);
}

pub(crate) fn set_lobby_timeout(env: Env, caller: Address, value: u64) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    if !(MIN_LOBBY_TIMEOUT_SECONDS..=MAX_LOBBY_TIMEOUT_SECONDS).contains(&value) {
        panic_with_error!(env, Error::InvalidLobbyTimeout);
    }
    env.storage().instance().set(&DataKey::LobbyTimeout, &value);
    bump_instance(&env);
    LobbyTimeoutUpdated { value }.publish(&env);
}

pub(crate) fn set_round_duration(env: Env, caller: Address, value: Option<u64>) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    match value {
        Some(v) if v > 0 => {
            if !(MIN_ROUND_DURATION_SECONDS..=MAX_ROUND_DURATION_SECONDS).contains(&v) {
                panic_with_error!(env, Error::InvalidRoundDuration);
            }
            env.storage().instance().set(&DataKey::RoundDuration, &v);
            bump_instance(&env);
            RoundDurationUpdated { value: v }.publish(&env);
        }
        _ => {
            env.storage().instance().remove(&DataKey::RoundDuration);
            bump_instance(&env);
            RoundDurationUpdated { value: 0 }.publish(&env);
        }
    }
}

pub(crate) fn set_round_buffer(env: Env, caller: Address, value: u64) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    if !(MIN_ROUND_BUFFER_SECONDS..=MAX_ROUND_BUFFER_SECONDS).contains(&value) {
        panic_with_error!(env, Error::InvalidRoundDuration);
    }
    env.storage().instance().set(&DataKey::RoundBuffer, &value);
    bump_instance(&env);
    RoundBufferUpdated { value }.publish(&env);
}
