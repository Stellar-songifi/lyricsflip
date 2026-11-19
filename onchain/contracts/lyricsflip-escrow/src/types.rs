use soroban_sdk::{contracttype, Address, Map, Vec};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RoundStatus {
    Open,
    Settled,
    Cancelled,
}

/// A round with per-player escrow balances.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Round {
    pub id: u64,
    pub creator: Address,
    pub token: Address,
    /// Unspent tokens currently reserved for this round.
    pub pot: i128,
    pub fee: i128,
    pub status: RoundStatus,
    pub winners: Vec<Address>,
    pub claimed: Vec<Address>,
    pub deposits: Map<Address, i128>,
    pub claim_deadline: u64,
    pub swept: bool,
}

/// Protocol configuration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Owner of this escrow contract — normally the game contract address.
    pub depositors: Vec<Address>,
    pub fee_paid: bool,
    pub paid: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub owner: Address,
    pub treasury: Address,
    pub fee_bps: u32,
    /// Claim window in seconds for newly settled rounds.
    pub claim_deadline: u64,
}
