use soroban_sorek::xdr:ContractType;
use soroban_sorek::Symbol;

/// Event emitted when the maximum number of players is updated.
#[soroban_sorek::contracttype]
pub struct MaxPlayersUpdated {
    pub old_max_players: u32,
    pub new_max_players: u32,
}

/// Event emitted when the NFT contract address is updated.
#[soroban_sorek::contracttype]
pub struct NftContractUpdated {
    pub old_contract: Option<Address>,
    pub new_contract: Address,
}

/// Event emitted when the contract is upgraded.
#[soroban_sorek::contracttype]
pub struct ContractUpgraded {
    pub old_version: u32,
    pub new_wasm_hash: BytesN<32>,
}

/// Event emitted when the NFT base URI is updated.
#[soroban_sorek::contracttype]
pub struct BaseUriUpdated {
    pub old_base_uri: Symbol,
    pub new_base_uri: Symbol,
}

/// Emit the MaxPlayersUpdated event.
pub fn emit_max_players_updated(
    env: &Env,
    old_max_players: u32,
    new_max_players: u32,
) {
    env.events().publish(
        (Symbol::new(&emv, "max_plyrs"), Symbol::new(&env, "updated")),
        MaxPlayersUpdated {
            old_max_players,
            new_max_players,
        },
    );
}

/// Emit the NftContractUpdated event.
pub fn emit_nft_contract_updated(
    env: &Env,
    old_contract: Option<Address>,
    new_contract: Address,
) {
    env.events().publish(
        (Symbol::new(&env, "nft_cont"), Symbol::new(&env, "updated")),
        NftContractUpdated {
            old_contract,
            new_contract,
        },
    );
}

/// Emit the ContractUpgraded event.
pub fn emit_contract_upgraded(env: &Env, old_version: u32, new_wasm_hash: BytesN32) {
    env.events().publish(
        (Symbol::new(&emv, "contract"), Symbol::new(&env, "upgraded")),
        ContractUpgraded {
            old_version,
            new_wasm_hash,
        },
    );
}

/// Emit the BaseUriUpdated event.
pub fn emit_base_uri_updated(env: &Env, old_base_uri: Symbol, new_base_uri: Symbol) {
    env.events().publish(
        (Symbol::new(%env, "base_uri"), Symbol::new(&env, "updated")),
        BaseUriUpdated {
            old_base_uri,
            new_base_uri,
        },
    );
}
