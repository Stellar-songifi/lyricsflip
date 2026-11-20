use super::*;

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

#[test]
fn constructor_grants_owner_admin() {
    let (_env, client, owner) = setup();
    assert!(client.is_admin(&Role::Admin, &owner));
}

// ---------------------------------------------------------------------------
// set_cards_per_round
// ---------------------------------------------------------------------------

#[test]
fn set_cards_per_round_rejects_zero() {
    let (_env, client, owner) = setup();
    let result = client.try_set_cards_per_round(&owner, &0);
    assert!(result.is_err());
}

#[test]
fn set_cards_per_round_requires_admin() {
    let (env, client, _owner) = setup();
    let non_admin = Address::generate(&env);
    let result = client.try_set_cards_per_round(&non_admin, &5);
    assert!(result.is_err());
}

#[test]
fn set_cards_per_round_rejects_above_cap() {
    let (_env, client, owner) = setup();
    client.set_cards_per_round(&owner, &MAX_CARDS_PER_ROUND);
    assert_eq!(
        client.try_set_cards_per_round(&owner, &(MAX_CARDS_PER_ROUND + 1)),
        Err(Ok(Error::InvalidCardsPerRound.into()))
    );
}

#[test]
fn set_max_players_rejects_above_cap() {
    let (_env, client, owner) = setup();
    client.set_max_players(&owner, &MAX_ROUND_PLAYERS);
    assert_eq!(
        client.try_set_max_players(&owner, &(MAX_ROUND_PLAYERS + 1)),
        Err(Ok(Error::MaxPlayersTooHigh.into()))
    );
}

// ---------------------------------------------------------------------------
// set_role / is_admin
// ---------------------------------------------------------------------------

#[test]
fn set_role_is_owner_gated_and_updates_is_admin() {
    let (env, client, owner) = setup();
    let new_admin = Address::generate(&env);
    assert!(!client.is_admin(&Role::Admin, &new_admin));

    client.set_role(&owner, &new_admin, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &new_admin));

    let outsider = Address::generate(&env);
    let result = client.try_set_role(&outsider, &new_admin, &Role::Admin, &false);
    assert!(result.is_err(), "only the owner may grant/revoke admin");
}

// ---------------------------------------------------------------------------
// Error code stability
// ---------------------------------------------------------------------------

/// Clients map on these numeric codes; renumbering any of them is a breaking
/// change. Update `onchain/README.md` and `frontend/src/lib/stellar/errors.ts`
/// together with this test.
#[test]
fn error_codes_are_stable() {
    let expected = [
        (Error::AlreadyInitialized, 1u32),
        (Error::NonExistingRound, 2),
        (Error::RoundAlreadyStarted, 3),
        (Error::NonExistingGenre, 4),
        (Error::RoundAlreadyJoined, 5),
        (Error::InvalidCardsPerRound, 6),
        (Error::ArtistCardsIsZero, 7),
        (Error::EmptyYearCards, 8),
        (Error::EmptyGenreCards, 9),
        (Error::RoundNotStarted, 10),
        (Error::RoundCompleted, 11),
        (Error::NotAParticipant, 12),
        (Error::AlreadyReady, 13),
        (Error::NotAuthorized, 14),
        (Error::AmountExceedsLimit, 15),
        (Error::LimitMustBeGreaterThanZero, 16),
        (Error::NonExistingCard, 17),
        (Error::RoundNotReady, 18),
        (Error::RoundAlreadyFinalized, 19),
        (Error::NotEnoughDistinctCards, 20),
        (Error::RoundFull, 21),
        (Error::InvalidMaxPlayers, 22),
        (Error::NftContractNotSet, 23),
        (Error::MilestoneNotReached, 24),
        (Error::MilestoneAlreadyClaimed, 25),
        (Error::InvalidCardTitle, 26),
        (Error::InvalidCardArtist, 27),
        (Error::InvalidCardLyrics, 28),
        (Error::InvalidCardYear, 29),
        (Error::LyricsTooLong, 30),
        (Error::DuplicateCard, 31),
        (Error::BatchTooLarge, 32),
        (Error::NotPendingOwner, 33),
        (Error::NoMoreCards, 34),
        (Error::RoundCancelled, 35),
        (Error::InvalidCardDifficulty, 36),
        (Error::InvalidDecade, 37),
        (Error::NoActiveCard, 38),
        (Error::AlreadyAnswered, 39),
        (Error::Paused, 40),
        (Error::InvalidAnswerWindow, 41),
        (Error::InvalidLobbyTimeout, 42),
        (Error::InvalidRoundDuration, 43),
        (Error::CardInActiveRound, 44),
        (Error::TooManyOpenRounds, 45),
        (Error::MaxPlayersTooHigh, 46),
        (Error::LobbyExpired, 47),
        (Error::InvalidInvite, 48),
        (Error::LobbyTimeoutNotReached, 49),
        (Error::AdminCannotLeave, 50),
    ];
    for (variant, code) in expected {
        assert_eq!(variant as u32, code, "{:?} was renumbered", variant);
    }
}

