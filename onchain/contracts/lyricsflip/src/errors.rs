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
    /// No round exists with the given id.
    NonExistingRound = 2,
    /// The round has already been started and can no longer be joined.
    RoundAlreadyStarted = 3,
    /// No genre exists with the given id.
    NonExistingGenre = 4,
    /// The calling player has already joined this round.
    RoundAlreadyJoined = 5,
    /// `cards_per_round` must be greater than zero.
    InvalidCardsPerRound = 6,
    /// A round must contain at least one artist card.
    ArtistCardsIsZero = 7,
    /// The year-cards pool for the round is empty.
    EmptyYearCards = 8,
    /// The genre-cards pool for the round is empty.
    EmptyGenreCards = 9,
    /// The round has not been started yet.
    RoundNotStarted = 10,
    /// The round has already been completed.
    RoundCompleted = 11,
    /// The caller is not a participant of this round.
    NotAParticipant = 12,
    /// The calling player has already marked themselves ready.
    AlreadyReady = 13,
    /// The caller is not authorized to perform this action.
    NotAuthorized = 14,
    /// The requested amount exceeds the configured limit.
    AmountExceedsLimit = 15,
    /// The limit must be greater than zero.
    LimitMustBeGreaterThanZero = 16,
    /// No card exists with the given id.
    NonExistingCard = 17,
    /// The round is not ready to be started or finalized yet.
    RoundNotReady = 18,
    /// The round has already been finalized.
    RoundAlreadyFinalized = 19,
    /// The round does not contain enough distinct cards to start.
    NotEnoughDistinctCards = 20,
    /// The round is full and cannot accept more players.
    RoundFull = 21,
    /// `max_players` is invalid (e.g. zero or below the current player count).
    InvalidMaxPlayers = 22,
    /// The NFT contract address has not been configured.
    NftContractNotSet = 23,
    /// The milestone has not been reached yet.
    MilestoneNotReached = 24,
    /// The milestone reward has already been claimed.
    MilestoneAlreadyClaimed = 25,
    /// The card title is invalid (empty or too long).
    InvalidCardTitle = 26,
    /// The card artist is invalid (empty or too long).
    InvalidCardArtist = 27,
    /// The card lyrics are invalid (empty or too long).
    InvalidCardLyrics = 28,
    /// The card year is invalid.
    InvalidCardYear = 29,
    /// The card lyrics exceed the maximum allowed length.
    LyricsTooLong = 30,
    /// A card with the same content already exists in the round.
    DuplicateCard = 31,
    /// The batch of cards exceeds the maximum allowed size.
    BatchTooLarge = 32,
    /// The caller is not the pending owner of the contract.
    NotPendingOwner = 33,
    /// The deck has no cards left to draw; call `finalize_round`.
    NoMoreCards = 34,
    /// The round was cancelled and cannot accept further actions.
    RoundCancelled = 35,
    /// Card difficulty or round difficulty is not between 1 and 3.
    InvalidCardDifficulty = 36,
    /// Round decade is not a valid decade start year.
    InvalidDecade = 37,
    /// `submit_answer` was called before any card was drawn.
    NoActiveCard = 38,
    /// The player has already answered this card in this round.
    AlreadyAnswered = 39,
    /// The contract is paused by the owner (LF-174).
    Paused = 40,
    /// LF-158: The answer window is invalid (outside [MIN_ANSWER_WINDOW_SECONDS, MAX_ANSWER_WINDOW_SECONDS]).
    InvalidAnswerWindow = 41,
    /// LF-158: The lobby timeout is invalid (outside [MIN_LOBBY_TIMEOUT_SECONDS, MAX_LOBBY_TIMEOUT_SECONDS]).
    InvalidLobbyTimeout = 42,
    /// LF-158: The round duration or buffer is invalid.
    InvalidRoundDuration = 43,
    /// LF-176: `update_card` would change the title/artist/year of a card
    /// that an unfinalized round still references. Wait for the round to
    /// finalize (or be cancelled) before editing the card.
    CardInActiveRound = 44,
    /// LF-154: `set_max_players` got a value above `MAX_ROUND_PLAYERS`.
    MaxPlayersTooHigh = 45,
}
