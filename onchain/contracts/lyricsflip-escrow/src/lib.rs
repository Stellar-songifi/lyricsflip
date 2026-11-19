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

use soroban_sdk::{
    contract, contractevent, contractimpl, symbol_short, token, Address, BytesN, Env, Vec,
};
use events::{Cancelled, Claimed, Deposited, EscrowRoundCreated, Locked, Refunded, Settled, Swept};
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Map, Vec};

const CONFIG: soroban_sdk::Symbol = symbol_short!("CONFIG");
/// Storage key for the paused flag (instance storage).
const PAUSED: soroban_sdk::Symbol = symbol_short!("PAUSED");
/// Storage key prefix for per-round data (persistent storage).
const ROUND: soroban_sdk::Symbol = symbol_short!("ROUND");
const BPS_DENOM: i128 = 10_000;
const DEFAULT_CLAIM_DEADLINE: u64 = 90 * 24 * 60 * 60;
const LIFETIME_THRESHOLD: u32 = 30 * 24 * 60 * 60;
const BUMP_AMOUNT: u32 = 30 * 24 * 60 * 60;
use soroban_sdk::{contract, contractimpl, panic_with_error, symbol_short, token, Address, Env, Vec};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// Emitted when the protocol fee is updated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeUpdated {
    #[topic]
    pub fee_bps: u32,
}