#[test]
fn owner_can_still_set_roles_after_revoking_own_admin() {
    let (env, client, owner) = setup();
    let other = Address::generate(&env);

    client.set_role(&owner, &owner, &Role::Admin, &false);
    assert!(!client.is_admin(&Role::Admin, &owner));

    client.set_role(&owner, &other, &Role::Admin, &true);
    client.set_role(&owner, &owner, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &other));
    assert!(client.is_admin(&Role::Admin, &owner));
}

#[test]
fn set_role_emits_role_updated() {
    let (env, client, owner) = setup();
    let other = Address::generate(&env);
    client.set_role(&owner, &other, &Role::Admin, &true);
    let expected = RoleUpdated {
        account: other,
        role: Role::Admin,
        enabled: true,
    }
    .to_xdr(&env, &client.address);
    assert!(env
        .events()
        .all()
        .filter_by_contract(&client.address)
        .events()
        .contains(&expected));
}

#[test]
fn ownership_transfer_end_to_end() {
    let (env, client, owner) = setup();
    let new_owner = Address::generate(&env);
    let stranger = Address::generate(&env);

    assert_eq!(
        client.try_transfer_ownership(&stranger, &new_owner),
        Err(Ok(Error::NotAuthorized.into()))
    );
    client.transfer_ownership(&owner, &new_owner);
    assert_eq!(client.pending_owner(), Some(new_owner.clone()));
    assert_eq!(
        client.try_accept_ownership(&stranger),
        Err(Ok(Error::NotPendingOwner.into()))
    );

    client.accept_ownership(&new_owner);
    assert_eq!(client.owner(), new_owner);
    assert_eq!(client.pending_owner(), None);
    assert!(client.is_admin(&Role::Admin, &new_owner));
    assert_eq!(
        client.try_set_role(&owner, &stranger, &Role::Admin, &true),
        Err(Ok(Error::NotAuthorized.into()))
    );
    client.set_role(&new_owner, &stranger, &Role::Admin, &true);
}

// ----------------------------------------------------------------------------
// LF-156: Move admin flags out of instance storage, and make admins enumerable
// ----------------------------------------------------------------------------

#[test]
fn test_lf156_admin_flags_in_persistent_storage_not_instance() {
    let (env, client, owner) = setup();

    // Owner is admin
    assert!(client.is_admin(&Role::Admin, &owner));

    // get_admins returns current set containing owner
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);

    // Instance storage holds only global configuration - ZERO Admin keys in instance!
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(owner.clone())),
            "Instance storage must not contain DataKey::Admin"
        );
        assert_eq!(
            env.storage()
                .persistent()
                .get::<_, bool>(&crate::DataKey::Admin(owner.clone())),
            Some(true),
            "Persistent storage must hold DataKey::Admin"
        );
    });
}

#[test]
fn test_lf156_admin_addition_and_enumeration() {
    let (env, client, owner) = setup();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    assert!(!client.is_admin(&Role::Admin, &admin1));
    assert!(!client.is_admin(&Role::Admin, &admin2));

    // Add admin1 and admin2
    client.set_role(&owner, &admin1, &Role::Admin, &true);
    client.set_role(&owner, &admin2, &Role::Admin, &true);

    assert!(client.is_admin(&Role::Admin, &admin1));
    assert!(client.is_admin(&Role::Admin, &admin2));

    // get_admins returns all 3 current admins
    let admins = client.get_admins();
    assert_eq!(admins.len(), 3);
    assert_eq!(admins.get(0).unwrap(), owner);
    assert_eq!(admins.get(1).unwrap(), admin1);
    assert_eq!(admins.get(2).unwrap(), admin2);

    // Adding duplicate does not duplicate entry in get_admins
    client.set_role(&owner, &admin1, &Role::Admin, &true);
    assert_eq!(client.get_admins().len(), 3);

    // Verify instance storage remains pure
    env.as_contract(&client.address, || {
        assert!(!env
            .storage()
            .instance()
            .has(&crate::DataKey::Admin(admin1.clone())));
        assert!(!env
            .storage()
            .instance()
            .has(&crate::DataKey::Admin(admin2.clone())));
        assert!(env
            .storage()
            .persistent()
            .has(&crate::DataKey::Admin(admin1.clone())));
        assert!(env
            .storage()
            .persistent()
            .has(&crate::DataKey::Admin(admin2.clone())));
    });
}

