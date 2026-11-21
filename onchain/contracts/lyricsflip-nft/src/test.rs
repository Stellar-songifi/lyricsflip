//! Behaviour-coverage tests for the LyricsFlip NFT contract.
//!
//! Tests are organised in sections that match the issues resolved:
//!   LF-168 – token kind (mint kind param, token_kind view, token_uri)
//!   LF-169 – soulbound (transfer / approve / approve_for_all all panic)
//!   LF-170 – per-owner token index (tokens_of_owner, swap-remove on transfer)
//!   LF-172 – burn and burn_from
//!   LF-173 – pause and unpause
//!
//! All tests were ported from / extend the original test suite that covered
//! minter-gated minting, token id increments and ownership lookups.

use crate::{Error, LyricsFlipNFT, LyricsFlipNFTClient};
use soroban_sdk::{testutils::Address as _, testutils::Events as _, Address, Env, String};

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

/// Default `kind` value used when a test doesn't care about the kind.
const DEFAULT_KIND: u32 = 0;

fn setup<'a>() -> (Env, LyricsFlipNFTClient<'a>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let owner = Address::generate(&env);
    let minter = Address::generate(&env);
    let contract_id = env.register(
        LyricsFlipNFT,
        (
            owner.clone(),
            minter.clone(),
            String::from_str(&env, "LyricsFlip"),
            String::from_str(&env, "LFLIP"),
            String::from_str(&env, "https://example.com/metadata/"),
        ),
    );
    let client = LyricsFlipNFTClient::new(&env, &contract_id);
    (env, client, owner, minter)
}

// ---------------------------------------------------------------------------
// Original minting & ownership tests (updated for new `kind` parameter)
// ---------------------------------------------------------------------------

#[test]
fn mint_by_minter_succeeds_and_sets_owner() {
    let (env, client, _owner, minter) = setup();
    let recipient = Address::generate(&env);

    let token_id = client.mint(&minter, &recipient, &DEFAULT_KIND);
    assert_eq!(token_id, 1);
    assert_eq!(client.owner_of(&token_id), recipient);
}

#[test]
fn mint_by_non_minter_fails() {
    let (env, client, owner, _minter) = setup();
    let recipient = Address::generate(&env);

    let result = client.try_mint(&owner, &recipient, &DEFAULT_KIND);
    assert!(result.is_err(), "only the configured minter may mint");
}

#[test]
fn token_ids_increment_across_mints() {
    let (env, client, _owner, minter) = setup();
    let recipient_a = Address::generate(&env);
    let recipient_b = Address::generate(&env);

    let first = client.mint(&minter, &recipient_a, &DEFAULT_KIND);
    let second = client.mint(&minter, &recipient_b, &DEFAULT_KIND);

    assert_eq!(first, 1);
    assert_eq!(second, 2);
    assert_eq!(client.owner_of(&first), recipient_a);
    assert_eq!(client.owner_of(&second), recipient_b);
}

#[test]
fn owner_of_unminted_token_fails() {
    let (_env, client, _owner, _minter) = setup();
    let result = client.try_owner_of(&999u128);
    assert!(result.is_err());
}

/// Clients map on these numeric codes; renumbering any of them is a breaking
/// change. Update `onchain/README.md` and `frontend/src/lib/stellar/errors.ts`
/// together with this test.
#[test]
fn error_codes_are_stable() {
    let expected = [
        (Error::AlreadyInitialized, 1),
        (Error::NotMinter, 2),
        (Error::TokenAlreadyExists, 3),
        (Error::TokenDoesNotExist, 4),
        (Error::IncorrectOwner, 5),
        (Error::InsufficientApproval, 6),
        (Error::InvalidLiveUntilLedger, 7),
        (Error::NotOwner, 8),
        (Error::NotPendingOwner, 9),
        (Error::BaseUriTooLong, 10),
        (Error::NonTransferable, 11),
        (Error::InsufficientBalance, 12),
        (Error::Paused, 13),
    ];
    for (variant, code) in expected {
        assert_eq!(variant as u32, code, "{:?} was renumbered", variant);
    }
}

// ---------------------------------------------------------------------------
// LF-012 – TTL survival
// ---------------------------------------------------------------------------

