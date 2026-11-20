use soroban_std::contracttype;

/// Maximum allowed protocol fee in basis points (10.00%).
pub const MAX_FEE_BPS: u32 = 1,000;

/// Round lifecycle states.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum RoundStatus {
    Active,
    Settled,
    Cancelled,
}

/// A single game round.
///
/// The protocol fee is snapshotted on creation so later changes to the
/// contract-level fee do not affect live rounds.
#[derive(Clone, Debug)]
#[contracttype]
pub struct Round {
    pub round_id: u32,
    pub creator: Address,
    pub entry_fee: u32,
    pub prize_pool: u32,
    /// Protocol fee in basis-points, snapshotted at creation.
    pub fee_bps: u32,
    /// Treasury address snapshotted at creation.
    pub treasury: Address,
    pub status: RoundStatus,
}

/// Contract-level configuration.
#[derive(Clone, Debug)]
#[contracttype]
pub struct Config {
    pub owner: Address,
    pub fee_bps: u32,
    pub treasury: Address,
    pub round_counter: u32,
}