/// Emitted when the treasury address is updated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    #[topic]
    pub treasury: Address,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
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
    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /// One-time initialisation.
    ///
    /// * `game`     – address of the game contract; the only caller allowed to
    ///               create or settle rounds.
    /// * `admin`    – address allowed to manage fee, treasury, upgrade, pause
    ///               and admin transfer.
    /// * `treasury` – address that receives the protocol fee on each payout.
    /// * `fee_bps`  – protocol fee in basis points (0–10 000).
    /// Initialise the escrow owner, treasury, fee, and default claim window.
    pub fn initialize(
        env: Env,
        game: Address,
        admin: Address,
        treasury: Address,
        fee_bps: u32,
    ) -> Result<(), Error> {
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
        env.storage().instance().set(
            &CONFIG,
            &Config {
                game,
                admin,
                pending_admin: None,
                treasury,
                fee_bps,
                claim_deadline: DEFAULT_CLAIM_DEADLINE,
            },
        );
        env.storage().instance().set(&PAUSED, &false);
        bump_instance(&env);
        Ok(())
        env.storage().instance().set(&CONFIG, &Config { owner, treasury, fee_bps });
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    }

    // -----------------------------------------------------------------------
    // Admin (admin role)
    // -----------------------------------------------------------------------

    /// Update the protocol fee.  Requires the admin address to auth.
    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.admin.require_auth();
        if fee_bps > BPS_DENOM as u32 {
            return Err(Error::InvalidFee);
        }
        config.fee_bps = fee_bps;
        env.storage().instance().set(&CONFIG, &config);
        FeeUpdated { fee_bps }.publish(&env);
        Ok(())
    }

    /// Update the treasury address.  Requires the admin address to auth.
    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.owner.require_auth();
        if fee_bps > BPS_DENOM as u32 { return Err(Error::InvalidFee); }
        config.fee_bps = fee_bps;
        env.storage().instance().set(&CONFIG, &config);
        bump_instance(&env);
        Ok(())
    }

    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.admin.require_auth();
        config.treasury = treasury.clone();
        env.storage().instance().set(&CONFIG, &config);
        TreasuryUpdated { treasury }.publish(&env);
        Ok(())
    }

    /// Upgrade the contract WASM.  Requires the admin address to auth.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.admin.require_auth();
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// Pause round creation.  Claims and refunds remain available.
    /// Requires the admin address to auth.
    pub fn pause(env: Env) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.admin.require_auth();
        env.storage().instance().set(&PAUSED, &true);
        Ok(())
    }

    /// Resume round creation.  Requires the admin address to auth.
    pub fn unpause(env: Env) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.admin.require_auth();
        env.storage().instance().set(&PAUSED, &false);
        Ok(())
    }

    /// Begin a two-step admin transfer.  Requires the current admin to auth.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        config.admin.require_auth();
        config.pending_admin = Some(new_admin);
        env.storage().instance().set(&CONFIG, &config);
        Ok(())
    }

    /// Complete a two-step admin transfer.  Requires the pending admin to auth.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let mut config = Self::load_config(&env)?;
        let pending = config.pending_admin.clone().ok_or(Error::NotPendingAdmin)?;
        pending.require_auth();
        config.admin = pending;
        config.pending_admin = None;
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

    // -----------------------------------------------------------------------
    // Round management (owner-gated)
    // -----------------------------------------------------------------------

    /// Register an escrow pot for a new round.
    ///
    /// Only the game contract (the `game`) may call this.  Callers must
    /// transfer `pot` tokens to this contract's address before calling.
    ///
    /// * `round_id` – id of the matching on-chain round in the game contract.
    /// * `creator`  – address of the round creator in the game contract.
    /// * `token`    – SEP-41 token contract address used for the pot.
    /// * `pot`      – amount (in the token's base units) held in escrow.
    /// Register a round whose initial pot has already been transferred here.
    pub fn create_round(
        env: Env,
        round_id: u64,
        creator: Address,
        token: Address,
        pot: i128,
    ) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.game.require_auth();

        if Self::is_paused(&env) {
            return Err(Error::Paused);
        }

        // Prevent overwriting an existing round.
        if env
            .storage()
            .persistent()
            .has(&(ROUND, round_id))
        {
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
        EscrowRoundCreated { round_id, token, pot }.publish(&env);
        Ok(())
    }

    /// Record the winners of a round and mark it as settled.
    ///
    /// Only the game contract (the `game`) may call this.  After settlement
    /// each winner may call `claim_winnings`.
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
        client.transfer(&caller, &env.current_contract_address(), &amount);
        let existing = round.deposits.get(caller.clone()).unwrap_or(0);
        round.deposits.set(caller.clone(), existing + amount);
        round.pot += amount;
        Self::save_round(&env, &round);
        Deposited { round_id, player: caller, amount }.publish(&env);
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
    pub fn settle_round(
        env: Env,
        round_id: u64,
        winners: Vec<Address>,
    ) -> Result<(), Error> {
        let config = Self::load_config(&env)?;
        config.game.require_auth();

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
        Refunded { round_id, player: caller, amount }.publish(&env);
        Ok(amount)
    }

    /// Cancel an open or locked round and refund every depositor exactly once.
    pub fn cancel_round(env: Env, round_id: u64) -> Result<(), Error> {
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
        Claimed { round_id, player: caller, amount: payout }.publish(&env);
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
        Swept { round_id, amount: remaining }.publish(&env);
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
                Refunded { round_id: round.id, player, amount }.publish(env);
            }
        }
        round.deposits = Map::new(env);
        round.pot = 0;
        round.status = RoundStatus::Cancelled;
        Self::save_round(env, round);
        Cancelled { round_id: round.id, refunded_amount }.publish(env);
        Ok(())
    }

    fn payout_for(round: &Round, winner_index: i128) -> i128 {
        let distributable = round.pot - round.fee;
        let winner_count = round.winners.len() as i128;
        let base = distributable / winner_count;
        let remainder = distributable - base * winner_count;
        if winner_index < remainder { base + 1 } else { base }
    }

    fn load_config(env: &Env) -> Result<Config, Error> {
        let config = env.storage().instance().get(&CONFIG).ok_or(Error::NotInitialized)?;
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

    fn is_paused(env: &Env) -> bool {
        env.storage().instance().get(&PAUSED).unwrap_or(false)
    }
    fn load_config(env: &Env) -> Result<Config, Error> { env.storage().instance().get(&CONFIG).ok_or(Error::NotInitialized) }
    fn load_round(env: &Env, round_id: u64) -> Result<Round, Error> { env.storage().persistent().get(&(ROUND, round_id)).ok_or(Error::RoundNotFound) }
    fn store_round(env: &Env, round_id: u64, round: &Round) {
        env.storage().persistent().set(&(ROUND, round_id), round);
        env.storage().persistent().extend_ttl(&(ROUND, round_id), TTL_THRESHOLD, TTL_BUMP);
    }

    fn save_round(env: &Env, round: &Round) {
        env.storage().persistent().set(&(ROUND, round.id), round);
        bump_round(env, round.id);
    }
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

fn bump_round(env: &Env, round_id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&(ROUND, round_id), LIFETIME_THRESHOLD, BUMP_AMOUNT);
}