#[test]
fn ttl_survival_token_owner_survives_ledger_advance() {
    use soroban_sdk::testutils::Ledger as _;

    let (env, client, _owner, minter) = setup();
    let recipient = Address::generate(&env);

    let token_id = client.mint(&minter, &recipient, &DEFAULT_KIND);
    assert_eq!(token_id, 1);

    env.ledger().set_sequence_number(100_000);

    let owner_after = client.owner_of(&token_id);
    assert_eq!(
        owner_after, recipient,
        "token owner should still be readable after ledger advance"
    );
}

// ---------------------------------------------------------------------------
// LF-168 – token kind
// ---------------------------------------------------------------------------

#[test]
fn mint_stores_kind_and_token_kind_view_returns_it() {
    let (env, client, _owner, minter) = setup();
    let recipient = Address::generate(&env);

    // Mint with FirstWin (0)
    let t1 = client.mint(&minter, &recipient, &0u32);
    assert_eq!(client.token_kind(&t1), 0u32);

    // Mint with Streak5 (1)
    let t2 = client.mint(&minter, &recipient, &1u32);
    assert_eq!(client.token_kind(&t2), 1u32);

    // Mint with TenWins (2)
    let t3 = client.mint(&minter, &recipient, &2u32);
    assert_eq!(client.token_kind(&t3), 2u32);
}

#[test]
fn token_kind_for_unminted_token_fails() {
    let (_env, client, _owner, _minter) = setup();
    let result = client.try_token_kind(&999u128);
    assert!(result.is_err(), "token_kind on unminted token should fail");
}

#[test]
fn token_uri_uses_kind_not_token_id() {
    let (env, client, _owner, minter) = setup();
    let recipient = Address::generate(&env);

    // kind = 1
    let token_id = client.mint(&minter, &recipient, &1u32);
    assert_eq!(
        client.token_uri(&token_id),
        String::from_str(&env, "https://example.com/metadata/1.json"),
        "token_uri should be base_uri/kind.json"
    );
}

#[test]
fn token_uri_for_kind_zero() {
    let (env, client, _owner, minter) = setup();
    let recipient = Address::generate(&env);

    let token_id = client.mint(&minter, &recipient, &0u32);
    assert_eq!(
        client.token_uri(&token_id),
        String::from_str(&env, "https://example.com/metadata/0.json")
    );
}

#[test]
fn two_tokens_same_kind_same_uri() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let t1 = client.mint(&minter, &alice, &0u32);
    let t2 = client.mint(&minter, &bob, &0u32);
    // Both tokens have kind 0, so both URIs must be identical.
    assert_eq!(client.token_uri(&t1), client.token_uri(&t2));
}

#[test]
fn token_uri_of_missing_token_fails() {
    let (_env, client, _owner, _minter) = setup();
    assert_eq!(
        client.try_token_uri(&1),
        Err(Ok(Error::TokenDoesNotExist.into()))
    );
}

#[test]
fn owner_can_set_base_uri_and_non_owner_cannot() {
    let (env, client, owner, minter) = setup();
    let recipient = Address::generate(&env);
    client.mint(&minter, &recipient, &0u32);

    let new_uri = String::from_str(&env, "ipfs://cid/");
    assert_eq!(
        client.try_set_base_uri(&minter, &new_uri),
        Err(Ok(Error::NotOwner.into()))
    );
    client.set_base_uri(&owner, &new_uri);
    // After base_uri change, token_uri is new_uri + kind + ".json"
    assert_eq!(
        client.token_uri(&1),
        String::from_str(&env, "ipfs://cid/0.json")
    );
}

// ---------------------------------------------------------------------------
// LF-169 – soulbound: transfer, approve, approve_for_all all panic
// ---------------------------------------------------------------------------

#[test]
fn transfer_panics_with_non_transferable() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_id = client.mint(&minter, &alice, &DEFAULT_KIND);

    let result = client.try_transfer(&alice, &bob, &token_id);
    assert_eq!(
        result,
        Err(Ok(Error::NonTransferable.into())),
        "transfer must panic NonTransferable"
    );
    // Ownership unchanged
    assert_eq!(client.owner_of(&token_id), alice);
}

