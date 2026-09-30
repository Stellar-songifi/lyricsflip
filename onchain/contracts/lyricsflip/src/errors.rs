use soroban_sdk::contracterror;

/// Contract error codes. Clients (see `frontend/src/lib/stellar/errors.ts`)
/// map on the numeric values, so they are part of the public ABI: never
/// renumber or reuse a code. New variants take the next free number, and the
/// table in `onchain/README.md` plus `test::error_codes_are_stable` must be
/// updated alongside.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Defensive only: `__constructor` runs exactly once per deployment, so
    /// this is unreachable in practice.
    AlreadyInitialized = 1,
    NonExistingRound = 2,
    RoundAlreadyStarted = 3,
    NonExistingGenre = 4,
    RoundAlreadyJoined = 5,
    InvalidCardsPerRound = 6,
    ArtistCardsIsZero = 7,
    EmptyYearCards = 8,
    EmptyGenreCards = 9,
    RoundNotStarted = 10,
    RoundCompleted = 11,
    NotAParticipant = 12,
    AlreadyReady = 13,
    NotAuthorized = 14,
    AmountExceedsLimit = 15,
    LimitMustBeGreaterThanZero = 16,
    RoundNotReady = 18,
    RoundAlreadyFinalized = 19,
    NotEnoughDistinctCards = 20,
    NonExistingCard = 17,
    RoundCancelled = 20,
    RoundFull = 21,
    InvalidMaxPlayers = 22,
    NftContractNotSet = 23,
    MilestoneNotReached = 24,
    MilestoneAlreadyClaimed = 25,
    InvalidCardTitle = 26,
    InvalidCardArtist = 27,
    InvalidCardLyrics = 28,
    InvalidCardYear = 29,
    LyricsTooLong = 30,
    DuplicateCard = 31,
    BatchTooLarge = 32,
    NotPendingOwner = 33,
}
