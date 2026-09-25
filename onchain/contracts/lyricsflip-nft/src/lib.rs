#![no_std]

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    BytesN, Env, String,
};

/// Bumped on every release that changes the contract's code; see `upgrade`.
pub const VERSION: u32 = 1;

/// Longest `base_uri` accepted by `set_base_uri`, so `token_uri` fits in a
/// fixed buffer alongside the largest `u128` token id (39 digits).
pub const MAX_BASE_URI_LEN: u32 = 200;

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MinterUpdated {
    pub old_minter: Address,
    pub new_minter: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferStarted {
    #[topic]
    pub owner: Address,
    #[topic]
    pub pending_owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub old_owner: Address,
    #[topic]
    pub new_owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NftMinted {
    #[topic]
    pub token_id: u128,
    pub recipient: Address,
}

/// SEP-0050 `transfer` event, emitted by `transfer` and `transfer_from`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub token_id: u128,
}

/// SEP-0050 `approve` event.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approve {
    #[topic]
    pub approver: Address,
    #[topic]
    pub token_id: u128,
    pub approved: Address,
    pub live_until_ledger: u32,
}

/// SEP-0050 `approve_for_all` event. A `live_until_ledger` of 0 revokes.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApproveForAll {
    #[topic]
    pub owner: Address,
    pub operator: Address,
    pub live_until_ledger: u32,
}

/// An approval that is valid up to and including `live_until_ledger`.
#[contracttype]
#[derive(Clone)]
struct Approval {
    approved: Address,
    live_until_ledger: u32,
}

/// Ported from `onchain/src/contracts/lyricsflipNFT.cairo`. Implements the
/// SEP-0050 non-fungible interface (balance, transfer, approvals) by hand,
/// mirroring OpenZeppelin `stellar-non-fungible`'s method names and events,
/// on top of minter-gated `mint` and a monotonically increasing token id.
///
/// Clients map on the numeric values, so never renumber or reuse a code; keep
/// `onchain/README.md` and `test::error_codes_are_stable` in sync.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Defensive only: `__constructor` runs exactly once per deployment.
    AlreadyInitialized = 1,
    NotMinter = 2,
    /// Defensive only: token ids come from a monotonic counter, so a
    /// collision should never happen.
    TokenAlreadyExists = 3,
    TokenDoesNotExist = 4,
    /// `from` does not own the token.
    IncorrectOwner = 5,
    /// The spender/approver is neither the owner nor an approved operator.
    InsufficientApproval = 6,
    /// `live_until_ledger` is in the past (and not 0 for a revoke).
    InvalidLiveUntilLedger = 7,
    /// Caller is not the contract owner.
    NotOwner = 8,
    /// Caller of `accept_ownership` is not the pending owner.
    NotPendingOwner = 9,
    /// `base_uri` is longer than `MAX_BASE_URI_LEN`.
    BaseUriTooLong = 10,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
    PendingOwner,
    Minter,
    TokenName,
    TokenSymbol,
    BaseUri,
    TokenCount,
    TokenOwner(u128),
    Balance(Address),
    Approval(u128),
    ApprovalForAll((Address, Address)),
}

// ---------------------------------------------------------------------------
// LF-012 – TTL policy (mirrors lyricsflip game contract)
// ---------------------------------------------------------------------------
pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;

#[inline]
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

