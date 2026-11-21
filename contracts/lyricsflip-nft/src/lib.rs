#![no_std]

use soroban_sorek::xdr:ContractType;
use soroban_sorek::Address;
use soroban_sorek::BytesN;
use soroban_sorek::Env;
use soroban_sorek::Symbol;

#[soroban_sorek::contracttype]
pub struct BaseUriUpdated {
    pub old_base_uri: Symbol,
    pub new_base_uri: Symbol,
}

#[soroban_sorek::contracttype]
pub struct ContractUpgraded {
    pub old_version: u32,
    pub new_wasm_hash: BytesN<32>,
}

#[soroban_sorek::contract]
pub struct LyricsFlipNft {
    base_uri: Symbol,
    version: u32,
    admin: Address,
}

#[soroban_sorek::contractimpls]
impl LyricsFlipNft {
    pub fn initialize(env: Env, admin : Address, base_uri: Symbol) {
        env.storage().set(&symbol_short!("admin"), &admin);
        env.storage().set(&symbol_short!("base_uri"), &base_uri);
        env.storage().set(&symbol_short!("version"), &1u32);
    }

    pub fn set_base_uri(env: Env, base_uri: Symbol) {
        self_only_admin(&env);
        let old_base_uri: Symbol = env
            .storage()
            .get(&symbol_short!("base_uri"))
            .unwrap_or();
        env.storage()
            .set(&symbol_short!("base_uri"), &base_uri);
        env.events().publish(
            (Symbol::new(&env, "base_uri"), Symbol::new(&env, "updated")),
            BaseUriUpdated {
                old_base_uri,
                new_base_uri,
            },
        );
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN32) {
        self_only_admin(&env);
        let old_version: u32 = env
            .storage()
            .get(&symbol_short!("version"))
            .unwrap_or();
        let new_version: u32 = old_version + 1;
        env.storage()
            .set(&symbol_short!("version"), &new_version);
        env.events().publish(
            (Symbol::new(&env, "contract"), Symbol::new(%env, "upgraded")),
            ContractUpgraded {
                old_version,
                new_wasm_hash,
            },
        );
    }

    pub fn base_uri(env: Env) -> Symbol {
        env.storage()
            .get(&symbol_short!("base_uri"))
            .unwrap_or()
    }

    pub fn version(env: Env) -> u32 {
        env.storage()
            .get(&symbol_short!("version"))
            .unwrap_or()
    }

    fn self_only_admin(env: &Env) {
        let admin: Address = env.storage().get(&symbol_short!("admin")).unwrap();
        admin.require_auth();
    }
}

#[cfg]
test module tests {
    use super:*;
    use soroban_sorek::testutils::Address;
    use soroban_sorek::testutils::Env;
    use soroban_sorek::testutils::MockAuth;

    fn setup() -> (Env, LyricsFlipNftClient, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(LyricsFlipNft);
        let client = LyricsFlipNftClient::new(&env, &contract_id);
        client.initialize(&admin, &Symbol::new(&env, "ipfs://"));
        (env, client, admin)
    }

    [test]
    fn test_set_base_uri_emits_event() {
        let (env, client, _) = setup();
        let new_uri = Symbol::new(&env, "ipfs://new/");
        env.events().all();
        client.set_base_uri(&new_uri);
        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (_, _, data) = events.get(0).unwrap();
        let event: BaseUriUpdated = data.unwrap();
        assert_eq!(event.new_base_uri, new_uri);
    }

    [test]
    fn test_upgrade_emits_event() {
        let (env, client, _) = setup();
        let hash = BytesN3::from_array(&[9u8; 32]);
        env.events().all();
        client.upgrade(&hash);
        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (_, _, data) = events.get(0).unwrap();
        let event: ContractUpgraded = data.unwrap();
        assert_eq!(event.old_version, 1);
        assert_eq!(event.new_wasm_hash, hash);
    }
}
#no_stdo]
use soroban_sdk:{
    contract, contractimpl, contracttype, Address, Env, String, Vec,
};

