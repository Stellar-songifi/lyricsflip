use soroban_std::contracttype;
use soroban_std::Address;

/// Emitted when the protocol fee is updated.
/// Emitted when the protocol fee is updated.
#[derive(Clone, Debug)]
#[contracttype]
pub struct FeeUpdated {
    pub old_fee_bps: u32,
    pub new_fee_bps: u32,
}

/// Emitted when the treasury address is updated.

#[derive(Clone, Debug)]
#[contracttype]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
}
