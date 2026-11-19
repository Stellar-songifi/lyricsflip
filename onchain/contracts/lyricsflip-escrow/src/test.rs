#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env};

use crate::{Error, EscrowContract, EscrowContractClient, RoundStatus};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Deploy the escrow contract and a fake SEP-41 token; return both clients
/// together with standard addresses.
struct Fixture {
    env: Env,
    escrow: EscrowContractClient<'static>,
    token: token::StellarAssetClient<'static>,
    token_id: Address,
    owner: Address,
    treasury: Address,
}

impl Fixture {
    fn new(fee_bps: u32) -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let owner = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Deploy a Stellar-asset token so we can mint / transfer.
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token = token::StellarAssetClient::new(&env, &token_id.address());

        // Deploy the escrow contract.
        let escrow_id = env.register(EscrowContract, (owner.clone(), treasury.clone(), fee_bps));
        let escrow = EscrowContractClient::new(&env, &escrow_id);
        // initialize returns () on success (panics on error) in the generated client.

        Self {
            env,
            escrow,
            token,
            token_id: token_id.address(),
            owner,
            treasury,
        }
    }

    /// Mint `amount` tokens to `recipient` and transfer them to the escrow
    /// contract (simulating a wager deposit).
    fn fund_escrow(&self, recipient: &Address, amount: i128) {
        self.token.mint(recipient, &amount);
        let token_client = token::Client::new(&self.env, &self.token_id);
        token_client.transfer(recipient, &self.escrow.address, &amount);
    }
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#[test]
fn initialize_ok() {
    let f = Fixture::new(500); // 5 %
    let config = f.escrow.get_config();
    assert_eq!(config.owner, f.owner);
    assert_eq!(config.treasury, f.treasury);
    assert_eq!(config.fee_bps, 500);
}

#[test]
fn initialize_rejects_duplicate() {
    let f = Fixture::new(0);
    let result = f.escrow.try_initialize(&f.owner, &f.treasury, &0);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn initialize_rejects_fee_above_100_percent() {
    let env = Env::default();
    env.mock_all_auths();
    let owner = Address::generate(&env);
    let treasury = Address::generate(&env);
    let escrow_id = env.register(EscrowContract, (owner.clone(), treasury.clone(), fee_bps));
    let escrow = EscrowContractClient::new(&env, &escrow_id);
    let result = escrow.try_initialize(&owner, &treasury, &10_001);
    assert_eq!(result, Err(Ok(Error::InvalidFee)));
}

// ---------------------------------------------------------------------------
// create_round — owner-gated
// ---------------------------------------------------------------------------

#[test]
fn create_round_ok() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);

    let round = f.escrow.get_round(&1u64);
    assert_eq!(round.id, 1);
    assert_eq!(round.pot, 1000);
    assert_eq!(round.status, RoundStatus::Open);
}

#[test]
fn create_round_requires_owner_auth() {
    let env = Env::default();
    // Do NOT call mock_all_auths; we want real auth enforcement.
    let owner = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();

    let escrow_id = env.register(EscrowContract, (owner.clone(), treasury.clone(), fee_bps));
    let escrow = EscrowContractClient::new(&env, &escrow_id);

    // Initialize with mock auths just for the setup call.
    env.mock_all_auths();
    env.set_auths(&[]); // clear all mocked auths

    let creator = Address::generate(&env);
    // Without the owner's auth this must panic with a Soroban auth error.
    let result = escrow.try_create_round(&1u64, &creator, &token_id, &500i128);
    assert!(result.is_err());
}

#[test]
fn create_round_rejects_duplicate() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    let result = f.escrow.try_create_round(&1u64, &creator, &f.token_id, &500i128);
    assert_eq!(result, Err(Ok(Error::RoundAlreadyExists)));
}

// ---------------------------------------------------------------------------
// settle_round — owner-gated
// ---------------------------------------------------------------------------

#[test]
fn settle_round_ok() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let winner = Address::generate(&f.env);
    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);

    let winners = soroban_sdk::vec![&f.env, winner.clone()];
    f.escrow.settle_round(&1u64, &winners.clone());

    let round = f.escrow.get_round(&1u64);
    assert_eq!(round.status, RoundStatus::Settled);
    assert_eq!(round.winners, winners);
}

#[test]
fn settle_round_requires_owner_auth() {
    let env = Env::default();
    let owner = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();

    let escrow_id = env.register(EscrowContract, (owner.clone(), treasury.clone(), fee_bps));
    let escrow = EscrowContractClient::new(&env, &escrow_id);

    env.mock_all_auths();
    let creator = Address::generate(&env);
    escrow.create_round(&1u64, &creator, &token_id, &1000i128);

    env.set_auths(&[]); // clear mocked auths

    let winner = Address::generate(&env);
    let result = escrow.try_settle_round(&1u64, &soroban_sdk::vec![&env, winner]);
    assert!(result.is_err());
}

#[test]
fn settle_round_rejects_empty_winners() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    let result = f.escrow.try_settle_round(&1u64, &soroban_sdk::vec![&f.env]);
    assert_eq!(result, Err(Ok(Error::NoWinners)));
}