#[test]
fn test_lf156_admin_revocation_removes_key_without_tombstone() {
    let (env, client, owner) = setup();

    let admin1 = Address::generate(&env);
    client.set_role(&owner, &admin1, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &admin1));
    assert_eq!(client.get_admins().len(), 2);

    // Revoke admin1
    client.set_role(&owner, &admin1, &Role::Admin, &false);
    assert!(!client.is_admin(&Role::Admin, &admin1));

    // get_admins excludes revoked admin
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);

    // On revoke, remove the entry instead of writing false (no tombstone!)
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .persistent()
                .has(&crate::DataKey::Admin(admin1.clone())),
            "Revocation must remove key from persistent storage (no false tombstone)"
        );
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(admin1.clone())),
            "Instance storage must not contain revoked admin key"
        );
    });
}

#[test]
fn test_lf156_owner_revoking_admin_maintains_owner_rights() {
    let (_env, client, owner) = setup();

    // Owner revokes own admin flag
    client.set_role(&owner, &owner, &Role::Admin, &false);
    assert!(!client.is_admin(&Role::Admin, &owner));
    assert_eq!(client.get_admins().len(), 0);

    // Owner can still manage roles and reinstate admin role
    client.set_role(&owner, &owner, &Role::Admin, &true);
    assert!(client.is_admin(&Role::Admin, &owner));
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);
}

#[test]
fn test_lf156_accept_ownership_updates_persistent_admins() {
    let (env, client, owner) = setup();

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner);
    client.accept_ownership(&new_owner);

    assert_eq!(client.owner(), new_owner);
    assert!(client.is_admin(&Role::Admin, &new_owner));

    let admins = client.get_admins();
    // Old owner and new owner are both admins
    assert_eq!(admins.len(), 2);
    assert_eq!(admins.get(0).unwrap(), owner);
    assert_eq!(admins.get(1).unwrap(), new_owner);

    env.as_contract(&client.address, || {
        assert!(!env
            .storage()
            .instance()
            .has(&crate::DataKey::Admin(new_owner.clone())));
        assert!(env
            .storage()
            .persistent()
            .has(&crate::DataKey::Admin(new_owner.clone())));
    });
}

#[test]
fn test_lf156_upgrade_migration_v3_to_v4() {
    let (env, client, owner) = setup();

    // Model a v3 deployment with owner admin flag stored in instance storage
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&crate::DataKey::SchemaVersion, &3u32);
        env.storage()
            .instance()
            .set(&crate::DataKey::Admin(owner.clone()), &true);
        env.storage()
            .persistent()
            .remove(&crate::DataKey::Admin(owner.clone()));
        env.storage().persistent().remove(&crate::DataKey::Admins);
    });

    assert_eq!(client.schema_version(), 3);

    // Migrate from v3 to v4
    client.migrate(&owner);

    // Schema version bumped to 4
    assert_eq!(client.schema_version(), 4);

    // Admin moved to persistent storage and out of instance storage
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(owner.clone())),
            "Migration must remove DataKey::Admin from instance storage"
        );
        assert_eq!(
            env.storage()
                .persistent()
                .get::<_, bool>(&crate::DataKey::Admin(owner.clone())),
            Some(true),
            "Migration must set DataKey::Admin in persistent storage"
        );
    });

    // get_admins now returns owner
    let admins = client.get_admins();
    assert_eq!(admins.len(), 1);
    assert_eq!(admins.get(0).unwrap(), owner);

    // Second call is an idempotent no-op
    client.migrate(&owner);
    assert_eq!(client.schema_version(), 4);
}

#[test]
fn test_lf156_lazy_migration_of_legacy_admins() {
    let (env, client, _owner) = setup();

    let legacy_admin = Address::generate(&env);
    let legacy_revoked = Address::generate(&env);

    // Directly seed legacy instance storage entries
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&crate::DataKey::Admin(legacy_admin.clone()), &true);
        env.storage()
            .instance()
            .set(&crate::DataKey::Admin(legacy_revoked.clone()), &false);
    });

    // Query active legacy admin
    assert!(client.is_admin(&Role::Admin, &legacy_admin));
    // Query revoked legacy admin
    assert!(!client.is_admin(&Role::Admin, &legacy_revoked));

    // Verify lazy migration cleaned up instance storage
    env.as_contract(&client.address, || {
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(legacy_admin.clone())),
            "Instance storage legacy active entry must be removed"
        );
        assert!(
            !env.storage()
                .instance()
                .has(&crate::DataKey::Admin(legacy_revoked.clone())),
            "Instance storage legacy false entry must be removed"
        );
        assert!(
            env.storage()
                .persistent()
                .has(&crate::DataKey::Admin(legacy_admin.clone())),
            "Persistent storage must now hold active admin"
        );
        assert!(
            !env.storage()
                .persistent()
                .has(&crate::DataKey::Admin(legacy_revoked.clone())),
            "Revoked admin must not have persistent entry"
        );
    });

    // Enumerable index now includes lazily-migrated active admin
    let admins = client.get_admins();
    let mut found = false;
    for i in 0..admins.len() {
        if admins.get(i).unwrap() == legacy_admin {
            found = true;
            break;
        }
    }
    assert!(found, "get_admins must include lazily migrated admin");
}
