use soroban_sdk::{contracttype, Address, Map, Vec};

/// Status of a wagered round.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RoundStatus {
    Open,
    Locked,
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
    pub owner: Address,
    pub treasury: Address,
    /// Protocol fee in basis points (1 bps = 0.01%).
    pub fee_bps: u32,
    /// Claim window in seconds for newly settled rounds.
    pub claim_deadline: u64,
}
