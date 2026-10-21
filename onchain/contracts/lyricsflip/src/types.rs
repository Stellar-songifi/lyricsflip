use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

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
    pub difficulty: u32,
    pub lyrics: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyCard {
    pub card_id: u64,
    pub genre: Genre,
    pub artist: String,
    pub title: String,
    pub year: u64,
    pub lyrics: String,
}

impl From<LegacyCard> for Card {
    fn from(card: LegacyCard) -> Self {
        Self {
            card_id: card.card_id,
            genre: card.genre,
            artist: card.artist,
            title: card.title,
            year: card.year,
            difficulty: 2,
            lyrics: card.lyrics,
        }
    }
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundFilter {
    pub genre: Option<Genre>,
    /// The first year of a decade, for example 1990.
    pub decade: Option<u64>,
}

impl soroban_sdk::TryFromVal<soroban_sdk::Env, soroban_sdk::Val> for RoundFilter {
    type Error = soroban_sdk::ConversionError;
    fn try_from_val(env: &soroban_sdk::Env, val: &soroban_sdk::Val) -> Result<Self, Self::Error> {
        let map: soroban_sdk::Map<soroban_sdk::Symbol, soroban_sdk::Val> =
            soroban_sdk::Map::try_from_val(env, val)?;
        let genre_sym = soroban_sdk::Symbol::new(env, "genre");
        let decade_sym = soroban_sdk::Symbol::new(env, "decade");
        let genre = if let Some(v) = map.get(genre_sym) {
            Option::<Genre>::try_from_val(env, &v)?
        } else {
            None
        };
        let decade = if let Some(v) = map.get(decade_sym) {
            Option::<u64>::try_from_val(env, &v)?
        } else {
            None
        };
        Ok(RoundFilter { genre, decade })
    }
}

impl soroban_sdk::IntoVal<soroban_sdk::Env, soroban_sdk::Val> for RoundFilter {
    fn into_val(&self, env: &soroban_sdk::Env) -> soroban_sdk::Val {
        let mut map: soroban_sdk::Map<soroban_sdk::Symbol, soroban_sdk::Val> =
            soroban_sdk::Map::new(env);
        let genre_val: soroban_sdk::Val = self.genre.into_val(env);
        let decade_val: soroban_sdk::Val = self.decade.into_val(env);
        map.set(soroban_sdk::Symbol::new(env, "genre"), genre_val);
        map.set(soroban_sdk::Symbol::new(env, "decade"), decade_val);
        map.into_val(env)
    }
}

impl soroban_sdk::IntoVal<soroban_sdk::Env, soroban_sdk::Val> for &RoundFilter {
    fn into_val(&self, env: &soroban_sdk::Env) -> soroban_sdk::Val {
        (*self).clone().into_val(env)
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Round {
    pub round_id: u64,
    pub admin: Address,
    pub genre: Genre,
    pub wager_amount: i128,
    pub start_time: u64,
    pub is_started: bool,
    pub is_completed: bool,
    pub end_time: u64,
    pub next_card_index: u32,
    pub is_cancelled: bool,
    /// LF-158: Snapshotted answer window (seconds per card).
    pub answer_window: u64,
    /// LF-158: Snapshotted lobby timeout (seconds before non-admin can cancel).
    pub lobby_timeout: u64,
    /// LF-158: Snapshotted round duration (seconds from start to deadline).
    pub round_duration: u64,
    /// LF-162: true when the round requires an invite code to join.
    pub is_private: bool,
    /// LF-163: solo rounds skip OpenRounds and start in the same call.
    pub solo: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyRound {
    pub round_id: u64,
    pub admin: Address,
    pub genre: Genre,
    pub wager_amount: i128,
    pub start_time: u64,
    pub is_started: bool,
    pub is_completed: bool,
    pub end_time: u64,
    pub next_card_index: u32,
    pub is_cancelled: bool,
}

impl From<LegacyRound> for Round {
    fn from(r: LegacyRound) -> Self {
        Self {
            round_id: r.round_id,
            admin: r.admin,
            genre: r.genre,
            wager_amount: r.wager_amount,
            start_time: r.start_time,
            is_started: r.is_started,
            is_completed: r.is_completed,
            end_time: r.end_time,
            next_card_index: r.next_card_index,
            is_cancelled: r.is_cancelled,
            answer_window: 15,
            lobby_timeout: 600,
            round_duration: 300,
            is_private: false,
            solo: false,
        }
    }
}

/// Schema v3 round layout (pre LF-162/163): `Round` without `is_private` and
/// `solo`. `read_round` lazily re-encodes stored v3 entries as `Round`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundV3 {
    pub round_id: u64,
    pub admin: Address,
    pub genre: Genre,
    pub wager_amount: i128,
    pub start_time: u64,
    pub is_started: bool,
    pub is_completed: bool,
    pub end_time: u64,
    pub next_card_index: u32,
    pub is_cancelled: bool,
    pub answer_window: u64,
    pub lobby_timeout: u64,
    pub round_duration: u64,
}

impl From<RoundV3> for Round {
    fn from(r: RoundV3) -> Self {
        Self {
            round_id: r.round_id,
            admin: r.admin,
            genre: r.genre,
            wager_amount: r.wager_amount,
            start_time: r.start_time,
            is_started: r.is_started,
            is_completed: r.is_completed,
            end_time: r.end_time,
            next_card_index: r.next_card_index,
            is_cancelled: r.is_cancelled,
            answer_window: r.answer_window,
            lobby_timeout: r.lobby_timeout,
            round_duration: r.round_duration,
            is_private: false,
            solo: false,
        }
    }
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
    /// Enumerable index of all active admin addresses (LF-156).
    Admins,
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
    /// LF-162: preimage hash for private rounds. Present only if private.
    RoundInviteHash(u64),
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
    /// Address of the `lyricsflip-nft` contract used to mint rewards.
    NftContract,
    /// Whether a player has already claimed a milestone reward.
    MilestoneClaimed((Address, Milestone)),
    /// Global emergency-pause flag. While set, round creation/joining and
    /// reward claims are blocked; refund and cancel paths stay open.
    Paused,
    /// LF-141: Tracks the next card index per-player for a round.
    PlayerCardIndex((u64, Address)),
    /// LF-141: Ledger timestamp when a player drew a card in a round.
    PlayerCardStartedAt((u64, Address, u64)),
    /// LF-157: Stored storage schema version for migration hooks.
    SchemaVersion,
    /// LF-158: Owner-configured answer window in seconds per card.
    AnswerWindow,
    /// LF-158: Owner-configured lobby timeout in seconds.
    LobbyTimeout,
    /// LF-158: Owner-configured round duration override in seconds (or None/0 for dynamic).
    RoundDuration,
    /// LF-158: Owner-configured latency buffer added per card in seconds.
    RoundBuffer,
    /// LF-176: set (true) when a card is removed. The `Card` entry is kept so
    /// rounds that already drew the card can still read and grade it; the
    /// flag excludes the card from `get_card` and from all future draws.
    CardDisabled(u64),
    /// LF-176: ids of rounds whose `RoundCards` currently reference a card
    /// and that have not been finalized or cancelled. Guards `update_card`
    /// against changing answer fields mid-round.
    CardLiveRounds(u64),
    /// LF-175: number of public lobby rounds an address currently has open.
    /// Caps how many free (0-wager) lobbies one account can park in
    /// `OpenRounds`; decremented on start, cancel, and expiry.
    OpenRoundsOf(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AnswerResult {
    pub correct: bool,
    pub points: u64,
    pub correct_option: u32,
    pub next: Vec<Card>,
}
