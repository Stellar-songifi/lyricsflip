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

/// Protocol configuration, admin-configurable.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Game contract address — only the game contract is allowed to create
    /// and settle rounds.
    pub game: Address,
    /// Admin of this escrow contract — allowed to change the fee, treasury,
    /// upgrade the contract, and pause/unpause. Transferred via two-step.
    pub admin: Address,
    /// Pending admin awaiting acceptance of a two-step transfer.
    pub pending_admin: Option<Address>,
    pub treasury: Address,
    /// Protocol fee in basis points (1 bps = 0.01%).
    pub fee_bps: u32,
    /// Whether the contract is paused. Claims and refunds stay open while paused.
    pub paused: bool,
}