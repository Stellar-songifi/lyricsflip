use soroban_sdk::{contracttype, Address, Vec};

/// Status of a wagered round.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RoundStatus {
    Open,
    Locked,
    Settled,
    Cancelled,
}

/// A wagered round with an escrowed pot.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Round {
    pub id: u64,
    pub creator: Address,
    pub token: Address,
    pub pot: i128,
    pub status: RoundStatus,
    pub winners: Vec<Address>,
    pub claimed: Vec<Address>,
}

/// Protocol configuration, owner-configurable.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub owner: Address,
    pub treasury: Address,
    /// Protocol fee in basis points (1 bps = 0.01%).
    pub fee_bps: u32,
}

/// Event emitted when a winner claims their share of the pot.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WinningsClaimed {
    pub round_id: u64,
    pub caller: Address,
    pub amount: i128,
    pub fee: i128,
}
