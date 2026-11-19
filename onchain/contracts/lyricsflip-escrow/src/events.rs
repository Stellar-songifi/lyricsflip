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
use soroban_sdk::{contractevent, Address, Vec};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRoundCreated {
    #[topic]
    pub round_id: u64,
    pub token: Address,
    pub pot: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    #[topic]
    pub round_id: u64,
    #[topic]
    pub player: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Locked {
    #[topic]
    pub round_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settled {
    #[topic]
    pub round_id: u64,
    pub winners: Vec<Address>,
    pub fee: i128,
    pub claim_deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub round_id: u64,
    #[topic]
    pub player: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cancelled {
    #[topic]
    pub round_id: u64,
    pub refunded_amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub round_id: u64,
    #[topic]
    pub player: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Swept {
    #[topic]
    pub round_id: u64,
    pub amount: i128,
}
