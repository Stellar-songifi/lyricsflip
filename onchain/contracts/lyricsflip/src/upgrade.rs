use crate::*;

pub(crate) fn version() -> u32 {
    VERSION
}

pub(crate) fn schema_version(env: Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::SchemaVersion)
        .unwrap_or(1)
}

pub(crate) fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);
    let old_version = LyricsFlip::version();
    env.deployer()
        .update_current_contract_wasm(new_wasm_hash.clone());
    ContractUpgraded {
        owner: caller,
        new_wasm_hash,
        old_version,
        new_version: old_version,
    }
    .publish(&env);
}

pub(crate) fn migrate(env: Env, caller: Address) {
    caller.require_auth();
    LyricsFlip::assert_owner(&env, &caller);

    let stored_version = LyricsFlip::schema_version(env.clone());
    if stored_version >= SCHEMA_VERSION {
        return;
    }

    let mut current_version = stored_version;
    while current_version < SCHEMA_VERSION {
        match current_version {
            1 => {
                current_version = 2;
            }
            2 => {
                // LF-158: Migration from v2 to v3 introduces configurable timing parameters
                current_version = 3;
            }
            3 => {
                // LF-156: Move admin flags out of instance storage, and make admins enumerable
                let owner = LyricsFlip::owner(env.clone());
                let is_owner_admin: bool = env
                    .storage()
                    .instance()
                    .get(&DataKey::Admin(owner.clone()))
                    .unwrap_or(false);
                env.storage()
                    .instance()
                    .remove(&DataKey::Admin(owner.clone()));

                if is_owner_admin {
                    set_persistent(&env, &DataKey::Admin(owner.clone()), &true);
                }

                let mut admins = LyricsFlip::read_admins(&env);
                if is_owner_admin {
                    let mut found = false;
                    for i in 0..admins.len() {
                        if admins.get(i).unwrap() == owner {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        admins.push_back(owner.clone());
                    }
                }
                set_persistent(&env, &DataKey::Admins, &admins);

                current_version = 4;
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
