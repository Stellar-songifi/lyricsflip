#![no_std]

mod errors;
mod events;
mod types;

#[cfg(any(test, feature = "testutils"))]
pub mod testutils;

#[cfg(test)]
mod test;

pub use errors::Error;
pub use types::{Config, Round, RoundStatus};

use events::{Cancelled, Claimed, Deposited, EscrowRoundCreated, Locked, Refunded, Settled, Swept};
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Map, Vec};

const CONFIG: soroban_sdk::Symbol = symbol_short!("CONFIG");
const ROUND: soroban_sdk::Symbol = symbol_short!("ROUND");
const BPS_DENOM: i128 = 10_000;
const DEFAULT_CLAIM_DEADLINE: u64 = 90 * 24 * 60 * 60;
const LIFETIME_THRESHOLD: u32 = 30 * 24 * 60 * 60;
const BUMP_AMOUNT: u32 = 30 * 24 * 60 * 60;

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialise the escrow owner, treasury, fee, and default claim window.
    pub fn initialize(
        env: Env,
        owner: Address,
        treasury: Address,
        fee_bps: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&CONFIG) {
            return Err(Error::AlreadyInitialized);
        }
        if fee_bps > BPS_DENOM as u32 {
            return Err(Error::InvalidFee);
        }
        env.storage().instance().set(
            &CONFIG,
            &Config {
                owner,
                treasury,
                fee_bps,
                claim_deadline: DEFAULT_CLAIM_DEADLINE,
            },
        );
        bump_instance(&env);
        Ok(())
    }

    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        if fee_bps > BPS_DENOM as u32 {
            return Err(Error::InvalidFee);
        }
        config.fee_bps = fee_bps;
        env.storage().instance().set(&CONFIG, &config);
        bump_instance(&env);
        Ok(())
    }

    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        config.treasury = treasury;
        env.storage().instance().set(&CONFIG, &config);
        bump_instance(&env);
        Ok(())
    }

    /// Set the claim window for rounds settled after this update.
    pub fn set_claim_deadline(env: Env, seconds: u64) -> Result<(), Error> {
        if seconds == 0 {
            return Err(Error::InvalidAmount);
        }
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        config.claim_deadline = seconds;
        env.storage().instance().set(&CONFIG, &config);
        bump_instance(&env);
        Ok(())
    }

    /// Register a round whose initial pot has already been transferred here.
    pub fn create_round(
        env: Env,
        round_id: u64,
        creator: Address,
        token: Address,
        pot: i128,
    ) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.owner.require_auth();
        if pot < 0 {
            return Err(Error::InvalidAmount);
        }
        if env.storage().persistent().has(&(ROUND, round_id)) {
            return Err(Error::RoundAlreadyExists);
        }

        let mut deposits = Map::new(&env);
        if pot > 0 {
            deposits.set(creator.clone(), pot);
        }
        let round = Round {
            id: round_id,
            creator,
            token: token.clone(),
            pot,
            fee: 0,
            status: RoundStatus::Open,
            winners: Vec::new(&env),
            claimed: Vec::new(&env),
            deposits,
            claim_deadline: 0,
            swept: false,
        };
        env.storage().persistent().set(&(ROUND, round_id), &round);
        bump_round(&env, round_id);
        EscrowRoundCreated {
            round_id,
            token,
            pot,
        }
        .publish(&env);
        Ok(())
    }

    /// Deposit additional tokens while a round is open.
    pub fn deposit(env: Env, caller: Address, round_id: u64, amount: i128) -> Result<(), Error> {
        caller.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open {
            return Err(Error::InvalidRoundTransition);
        }
        let client = token::Client::new(&env, &round.token);
        client.transfer(&caller, env.current_contract_address(), &amount);
        let existing = round.deposits.get(caller.clone()).unwrap_or(0);
        round.deposits.set(caller.clone(), existing + amount);
        round.pot += amount;
        Self::save_round(&env, &round);
        Deposited {
            round_id,
            player: caller,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Move an open round to Locked. Deposits are rejected after this point.
    pub fn lock_round(env: Env, round_id: u64) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.owner.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open {
            return Err(Error::InvalidRoundTransition);
        }
        round.status = RoundStatus::Locked;
        Self::save_round(&env, &round);
        Locked { round_id }.publish(&env);
        Ok(())
    }

    /// Settle a locked round. An empty winner list refunds everyone and cancels it.
    pub fn settle_round(env: Env, round_id: u64, winners: Vec<Address>) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.owner.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if winners.is_empty() {
            if round.status != RoundStatus::Open && round.status != RoundStatus::Locked {
                return Err(Error::InvalidRoundTransition);
            }
            return Self::cancel_loaded_round(&env, &mut round);
        }
        if round.status != RoundStatus::Locked {
            return Err(Error::InvalidRoundTransition);
        }

        let fee = round.pot * (config.fee_bps as i128) / BPS_DENOM;
        if fee > 0 {
            token::Client::new(&env, &round.token).transfer(
                &env.current_contract_address(),
                &config.treasury,
                &fee,
            );
        }
        round.fee = fee;
        round.status = RoundStatus::Settled;
        round.winners = winners.clone();
        round.claim_deadline = env.ledger().timestamp() + config.claim_deadline;
        Self::save_round(&env, &round);
        Settled {
            round_id,
            winners,
            fee,
            claim_deadline: round.claim_deadline,
        }
        .publish(&env);
        Ok(())
    }

    /// Refund one depositor while the round is still open.
    pub fn refund(env: Env, caller: Address, round_id: u64) -> Result<i128, Error> {
        caller.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open {
            return Err(Error::InvalidRoundTransition);
        }
        let amount = round.deposits.get(caller.clone()).ok_or(Error::NoDeposit)?;
        round.deposits.remove(caller.clone());
        round.pot -= amount;
        token::Client::new(&env, &round.token).transfer(
            &env.current_contract_address(),
            &caller,
            &amount,
        );
        Self::save_round(&env, &round);
        Refunded {
            round_id,
            player: caller,
            amount,
        }
        .publish(&env);
        Ok(amount)
    }

    /// Cancel an open or locked round and refund every depositor exactly once.
    pub fn cancel_round(env: Env, round_id: u64) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.owner.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Open && round.status != RoundStatus::Locked {
            return Err(Error::InvalidRoundTransition);
        }
        Self::cancel_loaded_round(&env, &mut round)
    }

    /// Claim a winner's share before the claim deadline.
    pub fn claim_winnings(env: Env, caller: Address, round_id: u64) -> Result<i128, Error> {
        caller.require_auth();
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Settled {
            return Err(Error::RoundNotSettled);
        }
        if round.swept {
            return Err(Error::AlreadySwept);
        }
        if env.ledger().timestamp() >= round.claim_deadline {
            return Err(Error::ClaimDeadlinePassed);
        }
        let winner_index = round
            .winners
            .iter()
            .position(|winner| winner == caller)
            .ok_or(Error::NotAWinner)? as i128;
        if round.claimed.iter().any(|claimed| claimed == caller) {
            return Err(Error::AlreadyClaimed);
        }

        let payout = Self::payout_for(&round, winner_index);
        round.claimed.push_back(caller.clone());
        Self::save_round(&env, &round);
        if payout > 0 {
            token::Client::new(&env, &round.token).transfer(
                &env.current_contract_address(),
                &caller,
                &payout,
            );
        }
        Claimed {
            round_id,
            player: caller,
            amount: payout,
        }
        .publish(&env);
        Ok(payout)
    }

    /// Sweep any unclaimed winner shares after the deadline to the treasury.
    pub fn sweep_unclaimed(env: Env, round_id: u64) -> Result<i128, Error> {
        let config = Self::load_config(&env)?;
        let mut round = Self::load_round(&env, round_id)?;
        if round.status != RoundStatus::Settled {
            return Err(Error::RoundNotSettled);
        }
        if round.swept {
            return Err(Error::AlreadySwept);
        }
        if env.ledger().timestamp() < round.claim_deadline {
            return Err(Error::ClaimDeadlinePassed);
        }

        let distributable = round.pot - round.fee;
        let mut claimed_total = 0i128;
        for claimed in round.claimed.iter() {
            let index = round
                .winners
                .iter()
                .position(|winner| winner == claimed)
                .ok_or(Error::NotAWinner)? as i128;
            claimed_total += Self::payout_for(&round, index);
        }
        let remaining = distributable - claimed_total;
        if remaining <= 0 {
            return Err(Error::NothingToSweep);
        }
        token::Client::new(&env, &round.token).transfer(
            &env.current_contract_address(),
            &config.treasury,
            &remaining,
        );
        round.swept = true;
        Self::save_round(&env, &round);
        Swept {
            round_id,
            amount: remaining,
        }
        .publish(&env);
        Ok(remaining)
    }

    pub fn get_round(env: Env, round_id: u64) -> Result<Round, Error> {
        Self::load_round(&env, round_id)
    }

    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::load_config(&env)
    }

    fn cancel_loaded_round(env: &Env, round: &mut Round) -> Result<(), Error> {
        let mut refunded_amount = 0i128;
        let token_client = token::Client::new(env, &round.token);
        for (player, amount) in round.deposits.iter() {
            if amount > 0 {
                token_client.transfer(&env.current_contract_address(), &player, &amount);
                refunded_amount += amount;
                Refunded {
                    round_id: round.id,
                    player,
                    amount,
                }
                .publish(env);
            }
        }
        round.deposits = Map::new(env);
        round.pot = 0;
        round.status = RoundStatus::Cancelled;
        Self::save_round(env, round);
        Cancelled {
            round_id: round.id,
            refunded_amount,
        }
        .publish(env);
        Ok(())
    }

    fn payout_for(round: &Round, winner_index: i128) -> i128 {
        let distributable = round.pot - round.fee;
        let winner_count = round.winners.len() as i128;
        let base = distributable / winner_count;
        let remainder = distributable - base * winner_count;
        if winner_index < remainder {
            base + 1
        } else {
            base
        }
    }

    fn load_config(env: &Env) -> Result<Config, Error> {
        let config = env
            .storage()
            .instance()
            .get(&CONFIG)
            .ok_or(Error::NotInitialized)?;
        bump_instance(env);
        Ok(config)
    }

    fn load_round(env: &Env, round_id: u64) -> Result<Round, Error> {
        let round = env
            .storage()
            .persistent()
            .get(&(ROUND, round_id))
            .ok_or(Error::RoundNotFound)?;
        bump_round(env, round_id);
        Ok(round)
    }

    fn save_round(env: &Env, round: &Round) {
        env.storage().persistent().set(&(ROUND, round.id), round);
        bump_round(env, round.id);
    }
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

fn bump_round(env: &Env, round_id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&(ROUND, round_id), LIFETIME_THRESHOLD, BUMP_AMOUNT);
}