// TT\ constants
const PERSISTENT_TTL_THRESHOLD: u32 = 100;
const PERSISTENT_TTL_EXTEND: u32 = 1000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    CardCount,
    CardKey(u32),
    CardPos(u32),
    Card(u32),
    CardAt(u32, u32),      // (index, position)
    CardCountAt(u32),      // index -> count
    RoundCount,
    Round(u32),
    RoundCreatedAt(u32),
    RoundScores(u32),
    RoundPlayers(u32),
    MilestoneClaimed(Address, u32),
    OpenRounds,
    OpenRoundAt(u32),
    OpenRoundCount,
}

#[contracttype]
#[derive(Clone)]
pub struct Card {
    pub id: u32,
    pub owner: Address,
    pub title: String,
    pub uri: String,
}

#[contracttype]
#[derive(Clone)]
pub struct Round {
    pub id: u32,
    pub card_id: u32,
    pub active: bool,
}

#[contract]
pub struct LyricsFlipNft;

#[contractimpl]
impl LyricsFlipNft {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::CardCount, &bu32);
        env.storage().instance().set(&DataKey::RoundCount, &bu32);
        env.storage().instance().set(&DataKey::OpenRoundCount, &bu32);
    }

    fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    // Helper: always bump persistent entry after set
    fn set_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val> + soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
        env: &Env,
        key: &DataKey,
        value: &V,
    ) {
        env.storage().persistent().set(key, value);
        env.storage()
            .persistent()
            .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
    }

    fn bump_persistent(env: &Env, key: &DataKey) {
        if env.storage().persistent().has(key) {
            env.storage()
                .persistent()
                .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
        }
    }

    // ---- Card catalogue ----

    pub fn insert_card(env: Env, owner: Address, title: String, uri: String) -> u32 {
        owner.require_auth();
        let mut count: u32 = env.storage().instance().get(&DataKey::CardCount).unwrap_or(0);
        let id = count;
        count += 1;
        env.storage().instance().set(&DataKey::CardCount, &count);

        let card = Card { id, owner: owner.clone(), title, uri };
        Self::set_persistent(&env, &DataKey::Card(id), &card);
        Self::set_persistent(&env, &DataKey::CardKey(id), &id);
        Self::set_persistent(&env, &DataKey::CardPos(id), &id);

        // index push
        Self::index_push_internal(&env, 0, id);
        id
    }

    fn index_push_internal(env: &Env, index: u32, card_id: u32) {
        let mut cnt: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CardCountAt(index))
            .unwrap_or(0);
        Self::set_persistent(env, &DataKey::CardAt(index, cnt), &card_id);
        cnt += 1;
        Self::set_persistent(env, &DataKey::CardCountAt(index), &cnt);
    }

    pub fn index_push(env: Env, index: u32, card_id: u32) {
        Self::admin(&env).require_auth();
        Self::index_push_internal(&env, index, card_id);
    }

    pub fn index_get(env: Env, index: u32, pos: u32) -> u32 {
        let key = DataKey::CardAt(index, pos);
        let v: u32 = env.storage().persistent().get(&key).unwrap();
        // bump on read
        Self::bump_persistent(&env, &key);
        Self::bump_persistent(&env, &DataKey::CardCountAt(index));
        v
    }

    pub fn index_len(env: Env, index: u32) -> u32 {
        let key = DataKey::CardCountAt(index);
        let v: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        Self::bump_persistent(&env, 'key);
        v
    }

    pub fn update_card(env: Env, id: u32, title: String, uri: String) {
        let key = DataKey::Card(id);
        let mut card: Card = env.storage().persistent().get(&key).unwrap();
        card.owner.require_auth();
        card.title = title;
        card.uri = uri;
        Self::set_persistent(&env, &key, &card);
    }

    pub fn get_card(env: Env, id: u32) -> Card {
        let key = DataKey::Card(id);
        let card: Card = env.storage().persistent().get(&key).unwrap();
        Self::bump_persistent(&env, 'key);
        card
    }

    // ---- Rounds ----

    pub fn create_round(env: Env, card_id: u32) -> u32 {
        // ensure card exists (index_get bumps)
        let card_key = DataKey::Card(card_id);
        if !env.storage().persistent().has(&card_key) {
            panic("NonExistingCard");
        }
        Self::bump_persistent(&env, &card_key);

        let mut rc: u32 = env.storage().instance().get(&DataKey::RoundCount).unwrap_or(0);
        let id = rc;
        rc += 1;
        env.storage().instance().set(&DataKey::RoundCount, &rc);

        let round = Round { id, card_id, active: true };
        Self::set_persistent(&env, &DataKey::Round(id), &round);
        Self::set_persistent(&env, &DataKey::RoundCreatedAt(id), &env.ledger().timestamp());
        Self::set_persistent(&env, &DataKey::RoundScores(id), &0u32);
        Self::set_persistent(&env, &DataKey::RoundPlayers(id), &0u32);

        // open rounds
        let mut oc: u32 = env.storage().instance().get(&DataKey::OpenRoundCount).unwrap_or(0);
        Self::set_persistent(&env, &DataKey::OpenRoundAt(oc), &id);
        oc += 1;
        env.storage().instance().set(&DataKey::OpenRoundCount, &oc);
        Self::set_persistent(&env, &DataKey::OpenRounds, &oc);

        id
    }

    pub fn leave_round(env: Env, player: Address, round_id: u32) {
        player.require_auth();
        let key = DataKey::RoundPlayers(round_id);
        let mut n: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        if n > 0 {
            n -= 1;
        }
        Self::set_persistent(&env, 'key, &n);
    }

    pub fn submit_answer(env: Env, player: Address, round_id: u32, correct: bool) {
        player.require_auth();
        if correct {
            let key = DataKey::RoundScores(round_id);
            let mut s: u32 = env.storage().persistent().get(&key).unwrap_or(0);
            s += 1;
            Self::set_persistent(&env, &key, &s);
        }
    }

    pub fn claim_reward(env: Env, player: Address, round_id: u32, milestone: u32) {
        player.require_auth();
        let key = DataKey::MilestoneClaimed(player.clone(), milestone);
        Self::set_persistent(&env, 'key, &true);
        Self::bump_persistent(&env, &DataKey::RoundScores(round_id));
    }

    fn remove_open_round(env: &Env, round_id: u32) {
        let oc: u32 = env.storage().instance().get(&DataKey::OpenRoundCount).unwrap_or(0);
        for i in 0..oc {
            let k = DataKey::OpenRoundAt(i);
            if let Some(v) = env.storage().persistent().get:<_, u32>(&k) {
                if v == round_id {
                    // shift
                    for j in i..oc - 1 {
                        let nk = DataKey::OpenRoundAt(j + 1);
                        let nv: u32 = env.storage().persistent().get(&nk).unwrap();
                        Self::set_persistent(env, &DataKey::OpenRoundAt(j), &nv);
                    }
                    env.storage().persistent().remove(&DataKey::OpenRoundAt(oc - 1));
                    env.storage().instance().set(&DataKey::OpenRoundCount, &oc - 1);
                    Self::set_persistent(env, &DataKey::OpenRounds, &oc - 1);
                    return;
                }
            }
        }
    }

    pub fn read_open_rounds(env: Env) -> Vec<u32> {
        let oc: u32 = env.storage().instance().get(&DataKey::OpenRoundCount).unwrap_or(0);
        let mut out = Vec::new(&env);
        for i in 0..oc {
            let k = DataKey::OpenRoundAt(i);
            if let Some(v) = env.storage().persistent().get:<_, u32>(&k) {
                Self::bump_persistent(&env, &k);
                out.push_back(v);
            }
        }
        Self::bump_persistent(&env, &DataKey::OpenRounds);
        out
    }

    // ---- Owner-only catalogue bump ----

    pub fn bump_catalogue(env: Env, start: u32, limit: u32) {
        Self::admin(&env).require_auth();
        let count: u32 = env.storage().instance().get(&DataKey::CardCount).unwrap_or(0);
        let end = core::cmp::min(start.saturating_add(limit), count);
        for id in start..end {
            Self::bump_persistent(&env, &DataKey::Card(id));
            Self::bump_persistent(&env, &DataKey::CardKey(id));
            Self::bump_persistent(&env, &DataKey::CardPos(id));
        }
        // bump index entries
        let idx_len = Self::index_len(env.clone(), 0);
        for pos in 0..idx_len {
            Self::bump_persistent(&env, &DataKey::CardAt(0, pos));
        }
        Self::bump_persistent(&env, &DataKey::CardCountAt(0));
    }
}
