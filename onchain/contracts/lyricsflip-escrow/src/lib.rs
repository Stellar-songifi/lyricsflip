#![no_std]

mod errors;
mod types;

#[cfg(any(test, feature = "testutils"))]
pub mod testutils;
#[cfg(test)]
mod test;

pub use errors::Error;
pub use types::{Config, Round, RoundStatus};

use soroban_sdk::{contract, contractimpl, panic_with_error, symbol_short, token, Address, Env, Vec};

const CONFIG: soroban_sdk::Symbol = symbol_short!("CONFIG");
const ROUND: soroban_sdk::Symbol = symbol_short!("ROUND");
const DEPOSIT: soroban_sdk::Symbol = symbol_short!("DEPOSIT");
const BPS_DENOM: i128 = 10_000;
const TTL_THRESHOLD: u32 = 100;
const TTL_BUMP: u32 = 17_280 * 30;

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Atomic deployment-time initialization. There is intentionally no public
    /// initialize entry point: owner/treasury/fee must be bound to the WASM
    /// instance by Soroban's constructor invocation.
    pub fn __constructor(env: Env, owner: Address, treasury: Address, fee_bps: u32) {
        if env.storage().instance().has(&CONFIG) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if fee_bps > BPS_DENOM as u32 {
            panic_with_error!(&env, Error::InvalidFee);
        }
        env.storage().instance().set(&CONFIG, &Config { owner, treasury, fee_bps });
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    }

    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        if fee_bps > BPS_DENOM as u32 { return Err(Error::InvalidFee); }
        config.fee_bps = fee_bps;
        env.storage().instance().set(&CONFIG, &config);
        Ok(())
    }

    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        config.treasury = treasury;
        env.storage().instance().set(&CONFIG, &config);
        Ok(())
    }

    /// Creates an empty escrow round. Funds enter only through deposit, so a
    /// caller cannot register a pot that is not actually held by this contract.
    pub fn create_round(env: Env, round_id: u64, creator: Address, token: Address) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.owner.require_auth();
        if env.storage().persistent().has(&(ROUND, round_id)) { return Err(Error::RoundAlreadyExists); }
        let round = Round {
            id: round_id,
            creator,
            token,
            pot: 0,
            status: RoundStatus::Open,
            winners: Vec::new(&env),
            claimed: Vec::new(&env),
            depositors: Vec::new(&env),
            fee_paid: false,
            paid: 0,
        };
        Self::store_round(&env, round_id, &round);
        Ok(())
    }

    /// Transfers SEP-41 tokens from the authenticated depositor into escrow.
    /// The depositor key is tracked independently from the aggregate pot so a
    /// leave/cancel path can refund the exact stake rather than a derived share.
    pub fn deposit(env: Env, round_id: u64, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 { return Err(Error::InvalidAmount); }
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open { return Err(Error::RoundNotOpen); }
        let token_client = token::Client::new(&env, &round.token);
        token_client.transfer(&from, &env.current_contract_address(), &amount);
        let key = (DEPOSIT, (round_id, from.clone()));
        let previous: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let next = previous.checked_add(amount).ok_or(Error::InvalidAmount)?;
        env.storage().persistent().set(&key, &next);
        if previous == 0 { round.depositors.push_back(from); }
        round.pot = round.pot.checked_add(amount).ok_or(Error::InvalidAmount)?;
        Self::store_round(&env, round_id, &round);
        Ok(())
    }

    /// Owner-authorized exact refund used by game leave/cancel paths.
    pub fn refund(env: Env, round_id: u64, player: Address) -> Result<i128, Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open { return Err(Error::RoundNotOpen); }
        let key = (DEPOSIT, (round_id, player.clone()));
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount <= 0 { return Err(Error::NothingDeposited); }
        env.storage().persistent().remove(&key);
        round.pot = round.pot.checked_sub(amount).ok_or(Error::Insolvent)?;
        Self::store_round(&env, round_id, &round);
        token::Client::new(&env, &round.token).transfer(&env.current_contract_address(), &player, &amount);
        Ok(amount)
    }

    /// Refunds all listed players and closes a round with no winners.
    pub fn cancel_round(env: Env, round_id: u64, players: Vec<Address>) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open { return Err(Error::RoundNotOpen); }
        let client = token::Client::new(&env, &round.token);
        for player in players.iter() {
            let key = (DEPOSIT, (round_id, player.clone()));
            let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            if amount > 0 {
                env.storage().persistent().remove(&key);
                round.pot = round.pot.checked_sub(amount).ok_or(Error::Insolvent)?;
                client.transfer(&env.current_contract_address(), &player, &amount);
            }
        }
        round.status = RoundStatus::Cancelled;
        Self::store_round(&env, round_id, &round);
        Ok(())
    }

    pub fn settle_round(env: Env, round_id: u64, winners: Vec<Address>) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.owner.require_auth();
        if winners.is_empty() { return Err(Error::NoWinners); }
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open { return Err(Error::RoundAlreadySettled); }
        round.status = RoundStatus::Settled;
        round.winners = winners;
        Self::store_round(&env, round_id, &round);
        Ok(())
    }

    pub fn claim_winnings(env: Env, caller: Address, round_id: u64) -> Result<i128, Error> {
        caller.require_auth();
        let config = Self::load_config(&env)?;
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Settled { return Err(Error::RoundNotSettled); }
        let winner_index = round.winners.iter().position(|w| w == caller).ok_or(Error::NotAWinner)? as i128;
        if round.claimed.iter().any(|p| p == caller) { return Err(Error::AlreadyClaimed); }
        let winner_count = round.winners.len() as i128;
        let fee = if round.fee_paid { 0 } else { round.pot * config.fee_bps as i128 / BPS_DENOM };
        let distributable = round.pot - fee;
        let base = distributable / winner_count;
        let remainder = distributable - base * winner_count;
        let payout = base + if winner_index < remainder { 1 } else { 0 };
        let required = payout + fee;
        let balance = token::Client::new(&env, &round.token).balance(&env.current_contract_address());
        if balance < required || round.pot < required { return Err(Error::Insolvent); }
        round.claimed.push_back(caller.clone());
        round.pot -= required;
        round.paid += required;
        if fee > 0 { round.fee_paid = true; }
        Self::store_round(&env, round_id, &round);
        let client = token::Client::new(&env, &round.token);
        if payout > 0 { client.transfer(&env.current_contract_address(), &caller, &payout); }
        if fee > 0 { client.transfer(&env.current_contract_address(), &config.treasury, &fee); }
        env.events().publish((symbol_short!("claimed"), caller, round_id), payout);
        Ok(payout)
    }

    pub fn get_round(env: Env, round_id: u64) -> Result<Round, Error> { Self::load_round(&env, round_id) }
    pub fn get_config(env: Env) -> Result<Config, Error> { Self::load_config(&env) }
    pub fn get_deposit(env: Env, round_id: u64, player: Address) -> Result<i128, Error> {
        Self::load_round(&env, round_id)?;
        Ok(env.storage().persistent().get(&(DEPOSIT, (round_id, player))).unwrap_or(0))
    }

    fn load_config(env: &Env) -> Result<Config, Error> { env.storage().instance().get(&CONFIG).ok_or(Error::NotInitialized) }
    fn load_round(env: &Env, round_id: u64) -> Result<Round, Error> { env.storage().persistent().get(&(ROUND, round_id)).ok_or(Error::RoundNotFound) }
    fn store_round(env: &Env, round_id: u64, round: &Round) {
        env.storage().persistent().set(&(ROUND, round_id), round);
        env.storage().persistent().extend_ttl(&(ROUND, round_id), TTL_THRESHOLD, TTL_BUMP);
    }
}
