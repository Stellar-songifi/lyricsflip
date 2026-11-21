//! Stand-in "v2" code for the upgrade tests. Its built WASM is committed as
//! `onchain/fixtures/upgrade_v2.wasm` so `cargo test` needs no WASM build;
//! rebuild it with `cargo build --target wasm32v1-none --release` and copy
//! `target/wasm32v1-none/release/upgrade_fixture.wasm` over it.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 14,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    PendingOwner,
    Admin(Address),
    CardsCount,
    CardsPerRound,
    Paused,
    MaxPlayers,
    SchemaVersion,
    MigratedV2Summary,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct V2Summary {
    pub migrated: bool,
    pub card_count: u64,
    pub cards_per_round: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    #[topic]
    pub owner: Address,
    pub new_wasm_hash: soroban_sdk::BytesN<32>,
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

#[contract]
pub struct UpgradeFixture;

#[contractimpl]
impl UpgradeFixture {
    /// Returns the contract code version (v2).
    pub fn version() -> u32 {
        2
    }

    /// Returns the stored schema version. Defaults to 1 for unmigrated v1 contracts.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SchemaVersion)
            .unwrap_or(1)
    }

    /// Returns the contract owner.
    pub fn owner(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .expect("owner not set")
    }

    /// Owner-only. Migrates stored state from schema v1 to v2.
    /// Strictly idempotent: calling it multiple times after migration is a no-op.
    pub fn migrate(env: Env, caller: Address) {
        caller.require_auth();
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .expect("owner not set");
        if caller != owner {
            soroban_sdk::panic_with_error!(env, Error::NotAuthorized);
        }

        let current_schema = Self::schema_version(env.clone());
        if current_schema >= 2 {
            return; // Idempotent no-op!
        }

        // Migrate storage from v1 to v2:
        let card_count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CardsCount)
            .unwrap_or(0);
        let cards_per_round: u32 = env
            .storage()
            .instance()
            .get(&DataKey::CardsPerRound)
            .unwrap_or(0);

        let summary = V2Summary {
            migrated: true,
            card_count: card_count as u64,
            cards_per_round,
        };
        env.storage()
            .instance()
            .set(&DataKey::MigratedV2Summary, &summary);

        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &2u32);

        SchemaMigrated {
            caller,
            old_schema_version: current_schema,
            new_schema_version: 2,
        }
        .publish(&env);
    }

    /// Returns the migrated v2 summary data.
    pub fn get_v2_summary(env: Env) -> Option<V2Summary> {
        env.storage().instance().get(&DataKey::MigratedV2Summary)
    }
}
