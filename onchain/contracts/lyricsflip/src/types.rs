use soroban_sdk::{contracttype, Address, BytesN, String};

/// Ported from `onchain/src/utils/types.cairo`. `felt252`/`ByteArray` fields
/// become `String`; Starknet's `u8` fields become `u32` since Soroban has no
/// native u8 contract type.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Card {
    pub card_id: u64,
    pub genre: Genre,
    pub artist: String,
    pub title: String,
    pub year: u64,
    pub lyrics: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlayerStats {
    pub total_rounds: u64,
    pub rounds_won: u64,
    pub current_streak: u64,
    pub max_streak: u64,
}

impl PlayerStats {
    pub fn zero() -> Self {
        PlayerStats {
            total_rounds: 0,
            rounds_won: 0,
            current_streak: 0,
            max_streak: 0,
        }
    }
}

/// Explicit discriminants make this a "simple" contracttype enum, which
/// soroban-sdk encodes as a plain `u32` (and the JS SDK decodes to a plain
/// `number`) rather than the `{tag, values}` shape used for enums with
/// associated data (see `Answer` below). Keep `frontend/src/lib/stellar/types.ts`'s
/// `GENRE_VALUES` ordering in sync with these values.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Genre {
    HipHop = 0,
    Pop = 1,
    Rock = 2,
    RnB = 3,
    Electronic = 4,
    Classical = 5,
    Jazz = 6,
    Country = 7,
    Blues = 8,
    Reggae = 9,
    Afrobeat = 10,
    Gospel = 11,
    Folk = 12,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Round {
    pub round_id: u64,
    pub admin: Address,
    pub genre: Genre,
    pub wager_amount: i128,
    pub start_time: u64,
    /// Per-round snapshot of the answer window (seconds), taken at creation
    /// time. Admins can change the configured default via `set_answer_window`
    /// (LF-307); each round keeps the window it was created with.
    pub answer_window: u64,
    pub is_started: bool,
    pub is_completed: bool,
    pub end_time: u64,
    pub next_card_index: u32,
    pub is_cancelled: bool,
}

/// NFT reward milestones a player can claim once each via `claim_reward`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Milestone {
    /// At least one round won.
    FirstWin = 0,
    /// A streak of at least 5 correct answers.
    Streak5 = 1,
    /// At least 10 rounds won.
    TenWins = 2,
}

/// Specifies what the player is asked to identify in a `QuestionCard`.
/// Using explicit discriminants keeps the on-chain ABI stable and makes the
/// JS SDK decode to a plain `number` (same encoding rule as `Genre`/`Role`).
/// Keep `frontend/src/lib/stellar/types.ts`'s `QUESTION_KIND_VALUES` in sync.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QuestionKind {
    Title = 0,
    Artist = 1,
    Year = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuestionCard {
    pub lyric: String,
    pub timestamp: u64,
    /// Which attribute the options represent (Title / Artist / Year).
    pub kind: QuestionKind,
    pub option_one: String,
    pub option_two: String,
    pub option_three: String,
    pub option_four: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Answer {
    Artist(String),
    Year(u64),
    Title(String),
}

/// Position of a card in the global, genre, artist and year indexes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CardPos {
    pub all: u32,
    pub genre: u32,
    pub artist: u32,
    pub year: u32,
}

/// Mirrors Cairo's single `ADMIN_ROLE` selector. Kept as an enum (instead of
/// dropping the parameter entirely) so `set_role`/`is_admin` keep the same
/// call shape as the original `ILyricsFlip` interface.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Admin = 0,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    /// Nominated by `transfer_ownership`, pending `accept_ownership`.
    PendingOwner,
    Admin(Address),
    RoundCount,
    CardsCount,
    CardsPerRound,
    Card(u64),
    /// Last card id handed out. Ids are never reused, so this differs from
    /// `CardsCount` (the number of live cards) once cards are removed.
    LastCardId,
    /// sha256(title, 0x00, artist) -> card id. Rejects duplicate cards.
    CardKey(BytesN<32>),
    /// Where a card sits in each of the index lists below (for O(1) removal).
    CardPos(u64),
    /// Indexes are stored as a count plus one entry per item, so adding a
    /// card costs the same no matter how large the index already is.
    CardAt(u32),
    GenreCardCount(Genre),
    GenreCardAt((Genre, u32)),
    ArtistCardCount(String),
    ArtistCardAt((String, u32)),
    YearCardCount(u64),
    YearCardAt((u64, u32)),
    Round(u64),
    RoundPlayers(u64),
    RoundCards(u64),
    RoundScores(u64),
    RoundAnswerTimes(u64),
    RoundCardStartedAt((u64, u64)),
    RoundPlayerAnswered((u64, Address, u64)),
    RoundFinalized(u64),
    PlayerStats(Address),
    RoundReady((u64, Address)),
    RoundReadyCount(u64),
    /// Ids of rounds that have been created but not yet started, in creation
    /// order. Backs the multiplayer lobby's `get_open_rounds` view.
    OpenRounds,
    /// Global cap on players per round (owner-configurable).
    MaxPlayers,
    /// Ledger timestamp at which a round was created; drives the lobby timeout.
    RoundCreatedAt(u64),
    /// Admin-configured answer window (seconds) for newly created rounds.
    AnswerWindow,
    /// Address of the `lyricsflip-nft` contract used to mint rewards.
    NftContract,
    /// Whether a player has already claimed a milestone reward.
    MilestoneClaimed((Address, Milestone)),
}
