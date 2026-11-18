use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    RoundNotFound = 4,
    RoundNotSettled = 5,
    AlreadyClaimed = 6,
    NotAWinner = 7,
    InvalidFee = 8,
    NoWinners = 9,
    RoundAlreadyExists = 10,
    RoundAlreadySettled = 11,
    NotPendingAdmin = 12,
    Paused = 13,
    NotAdmin = 14,
    NotGame = 15,
}