#[test]
fn transfer_from_panics_with_non_transferable() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let spender = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_id = client.mint(&minter, &alice, &DEFAULT_KIND);

    let result = client.try_transfer_from(&spender, &alice, &bob, &token_id);
    assert_eq!(
        result,
        Err(Ok(Error::NonTransferable.into())),
        "transfer_from must panic NonTransferable"
    );
    assert_eq!(client.owner_of(&token_id), alice);
}

#[test]
fn approve_panics_with_non_transferable() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let spender = Address::generate(&env);
    let token_id = client.mint(&minter, &alice, &DEFAULT_KIND);

    let result = client.try_approve(&alice, &spender, &token_id, &1000);
    assert_eq!(
        result,
        Err(Ok(Error::NonTransferable.into())),
        "approve must panic NonTransferable"
    );
}

#[test]
fn approve_for_all_panics_with_non_transferable() {
    let (env, client, _owner, _minter) = setup();
    let alice = Address::generate(&env);
    let operator = Address::generate(&env);

    let result = client.try_approve_for_all(&alice, &operator, &1000);
    assert_eq!(
        result,
        Err(Ok(Error::NonTransferable.into())),
        "approve_for_all must panic NonTransferable"
    );
}

#[test]
fn get_approved_always_returns_none() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let token_id = client.mint(&minter, &alice, &DEFAULT_KIND);

    assert_eq!(client.get_approved(&token_id), None);
}

#[test]
fn is_approved_for_all_always_returns_false() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let operator = Address::generate(&env);
    client.mint(&minter, &alice, &DEFAULT_KIND);

    assert!(!client.is_approved_for_all(&alice, &operator));
}

// ---------------------------------------------------------------------------
// LF-170 – per-owner token index
// ---------------------------------------------------------------------------

#[test]
fn tokens_of_owner_returns_minted_tokens() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);

    let t1 = client.mint(&minter, &alice, &0u32);
    let t2 = client.mint(&minter, &alice, &1u32);
    let t3 = client.mint(&minter, &alice, &2u32);

    let tokens = client.tokens_of_owner(&alice, &0, &50);
    assert_eq!(tokens.len(), 3);
    assert!(tokens.contains(&t1));
    assert!(tokens.contains(&t2));
    assert!(tokens.contains(&t3));
}

#[test]
fn tokens_of_owner_is_empty_for_non_holder() {
    let (env, client, _owner, _minter) = setup();
    let nobody = Address::generate(&env);

    let tokens = client.tokens_of_owner(&nobody, &0, &50);
    assert_eq!(tokens.len(), 0);
}

#[test]
fn tokens_of_owner_pagination_works() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);

    // Mint 5 tokens to alice
    for _ in 0..5u32 {
        client.mint(&minter, &alice, &0u32);
    }

    // Page 1: start=0, limit=2
    let page1 = client.tokens_of_owner(&alice, &0, &2);
    assert_eq!(page1.len(), 2);

    // Page 2: start=2, limit=2
    let page2 = client.tokens_of_owner(&alice, &2, &2);
    assert_eq!(page2.len(), 2);

    // Page 3: start=4, limit=2 (only 1 left)
    let page3 = client.tokens_of_owner(&alice, &4, &2);
    assert_eq!(page3.len(), 1);

    // Beyond end
    let beyond = client.tokens_of_owner(&alice, &10, &2);
    assert_eq!(beyond.len(), 0);
}

#[test]
fn tokens_of_owner_limit_is_clamped_to_max_page() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);

    // Mint 3 tokens
    for _ in 0..3u32 {
        client.mint(&minter, &alice, &0u32);
    }

    // Even with a huge limit, we only get 3 (the actual count)
    let tokens = client.tokens_of_owner(&alice, &0, &9999);
    assert_eq!(tokens.len(), 3);
}

#[test]
fn balance_matches_tokens_of_owner_count() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);

    client.mint(&minter, &alice, &0u32);
    client.mint(&minter, &alice, &1u32);

    let tokens = client.tokens_of_owner(&alice, &0, &50);
    assert_eq!(
        tokens.len() as u32,
        client.balance(&alice),
        "tokens_of_owner count must equal balance"
    );
}

