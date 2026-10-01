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
    NonExistingCard = 17,
    RoundNotReady = 18,
    RoundAlreadyFinalized = 19,
    NotEnoughDistinctCards = 20,
    RoundCancelled = 35,
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
    /// The calling player has already submitted an answer for this card in
    /// this round. A player may answer each card at most once. Prevents
    /// answer-farming and streak manipulation (LF-004).
    /// All cards in the round have been drawn; call `finalize_round` to
    /// complete the round. Replaces `RoundCompleted` in `next_card` so that
    /// the two states — deck exhausted vs round finalized — are distinct.
    NoMoreCards = 34,
    /// The calling player has already submitted an answer for this card in
    /// this round. A player may answer each card at most once.
    AlreadyAnswered = 35,
    NoActiveCard = 34,
}