#[inline]
fn bump_persistent<K>(env: &Env, key: &K)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    soroban_sdk::Val: soroban_sdk::TryFromVal<Env, K>,
{
fn bump_persistent<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

#[contract]
pub struct LyricsFlipNFT;

#[contractimpl]
impl LyricsFlipNFT {
    /// Initializes the contract state.
    pub fn __constructor(
        env: Env,
        owner: Address,
        minter: Address,
        token_name: String,
        token_symbol: String,
        base_uri: String,
    ) {
        if env.storage().instance().has(&DataKey::Owner) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }
        Self::assert_base_uri_len(&env, &base_uri);
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.storage()
            .instance()
            .set(&DataKey::TokenName, &token_name);
        env.storage()
            .instance()
            .set(&DataKey::TokenSymbol, &token_symbol);
        env.storage().instance().set(&DataKey::BaseUri, &base_uri);
        env.storage().instance().set(&DataKey::TokenCount, &0u128);
        bump_instance(&env);
    }

    /// Mints a new token.
    pub fn mint(env: Env, caller: Address, recipient: Address) -> u128 {
        caller.require_auth();

        let minter: Address = env.storage().instance().get(&DataKey::Minter).unwrap();
        if caller != minter {
            panic_with_error!(env, Error::NotMinter);
        }

        let count: u128 = env
            .storage()
            .instance()
            .get(&DataKey::TokenCount)
            .unwrap_or(0);
        let token_id = count + 1;

        if env
            .storage()
            .persistent()
            .has(&DataKey::TokenOwner(token_id))
        {
            panic_with_error!(env, Error::TokenAlreadyExists);
        }

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &recipient);
        bump_persistent(&env, &DataKey::TokenOwner(token_id));

        Self::add_balance(&env, &recipient, 1);
        env.storage()
            .instance()
            .set(&DataKey::TokenCount, &token_id);
        bump_instance(&env);

        NftMinted {
            token_id,
            recipient,
        }
        .publish(&env);

        token_id
    }

    /// Returns the owner of a token.
    pub fn owner_of(env: Env, token_id: u128) -> Address {
        let owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::TokenDoesNotExist));
        bump_persistent(&env, &DataKey::TokenOwner(token_id));
        owner
    }

    /// Executes balance.
    pub fn balance(env: Env, owner: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(owner))
            .unwrap_or(0)
    }

    /// Transfers a token.
    pub fn transfer(env: Env, from: Address, to: Address, token_id: u128) {
        from.require_auth();
        Self::do_transfer(&env, &from, &to, token_id);
    }

    /// Transfers on behalf of `from` by a `spender` approved for the token
    /// or for all of `from`'s tokens.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u128) {
        spender.require_auth();
        let is_token_approved = Self::get_approved(env.clone(), token_id) == Some(spender.clone());
        if spender != from
            && !is_token_approved
            && !Self::is_approved_for_all(env.clone(), from.clone(), spender)
        {
            panic_with_error!(env, Error::InsufficientApproval);
        }
        Self::do_transfer(&env, &from, &to, token_id);
    }

    /// Approves `approved` to transfer `token_id` until `live_until_ledger`.
    /// `approver` must be the owner or an operator approved for all.
    pub fn approve(
        env: Env,
        approver: Address,
        approved: Address,
        token_id: u128,
        live_until_ledger: u32,
    ) {
        approver.require_auth();
        let owner = Self::owner_of(env.clone(), token_id);
        if approver != owner && !Self::is_approved_for_all(env.clone(), owner, approver.clone()) {
            panic_with_error!(env, Error::InsufficientApproval);
        }
        let key = DataKey::Approval(token_id);
        if live_until_ledger == 0 {
            env.storage().persistent().remove(&key);
        } else {
            Self::assert_live_until(&env, live_until_ledger);
            env.storage().persistent().set(
                &key,
                &Approval {
                    approved: approved.clone(),
                    live_until_ledger,
                },
            );
        }
        Approve {
            approver,
            token_id,
            approved,
            live_until_ledger,
        }
        .publish(&env);
    }

    /// Approves `operator` for all of `owner`'s tokens until
    /// `live_until_ledger`; 0 revokes.
    pub fn approve_for_all(env: Env, owner: Address, operator: Address, live_until_ledger: u32) {
        owner.require_auth();
        let key = DataKey::ApprovalForAll((owner.clone(), operator.clone()));
        if live_until_ledger == 0 {
            env.storage().persistent().remove(&key);
        } else {
            Self::assert_live_until(&env, live_until_ledger);
            env.storage().persistent().set(&key, &live_until_ledger);
        }
        ApproveForAll {
            owner,
            operator,
            live_until_ledger,
        }
        .publish(&env);
    }

    /// Returns the approved.
    pub fn get_approved(env: Env, token_id: u128) -> Option<Address> {
        env.storage()
            .persistent()
            .get::<_, Approval>(&DataKey::Approval(token_id))
            .filter(|a| a.live_until_ledger >= env.ledger().sequence())
            .map(|a| a.approved)
    }

    /// Returns whether approved for all.
    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, u32>(&DataKey::ApprovalForAll((owner, operator)))
            .is_some_and(|live_until| live_until >= env.ledger().sequence())
    }

    /// Executes token name.
    pub fn token_name(env: Env) -> String {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::TokenName).unwrap()
    }

    /// Executes token symbol.
    pub fn token_symbol(env: Env) -> String {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::TokenSymbol).unwrap()
    }

    /// Executes base uri.
    pub fn base_uri(env: Env) -> String {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::BaseUri).unwrap()
    }

    /// `base_uri` followed by the decimal token id.
    pub fn token_uri(env: Env, token_id: u128) -> String {
        Self::owner_of(env.clone(), token_id);
        let base = Self::base_uri(env.clone());
        let base_len = base.len() as usize;
        let mut buf = [0u8; MAX_BASE_URI_LEN as usize + 39];
        base.copy_into_slice(&mut buf[..base_len]);

        let mut digits = [0u8; 39];
        let mut n = token_id;
        let mut i = digits.len();
        loop {
            i -= 1;
            digits[i] = b'0' + (n % 10) as u8;
            n /= 10;
            if n == 0 {
                break;
            }
        }
        let len = base_len + digits.len() - i;
        buf[base_len..len].copy_from_slice(&digits[i..]);
        String::from_bytes(&env, &buf[..len])
    }

    /// Executes token count.
    pub fn token_count(env: Env) -> u128 {
        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::TokenCount)
            .unwrap_or(0)
    }

    /// Returns the current owner.
    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    /// Executes minter.
    pub fn minter(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Minter).unwrap()
    }

    /// Returns the pending owner.
    pub fn pending_owner(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingOwner)
    }

    /// Returns the contract version.
    pub fn version() -> u32 {
        VERSION
    }

    // ---- Owner-only administration ----

    /// Sets the base uri.
    pub fn set_base_uri(env: Env, caller: Address, base_uri: String) {
        Self::assert_owner(&env, &caller);
        Self::assert_base_uri_len(&env, &base_uri);
        env.storage().instance().set(&DataKey::BaseUri, &base_uri);
    }

    /// Points minting at a new minter, e.g. a redeployed game contract. The
    /// previous minter can no longer mint.
    pub fn set_minter(env: Env, caller: Address, new_minter: Address) {
        Self::assert_owner(&env, &caller);
        let old_minter = Self::minter(env.clone());
        env.storage().instance().set(&DataKey::Minter, &new_minter);
        MinterUpdated {
            old_minter,
            new_minter,
        }
        .publish(&env);
    }

    /// Step one of an ownership transfer; `new_owner` must then call
    /// `accept_ownership`. Calling again replaces the pending owner.
    pub fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
        Self::assert_owner(&env, &caller);
        env.storage()
            .instance()
            .set(&DataKey::PendingOwner, &new_owner);
        OwnershipTransferStarted {
            owner: caller,
            pending_owner: new_owner,
        }
        .publish(&env);
    }

    /// Accepts ownership.
    pub fn accept_ownership(env: Env, caller: Address) {
        caller.require_auth();
        if Self::pending_owner(env.clone()) != Some(caller.clone()) {
            panic_with_error!(env, Error::NotPendingOwner);
        }
        let old_owner = Self::owner(env.clone());
        env.storage().instance().set(&DataKey::Owner, &caller);
        env.storage().instance().remove(&DataKey::PendingOwner);
        OwnershipTransferred {
            old_owner,
            new_owner: caller,
        }
        .publish(&env);
    }

    /// Replaces this contract's code in place, keeping all storage.
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        Self::assert_owner(&env, &caller);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    fn assert_owner(env: &Env, caller: &Address) {
        caller.require_auth();
        if *caller != Self::owner(env.clone()) {
            panic_with_error!(env, Error::NotOwner);
        }
    }

    fn assert_base_uri_len(env: &Env, base_uri: &String) {
        if base_uri.len() > MAX_BASE_URI_LEN {
            panic_with_error!(env, Error::BaseUriTooLong);
        }
    }

    fn do_transfer(env: &Env, from: &Address, to: &Address, token_id: u128) {
        if Self::owner_of(env.clone(), token_id) != *from {
            panic_with_error!(env, Error::IncorrectOwner);
        }
        env.storage()
            .persistent()
            .remove(&DataKey::Approval(token_id));
        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), to);
        Self::add_balance(env, from, -1);
        Self::add_balance(env, to, 1);
        Transfer {
            from: from.clone(),
            to: to.clone(),
            token_id,
        }
        .publish(env);
    }

    fn add_balance(env: &Env, owner: &Address, delta: i32) {
        let balance = Self::balance(env.clone(), owner.clone());
        env.storage().persistent().set(
            &DataKey::Balance(owner.clone()),
            &balance.checked_add_signed(delta).unwrap(),
        );
    }

    fn assert_live_until(env: &Env, live_until_ledger: u32) {
        if live_until_ledger < env.ledger().sequence() {
            panic_with_error!(env, Error::InvalidLiveUntilLedger);
        }
    }
}