#[test]
fn multiple_owners_have_independent_indexes() {
    let (env, client, _owner, minter) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let t1 = client.mint(&minter, &alice, &0u32);
    let t2 = client.mint(&minter, &bob, &0u32);
    let t3 = client.mint(&minter, &alice, &1u32);

    let alice_tokens = client.tokens_of_owner(&alice, &0, &50);
    let bob_tokens = client.tokens_of_owner(&bob, &0, &50);

    assert_eq!(alice_tokens.len(), 2);
    assert!(alice_tokens.contains(&t1));
    assert!(alice_tokens.contains(&t3));

    assert_eq!(bob_tokens.len(), 1);
    assert!(bob_tokens.contains(&t2));
}

// ---------------------------------------------------------------------------
// Administration / ownership tests (updated for new signature)
// ---------------------------------------------------------------------------

#[test]
fn owner_can_rotate_minter_and_old_minter_cannot_mint() {
    let (env, client, owner, minter) = setup();
    let new_minter = Address::generate(&env);
    let recipient = Address::generate(&env);

    assert_eq!(
        client.try_set_minter(&minter, &new_minter),
        Err(Ok(Error::NotOwner.into()))
    );
    client.set_minter(&owner, &new_minter);
    assert_eq!(client.minter(), new_minter);
    assert_eq!(
        client.try_mint(&minter, &recipient, &DEFAULT_KIND),
        Err(Ok(Error::NotMinter.into()))
    );
    assert_eq!(client.mint(&new_minter, &recipient, &DEFAULT_KIND), 1);
}

#[test]
fn ownership_transfer_is_two_step() {
    let (env, client, owner, _minter) = setup();
    let new_owner = Address::generate(&env);
    let stranger = Address::generate(&env);

    client.transfer_ownership(&owner, &new_owner);
    assert_eq!(client.owner(), owner);
    assert_eq!(
        client.try_accept_ownership(&stranger),
        Err(Ok(Error::NotPendingOwner.into()))
    );
    client.accept_ownership(&new_owner);
    assert_eq!(client.owner(), new_owner);
    assert_eq!(client.pending_owner(), None);
    assert_eq!(
        client.try_set_minter(&owner, &stranger),
        Err(Ok(Error::NotOwner.into()))
    );
}

#[test]
fn upgrade_keeps_state_and_changes_version() {
    let (env, client, owner, minter) = setup();
    let recipient = Address::generate(&env);
    client.mint(&minter, &recipient, &DEFAULT_KIND);
    assert_eq!(client.version(), 1);
    // Model a legacy deployment whose schema key is absent.
    env.as_contract(&client.address, || {
        env.storage().instance().remove(&crate::DataKey::SchemaVersion);
    });
    assert_eq!(client.schema_version(), 1);

    let hash = env
        .deployer()
        .upload_contract_wasm(include_bytes!("../../../fixtures/upgrade_v2.wasm").as_slice());
    assert_eq!(
        client.try_upgrade(&minter, &hash),
        Err(Ok(Error::NotOwner.into()))
    );
    client.upgrade(&owner, &hash);

    assert_eq!(client.version(), 2);
    assert_eq!(client.schema_version(), 1);
    let stored_owner: Address = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&crate::DataKey::TokenOwner(1))
            .unwrap()
    });
    assert_eq!(stored_owner, recipient);

    // Non-owner migration must be rejected
    assert!(
        client.try_migrate(&minter).is_err(),
        "migrate must only be callable by the contract owner"
    );

    // Owner runs migration
    client.migrate(&owner);
    assert_eq!(client.schema_version(), 2);

    // Second call to migrate is idempotent (no-op)
    let event_count_before = env.events().all().events().len();
    client.migrate(&owner);
    assert_eq!(client.schema_version(), 2);
    let event_count_after = env.events().all().events().len();
    assert_eq!(
        event_count_before, event_count_after,
        "second call to migrate must be a no-op and emit no events"
    );
}

// ---------------------------------------------------------------------------
// LF-172 – NFT: burn and burn_from tests
// ---------------------------------------------------------------------------