#[test]
fn settle_round_rejects_double_settle() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let winner = Address::generate(&f.env);
    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    let winners = soroban_sdk::vec![&f.env, winner.clone()];
    f.escrow.settle_round(&1u64, &winners.clone());
    let result = f.escrow.try_settle_round(&1u64, &winners);
    assert_eq!(result, Err(Ok(Error::RoundAlreadySettled)));
}

// ---------------------------------------------------------------------------
// claim_winnings
// ---------------------------------------------------------------------------

#[test]
fn claim_winnings_single_winner_no_fee() {
    let f = Fixture::new(0); // 0% fee
    let creator = Address::generate(&f.env);
    let winner = Address::generate(&f.env);

    f.fund_escrow(&creator, 1000);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    f.escrow.settle_round(&1u64, &soroban_sdk::vec![&f.env, winner.clone()]);

    let payout = f.escrow.claim_winnings(&winner, &1u64);
    assert_eq!(payout, 1000);

    let token_client = token::Client::new(&f.env, &f.token_id);
    assert_eq!(token_client.balance(&winner), 1000);
}

#[test]
fn claim_winnings_with_fee() {
    let f = Fixture::new(500); // 5 %
    let creator = Address::generate(&f.env);
    let winner = Address::generate(&f.env);

    f.fund_escrow(&creator, 1000);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    f.escrow.settle_round(&1u64, &soroban_sdk::vec![&f.env, winner.clone()]);

    let payout = f.escrow.claim_winnings(&winner, &1u64);
    // 5% fee = 50, winner receives 950
    assert_eq!(payout, 950);

    let token_client = token::Client::new(&f.env, &f.token_id);
    assert_eq!(token_client.balance(&winner), 950);
    assert_eq!(token_client.balance(&f.treasury), 50);
}

#[test]
fn claim_winnings_two_winners_equal_split() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let winner1 = Address::generate(&f.env);
    let winner2 = Address::generate(&f.env);

    f.fund_escrow(&creator, 1000);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    f.escrow.settle_round(
        &1u64,
        &soroban_sdk::vec![&f.env, winner1.clone(), winner2.clone()],
    );

    let p1 = f.escrow.claim_winnings(&winner1, &1u64);
    let p2 = f.escrow.claim_winnings(&winner2, &1u64);

    let token_client = token::Client::new(&f.env, &f.token_id);
    assert_eq!(p1, 500);
    assert_eq!(p2, 500);
    assert_eq!(token_client.balance(&winner1), 500);
    assert_eq!(token_client.balance(&winner2), 500);
}

#[test]
fn claim_winnings_dust_distributed_to_first_winner() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let winner1 = Address::generate(&f.env);
    let winner2 = Address::generate(&f.env);
    let winner3 = Address::generate(&f.env);

    // pot=1001 with 3 winners: base=333, remainder=2, so winners 0,1 get 334 and winner 2 gets 333.
    f.fund_escrow(&creator, 1001);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1001i128);
    f.escrow.settle_round(
        &1u64,
        &soroban_sdk::vec![
            &f.env,
            winner1.clone(),
            winner2.clone(),
            winner3.clone()
        ],
    );

    let p1 = f.escrow.claim_winnings(&winner1, &1u64);
    let p2 = f.escrow.claim_winnings(&winner2, &1u64);
    let p3 = f.escrow.claim_winnings(&winner3, &1u64);

    assert_eq!(p1, 334);
    assert_eq!(p2, 334);
    assert_eq!(p3, 333);
    assert_eq!(p1 + p2 + p3, 1001);
}

#[test]
fn claim_winnings_rejects_non_winner() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let winner = Address::generate(&f.env);
    let outsider = Address::generate(&f.env);

    f.fund_escrow(&creator, 1000);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    f.escrow.settle_round(&1u64, &soroban_sdk::vec![&f.env, winner]);

    let result = f.escrow.try_claim_winnings(&outsider, &1u64);
    assert_eq!(result, Err(Ok(Error::NotAWinner)));
}

#[test]
fn claim_winnings_rejects_double_claim() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let winner = Address::generate(&f.env);

    f.fund_escrow(&creator, 1000);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    f.escrow.settle_round(&1u64, &soroban_sdk::vec![&f.env, winner.clone()]);

    f.escrow.claim_winnings(&winner, &1u64);
    let result = f.escrow.try_claim_winnings(&winner, &1u64);
    assert_eq!(result, Err(Ok(Error::AlreadyClaimed)));
}

#[test]
fn claim_winnings_rejects_unsettled_round() {
    let f = Fixture::new(0);
    let creator = Address::generate(&f.env);
    let caller = Address::generate(&f.env);

    f.fund_escrow(&creator, 1000);

    f.escrow.create_round(&1u64, &creator, &f.token_id, &1000i128);
    // Do NOT settle — round is still Open.
    let result = f.escrow.try_claim_winnings(&caller, &1u64);
    assert_eq!(result, Err(Ok(Error::RoundNotSettled)));
}
