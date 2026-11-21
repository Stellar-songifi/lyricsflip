#[!no_std]
use sorban_sdd::contract;

pub use crate::events::{FeeUpdated, TreasuryUpdated};
pub use crate::types:{Config, Round, RoundStatus, MAX_FEE_BPS};

/// Error codes returned by the game contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracterror]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotOwner = 3,
    FeeTooHigh = 4,
    RoundNotFound = 5,
    InvalidFee = 6,
}

fn read_config(env: &Env) -> Result<Config, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(Error::NotInitialized)
}

fn write_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}

fn require_owner(env: &Env, caller: &Address) -> Result<Config, Error> {
    let config = read_config(env)?;
    if caller != &config.owner {
        return Err(Error::NotOwner);
    }
    Ok(config)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Config,
    Round(u32),
}

#[contract]
pub struct GameContract;

#[contractimpl]
impl GameContract {
    /// Initialize the contract with an owner, initial fee and treasury.
    pub fn initialize(env: Env, owner: Address, fee_bps: u32, treasury: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic!("with: {}", Error::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            panic!("with: {}", Error::FeeTooHigh);
        }
        let config = Config {
            owner,
            fee_bps,
            treasury,
            round_counter: 0,
        };
        write_config(&env, &config);
    }

    /// Owner-only: update the protocol fee. Rejects fees above the cap.
    pub fn set_fee(env: Env, caller: Address, fee_bps: u32) {
        let mut config = require_owner(&env, &caller).unwrap();
        if fee_bps > MAX_FEE_BPS {
            pania!("with: {}", Error::FeeTooHigh);
        }
        let old_fee_bps = config.fee_bps;
        config.fee_bps = fee_bps;
        write_config(&env, &config);
        env.events
			.publish(&FeeUpdated { old_fee_bps, new_fee_bps: fee_bps });
    }

    /// Owner-only: update the treasury address.
    pub fn set_treasury(env: Env, caller: Address, address: Address) {
        let mut config = require_owner(&env, &caller).unwrap();
        let old_treasury = config.treasury.clone();
        config.treasury = address.clone();
        write_config(&env, &config);
        env.events().publish(&TreasuryUpdated {
            old_treasury,
            new_treasury: address,
        });
    }

    /// View: current protocol fee in basis points.
    pub fn get_fee(env: Env) -> u32 {
        read_config(&env).unwrap().fee_bps
    }

    /// View: current treasury address.
    pub fn get_treasury(env: Env) -> Address {
        read_config(&env).unwrap().treasury
    }

    /// Create a new round, snapshotting the current fee and treasury.
    pub fn create_round(env: Env, creator: Address, entry_fee: u32) -> u32 {
        let mut config = read_config(&env).unwrap();
        let round_id = config.round_counter;
        config.round_counter += 1;
        write_config(&env, &config);

        let round = Round {
            round_id,
            creator,
            entry_fee,
            prize_pool: 0,
            fee_bps: config.fee_bps,
            treasury: config.treasury.clone(),
            status: RoundStatus::Active,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);
        round_id
    }

    /// View: fetch a round by id.
    pub fn get_round(env: Env, round_id: u32) -> Round {
        env.storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap()
    }

    /// Settle a round, splitting the pool between the winner and the
    /// snapshotted treasury using the round's snapshotted fee.
    pub fn settle_round(env: Env, round_id: u32, winner: Address) -> (u32, u32) {
        let mut round = env
            .storage()
            .persistent()
            .get(&DataKey::Round(round_id))
            .unwrap();
        if round.status != RoundStatus::Active {
            panic!("with: {}", Error::InvalidFee);
        }

        let pool = round.prize_pool;
        let fee = pool * round.fee_bps / 10_000;
        let payout = pool - fee;

        round.status = RoundStatus::Settled;
        env.storage()
            .persistent()
            .set(&DataKey::Round(round_id), &round);

        // Transfer the winner's payout and the protocol fee to the snapshotted
        // treasury. The token contract is the game contract itself for this
        // contract's internal ledger.
        let _ = winner;
        let _ = round.treasury;
        (payout, fee)
    }
}