#[test]
fn holder_can_burn_and_balance_is_decremented() {
    let (env, client, _owner, minter) = setup();
    let holder = Address::generate(&env);
    let first = client.mint(&minter, &holder, &DEFAULT_KIND);
    let second = client.mint(&minter, &holder, &DEFAULT_KIND);

    assert_eq!(client.balance(&holder), 2);
    client.burn(&holder, &first);

    assert_eq!(
        client.try_owner_of(&first),
        Err(Ok(Error::TokenDoesNotExist.into()))
    );
    assert_eq!(client.owner_of(&second), holder);
    assert_eq!(client.balance(&holder), 1);

    client.burn(&holder, &second);
    assert_eq!(
        client.try_owner_of(&second),
        Err(Ok(Error::TokenDoesNotExist.into()))
    );
    assert_eq!(client.balance(&holder), 0);
}

#[test]
fn contract_owner_can_revoke_badge_via_burn_from() {
    let (env, client, owner, minter) = setup();
    let holder = Address::generate(&env);
    let token_id = client.mint(&minter, &holder, &DEFAULT_KIND);
    assert_eq!(client.balance(&holder), 1);

    client.burn_from(&owner, &holder, &token_id);

    assert_eq!(
        client.try_owner_of(&token_id),
        Err(Ok(Error::TokenDoesNotExist.into()))
    );
    assert_eq!(client.balance(&holder), 0);
}

#[test]
fn unauthorized_spender_cannot_burn_from() {
    let (env, client, _owner, minter) = setup();
    let holder = Address::generate(&env);
    let stranger = Address::generate(&env);
    let token_id = client.mint(&minter, &holder, &DEFAULT_KIND);

    let result = client.try_burn_from(&stranger, &holder, &token_id);
    assert_eq!(result, Err(Ok(Error::InsufficientApproval.into())));
    assert_eq!(client.owner_of(&token_id), holder);
    assert_eq!(client.balance(&holder), 1);
}

#[test]
fn burn_by_non_owner_is_rejected() {
    let (env, client, _owner, minter) = setup();
    let holder = Address::generate(&env);
    let mallory = Address::generate(&env);
    let token_id = client.mint(&minter, &holder, &DEFAULT_KIND);

    let result = client.try_burn(&mallory, &token_id);
    assert_eq!(result, Err(Ok(Error::IncorrectOwner.into())));
    assert_eq!(client.owner_of(&token_id), holder);
    assert_eq!(client.balance(&holder), 1);
}

#[test]
fn burn_of_unminted_token_fails() {
    let (env, client, _owner, _minter) = setup();
    let holder = Address::generate(&env);

    let result = client.try_burn(&holder, &999u128);
    assert_eq!(result, Err(Ok(Error::TokenDoesNotExist.into())));
}

#[test]
fn burn_publishes_burn_event() {
    let (env, client, _owner, minter) = setup();
    let holder = Address::generate(&env);
    let token_id = client.mint(&minter, &holder, &DEFAULT_KIND);

    client.burn(&holder, &token_id);
    assert_eq!(env.events().all().events().len(), 1);
}

// ---------------------------------------------------------------------------
// LF-173 – Pause and unpause tests
// ---------------------------------------------------------------------------

#[test]
fn pause_and_unpause_are_owner_only() {
    let (_env, client, owner, minter) = setup();

    assert_eq!(
        client.try_pause(&minter),
        Err(Ok(Error::NotOwner.into()))
    );
    client.pause(&owner);
    assert_eq!(
        client.try_unpause(&minter),
        Err(Ok(Error::NotOwner.into()))
    );
    assert!(client.is_paused());
    client.unpause(&owner);
    assert!(!client.is_paused());
}

#[test]
fn pause_blocks_mint() {
    let (env, client, owner, minter) = setup();
    let alice = Address::generate(&env);

    client.pause(&owner);
    assert_eq!(
        client.try_mint(&minter, &alice, &DEFAULT_KIND),
        Err(Ok(Error::Paused.into()))
    );

    client.unpause(&owner);
    assert!(!client.is_paused());

    let token_id = client.mint(&minter, &alice, &DEFAULT_KIND);
    assert_eq!(client.owner_of(&token_id), alice);
    assert_eq!(client.balance(&alice), 1);
}
