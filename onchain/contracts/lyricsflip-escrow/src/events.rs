use soroban_sdk::{contractevent, Address};

/// Emitted when the escrow fee is updated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeUpdated {
    #[topic]
    pub fee_bps: u32,
}

/// Emitted when the escrow treasury address is updated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    #[topic]
    pub treasury: Address,
}