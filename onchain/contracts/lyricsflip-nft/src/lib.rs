#![no_std]

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    BytesN, Env, String, Vec,
};

/// Bumped on every release that changes the contract's code; see `upgrade`.
pub const VERSION: u32 = 1;
/// Current persisted storage layout. Kept separate from the code version.
pub const SCHEMA_VERSION: u32 = 2;

/// Longest `base_uri` accepted by `set_base_uri`, so `token_uri` fits in a
/// fixed buffer alongside the largest `u128` token id (39 digits).
pub const MAX_BASE_URI_LEN: u32 = 200;

/// Maximum number of tokens returned by `tokens_of_owner` in a single call
/// (LF-170).
pub const MAX_TOKENS_PER_PAGE: u32 = 50;

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

/// SEP-0050 `mint` event, emitted by `mint`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mint {
    #[topic]
    pub token_id: u128,
    /// The milestone / achievement kind this token represents (LF-168).
    pub kind: u32,
    pub recipient: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paused {
    #[topic]
    pub owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unpaused {
    #[topic]
    pub owner: Address,
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

/// Event emitted when a token is burned or revoked.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Burn {
    #[topic]
    pub token_id: u128,
    pub owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    #[topic]
    pub owner: Address,
    pub new_wasm_hash: BytesN<32>,
    pub old_version: u32,
    pub new_version: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SchemaMigrated {
    #[topic]
    pub caller: Address,
    pub old_schema_version: u32,
    pub new_schema_version: u32,
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
    /// LF-169: Achievement NFTs are soulbound and cannot be transferred or
    /// approved.
    NonTransferable = 11,
    /// Balance is insufficient or missing.
    InsufficientBalance = 12,
    /// The contract is paused; the requested operation is blocked.
    Paused = 13,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
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
    /// LF-168: maps token_id → kind (u32), where kind identifies the
    /// achievement / milestone the badge represents.
    TokenKind(u128),
    /// LF-170: number of tokens currently held by an address.
    OwnerTokenCount(Address),
    /// LF-170: token_id at position `i` in the owner's index (0-based).
    OwnerTokenAt((Address, u32)),
    /// LF-170: position of token_id in the owner's index, for O(1) removal.
    OwnerTokenPosition((Address, u128)),
    Paused,
    /// LF-157: Stored storage schema version for migration hooks.
    SchemaVersion,
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
        name: String,
        symbol: String,
        base_uri: String,
    ) {
        if env.storage().instance().has(&DataKey::Owner) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }
        Self::assert_base_uri_len(&env, &base_uri);
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.storage().instance().set(&DataKey::TokenName, &name);
        env.storage().instance().set(&DataKey::TokenSymbol, &symbol);
        env.storage().instance().set(&DataKey::BaseUri, &base_uri);
        env.storage().instance().set(&DataKey::TokenCount, &0u128);
        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &SCHEMA_VERSION);
        bump_instance(&env);
    }

    // -------------------------------------------------------------------------
    // LF-168 – token kind
    // -------------------------------------------------------------------------

    /// Mints a new achievement NFT.
    ///
    /// `kind` identifies the milestone / achievement represented by this badge
    /// (e.g. `0 = FirstWin`, `1 = Streak5`, `2 = TenWins`).  The value is
    /// stored under `DataKey::TokenKind(token_id)` and exposed through
    /// `token_kind(token_id)`.  `token_uri` now returns
    /// `base_uri/{kind}.json` so every badge kind points to its own metadata
    /// file.
    pub fn mint(env: Env, caller: Address, recipient: Address, kind: u32) -> u128 {
        Self::require_not_paused(&env);
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

        // Store ownership
        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &recipient);
        bump_persistent(&env, &DataKey::TokenOwner(token_id));

        // LF-168: store which kind/milestone this token represents
        env.storage()
            .persistent()
            .set(&DataKey::TokenKind(token_id), &kind);
        bump_persistent(&env, &DataKey::TokenKind(token_id));

        // LF-170: add token to the recipient's owner index
        Self::index_add(&env, &recipient, token_id);

        Self::add_balance(&env, &recipient, 1);
        env.storage()
            .instance()
            .set(&DataKey::TokenCount, &token_id);
        bump_instance(&env);

        Mint {
            recipient,
            token_id,
            kind,
        }
        .publish(&env);

        token_id
    }

    /// Returns the kind (milestone / achievement type) for a token (LF-168).
    pub fn token_kind(env: Env, token_id: u128) -> u32 {
        // Ensure the token exists first.
        Self::owner_of(env.clone(), token_id);
        let kind = env
            .storage()
            .persistent()
            .get(&DataKey::TokenKind(token_id))
            .unwrap_or(0);
        bump_persistent(&env, &DataKey::TokenKind(token_id));
        kind
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
        let key = DataKey::Balance(owner);
        let balance = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(0);
        if env.storage().persistent().has(&key) {
            bump_persistent(&env, &key);
        }
        balance
    }

    // -------------------------------------------------------------------------
    // LF-169 – soulbound: transfer / approve operations are blocked
    // -------------------------------------------------------------------------
    //
    // Achievement NFTs are soulbound: once minted they cannot be transferred,
    // approved, or delegated.  Calling any of these functions panics with
    // `Error::NonTransferable` (code 11).  This prevents the "top players"
    // leaderboard from being gamed by buying badges on a secondary market.
    //
    // ADR: We choose "all soulbound" (rather than configurable-per-kind or
    // fully-transferable) because:
    //  1. Every token in this contract is an on-chain achievement badge.
    //  2. Making soulbound the default is the simplest invariant to reason
    //     about and test.
    //  3. A future contract upgrade can introduce a separate, transferable
    //     collectible contract if collectibles are needed.
    // -------------------------------------------------------------------------

    /// Always panics with `NonTransferable` (LF-169).
    pub fn transfer(_env: Env, _from: Address, _to: Address, _token_id: u128) {
        panic_with_error!(_env, Error::NonTransferable);
    }

    /// Always panics with `NonTransferable` (LF-169).
    pub fn transfer_from(
        _env: Env,
        _spender: Address,
        _from: Address,
        _to: Address,
        _token_id: u128,
    ) {
        panic_with_error!(_env, Error::NonTransferable);
    }



    /// Burns `token_id` owned by `owner`. The caller must authenticate as `owner`.
    pub fn burn(env: Env, owner: Address, token_id: u128) {
        owner.require_auth();
        Self::do_burn(&env, &owner, token_id);
    }

    /// Burns `token_id` owned by `owner` on behalf of `owner`.
    /// The caller must authenticate as `spender`. Spender must be `owner`,
    /// the contract owner (allowing badge revocation), an approved spender
    /// for the token, or an approved operator for all of `owner`'s tokens.
    pub fn burn_from(env: Env, spender: Address, owner: Address, token_id: u128) {
        spender.require_auth();
        let contract_owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        let is_contract_owner = spender == contract_owner;
        let is_token_approved = Self::get_approved(env.clone(), token_id) == Some(spender.clone());
        let is_approved_for_all =
            Self::is_approved_for_all(env.clone(), owner.clone(), spender.clone());

        if spender != owner && !is_contract_owner && !is_token_approved && !is_approved_for_all {
            panic_with_error!(env, Error::InsufficientApproval);
        }

        Self::do_burn(&env, &owner, token_id);
    }

    /// Approves `approved` to transfer `token_id` until `live_until_ledger`.
    /// `approver` must be the owner or an operator approved for all.
    pub fn approve(
        _env: Env,
        _approver: Address,
        _approved: Address,
        _token_id: u128,
        _live_until_ledger: u32,
    ) {
        panic_with_error!(_env, Error::NonTransferable);
    }

    /// Always panics with `NonTransferable` (LF-169).
    pub fn approve_for_all(_env: Env, _owner: Address, _operator: Address, _live_until_ledger: u32) {
        panic_with_error!(_env, Error::NonTransferable);
    }

    /// Returns the approved address for a token, always `None` because
    /// approvals are disabled (LF-169).
    pub fn get_approved(_env: Env, _token_id: u128) -> Option<Address> {
        None
    }

    /// Returns `false` because operator approvals are disabled (LF-169).
    pub fn is_approved_for_all(_env: Env, _owner: Address, _operator: Address) -> bool {
        false
    }

    /// Returns the token collection name.
    pub fn name(env: Env) -> String {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::TokenName).unwrap()
    }

    /// Returns the token collection symbol.
    pub fn symbol(env: Env) -> String {
        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::TokenSymbol)
            .unwrap()
    }

    /// Executes base uri.
    pub fn base_uri(env: Env) -> String {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::BaseUri).unwrap()
    }

    // -------------------------------------------------------------------------
    // LF-168 – token_uri: base_uri/{kind}.json
    // -------------------------------------------------------------------------

    /// Returns the metadata URI for a token.
    ///
    /// Format: `<base_uri><kind>.json`
    ///
    /// This allows every achievement kind to have its own artwork and
    /// description served from a single base URI without an off-chain id→kind
    /// mapping.  Example: `https://assets.lyricsflip.io/nft/0.json`.
    pub fn token_uri(env: Env, token_id: u128) -> String {
        // Ensure token exists and fetch its kind.
        let owner_key = DataKey::TokenOwner(token_id);
        if !env.storage().persistent().has(&owner_key) {
            panic_with_error!(env, Error::TokenDoesNotExist);
        }
        let kind: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::TokenKind(token_id))
            .unwrap_or(0);

        let base = Self::base_uri(env.clone());
        let base_len = base.len() as usize;

        // Buffer: base_uri (≤200) + kind digits (≤10) + ".json" (5) = ≤215
        let mut buf = [0u8; MAX_BASE_URI_LEN as usize + 16];
        base.copy_into_slice(&mut buf[..base_len]);

        // Write kind as decimal digits
        let mut digits = [0u8; 10]; // u32 max is 4294967295 (10 digits)
        let mut n = kind;
        let mut i = digits.len();
        loop {
            i -= 1;
            digits[i] = b'0' + (n % 10) as u8;
            n /= 10;
            if n == 0 {
                break;
            }
        }
        let kind_len = digits.len() - i;
        let after_base = base_len;
        buf[after_base..after_base + kind_len].copy_from_slice(&digits[i..]);

        // Append ".json"
        let suffix = b".json";
        let after_kind = after_base + kind_len;
        buf[after_kind..after_kind + 5].copy_from_slice(suffix);

        let total = after_kind + 5;
        String::from_bytes(&env, &buf[..total])
    }

    /// Executes token count.
    pub fn token_count(env: Env) -> u128 {
        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::TokenCount)
            .unwrap_or(0)
    }

    // -------------------------------------------------------------------------
    // LF-170 – per-owner token index
    // -------------------------------------------------------------------------

    /// Returns up to `limit` token ids held by `owner`, starting at index
    /// `start` (0-based).
    ///
    /// A single call replaces the O(N) loop of `owner_of(1..token_count)` that
    /// the old frontend used.  `limit` is clamped to `MAX_TOKENS_PER_PAGE`
    /// (50).
    pub fn tokens_of_owner(env: Env, owner: Address, start: u32, limit: u32) -> Vec<u128> {
        let count = Self::owner_token_count(&env, &owner);
        let limit = limit.min(MAX_TOKENS_PER_PAGE);
        let mut result: Vec<u128> = Vec::new(&env);
        let end = (start + limit).min(count);
        let mut i = start;
        while i < end {
            let key = DataKey::OwnerTokenAt((owner.clone(), i));
            if let Some(tid) = env.storage().persistent().get::<_, u128>(&key) {
                result.push_back(tid);
            }
            i += 1;
        }
        result
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

    /// Returns the stored storage schema version. Unmigrated / legacy deployments default to 1.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SchemaVersion)
            .unwrap_or(1)
    }

    /// Returns whether the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
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
        let old_version = Self::version();
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
        ContractUpgraded {
            owner: caller,
            new_wasm_hash,
            old_version,
            new_version: old_version,
        }
        .publish(&env);
    }

    /// Owner-only. Migrates stored state step-by-step from the stored
    /// schema version up to `SCHEMA_VERSION`. Strictly idempotent: calling it
    /// multiple times after migration is a no-op.
    pub fn migrate(env: Env, caller: Address) {
        Self::assert_owner(&env, &caller);

        let stored_version = Self::schema_version(env.clone());
        if stored_version >= SCHEMA_VERSION {
            return;
        }

        let mut current_version = stored_version;
        while current_version < SCHEMA_VERSION {
            match current_version {
                1 => {
                    current_version = 2;
                }
                _ => break,
            }
        }

        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &current_version);
        bump_instance(&env);

        SchemaMigrated {
            caller,
            old_schema_version: stored_version,
            new_schema_version: current_version,
        }
        .publish(&env);
    }

    // ---- Private helpers ----
    /// Pauses the contract, blocking `mint`, `transfer` and `transfer_from`.
    /// Refund/cancel-style paths stay open so funds can always leave.
    pub fn pause(env: Env, caller: Address) {
        Self::assert_owner(&env, &caller);
        env.storage().instance().set(&DataKey::Paused, &true);
        Paused { owner: caller }.publish(&env);
    }

    /// Unpauses the contract, re-enabling paused operations.
    pub fn unpause(env: Env, caller: Address) {
        Self::assert_owner(&env, &caller);
        env.storage().instance().set(&DataKey::Paused, &false);
        Unpaused { owner: caller }.publish(&env);
    }

    fn assert_owner(env: &Env, caller: &Address) {
        caller.require_auth();
        if *caller != Self::owner(env.clone()) {
            panic_with_error!(env, Error::NotOwner);
        }
    }

    fn require_not_paused(env: &Env) {
        if Self::is_paused(env.clone()) {
            panic_with_error!(env, Error::Paused);
        }
    }

    fn assert_base_uri_len(env: &Env, base_uri: &String) {
        if base_uri.len() > MAX_BASE_URI_LEN {
            panic_with_error!(env, Error::BaseUriTooLong);
        }
    }

    /// `do_transfer` is intentionally kept as a private helper because the
    /// public `transfer` / `transfer_from` entry points are disabled (LF-169).
    /// It is still used internally by the LF-170 index helpers for swap-remove
    /// on logical removals, which do not actually change `TokenOwner` — they
    /// only update the in-memory index.  The function is therefore only called
    /// from `index_remove` in the future if transfers were ever re-enabled.
    /// Currently it is unreachable from any public path, but is kept to avoid
    /// a dead-code warning suppression in the index helpers.
    #[allow(dead_code)]
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

        // LF-170: update owner indexes
        Self::index_remove(env, from, token_id);
        Self::index_add(env, to, token_id);

        bump_persistent(env, &DataKey::TokenOwner(token_id));
        Self::add_balance(env, from, -1);
        Self::add_balance(env, to, 1);
        Transfer {
            from: from.clone(),
            to: to.clone(),
            token_id,
        }
        .publish(env);
    }

    fn do_burn(env: &Env, owner: &Address, token_id: u128) {
        let current_owner = Self::owner_of(env.clone(), token_id);
        if current_owner != *owner {
            panic_with_error!(env, Error::IncorrectOwner);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::Approval(token_id));
        env.storage()
            .persistent()
            .remove(&DataKey::TokenOwner(token_id));
        Self::add_balance(env, owner, -1);

        Burn {
            token_id,
            owner: owner.clone(),
        }
        .publish(env);
    }

    fn add_balance(env: &Env, owner: &Address, delta: i32) {
        let key = DataKey::Balance(owner.clone());
        let balance = Self::balance(env.clone(), owner.clone());
        let new_balance = balance
            .checked_add_signed(delta)
            .unwrap_or_else(|| panic_with_error!(env, Error::InsufficientBalance));
        env.storage().persistent().set(&key, &new_balance);
        bump_persistent(env, &key);
    }

    #[allow(dead_code)]
    fn assert_live_until(env: &Env, live_until_ledger: u32) {
        if live_until_ledger < env.ledger().sequence() {
            panic_with_error!(env, Error::InvalidLiveUntilLedger);
        }
    }

    // -------------------------------------------------------------------------
    // LF-170 – owner index helpers
    //
    // The index stores:
    //   OwnerTokenCount(owner)        → u32  (how many tokens this address holds)
    //   OwnerTokenAt((owner, i))      → u128 (token_id at position i, 0-based)
    //   OwnerTokenPosition((owner, token_id)) → u32 (position of token_id)
    //
    // Insertion:  append to the end (position = count; count++).
    // Removal:    swap-remove — move the last entry into the removed slot,
    //             delete the last slot, decrement count.  This keeps the index
    //             dense and the swap is O(1).
    // -------------------------------------------------------------------------

    fn owner_token_count(env: &Env, owner: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerTokenCount(owner.clone()))
            .unwrap_or(0)
    }

    /// Appends `token_id` to `owner`'s token index.
    fn index_add(env: &Env, owner: &Address, token_id: u128) {
        let count = Self::owner_token_count(env, owner);
        let pos = count;

        env.storage().persistent().set(
            &DataKey::OwnerTokenAt((owner.clone(), pos)),
            &token_id,
        );
        bump_persistent(env, &DataKey::OwnerTokenAt((owner.clone(), pos)));

        env.storage().persistent().set(
            &DataKey::OwnerTokenPosition((owner.clone(), token_id)),
            &pos,
        );
        bump_persistent(
            env,
            &DataKey::OwnerTokenPosition((owner.clone(), token_id)),
        );

        env.storage().persistent().set(
            &DataKey::OwnerTokenCount(owner.clone()),
            &(count + 1),
        );
        bump_persistent(env, &DataKey::OwnerTokenCount(owner.clone()));
    }

    /// Removes `token_id` from `owner`'s token index using swap-remove.
    fn index_remove(env: &Env, owner: &Address, token_id: u128) {
        let count = Self::owner_token_count(env, owner);
        if count == 0 {
            return;
        }

        let pos_key = DataKey::OwnerTokenPosition((owner.clone(), token_id));
        let pos: u32 = match env.storage().persistent().get(&pos_key) {
            Some(p) => p,
            None => return, // not in index, nothing to do
        };

        let last_index = count - 1;

        if pos != last_index {
            // Move the last token into the vacated slot
            let last_key = DataKey::OwnerTokenAt((owner.clone(), last_index));
            let last_token_id: u128 = env.storage().persistent().get(&last_key).unwrap();

            env.storage().persistent().set(
                &DataKey::OwnerTokenAt((owner.clone(), pos)),
                &last_token_id,
            );
            bump_persistent(env, &DataKey::OwnerTokenAt((owner.clone(), pos)));

            env.storage().persistent().set(
                &DataKey::OwnerTokenPosition((owner.clone(), last_token_id)),
                &pos,
            );
            bump_persistent(
                env,
                &DataKey::OwnerTokenPosition((owner.clone(), last_token_id)),
            );
        }

        // Remove the last slot (now a duplicate or the only entry)
        env.storage()
            .persistent()
            .remove(&DataKey::OwnerTokenAt((owner.clone(), last_index)));
        env.storage().persistent().remove(&pos_key);
        env.storage().persistent().set(
            &DataKey::OwnerTokenCount(owner.clone()),
            &last_index,
        );
        bump_persistent(env, &DataKey::OwnerTokenCount(owner.clone()));
    }
}
