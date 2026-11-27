use crate::*;

/// One of the card index lists (see `DataKey::CardAt` and friends).
pub(crate) enum Index {
    All,
    Genre(Genre),
    Artist(String),
    Year(u64),
    Decade(u64),
    Difficulty(u32),
    GenreDecade(Genre, u64),
}

impl Index {
    fn of(env: &Env, card: &Card) -> [Index; 4] {
        [
            Index::All,
            Index::Genre(card.genre),
            Index::Artist(ascii_lower_string(env, &card.artist)),
            Index::Year(card.year),
        ]
    }

    /// LF-267: the filter indexes a card belongs to (decade, difficulty and
    /// the combined genre+decade index). Maintained alongside `of`.
    fn filters_of(card: &Card) -> [Index; 3] {
        [
            Index::Decade(card.year / 10 * 10),
            Index::Difficulty(card.difficulty),
            Index::GenreDecade(card.genre, card.year / 10 * 10),
        ]
    }

    fn count_key(&self) -> DataKey {
        match self {
            Index::All => DataKey::CardsCount,
            Index::Genre(g) => DataKey::GenreCardCount(*g),
            Index::Artist(a) => DataKey::ArtistCardCount(a.clone()),
            Index::Year(y) => DataKey::YearCardCount(*y),
            Index::Decade(d) => DataKey::DecadeCardCount(*d),
            Index::Difficulty(d) => DataKey::DifficultyCardCount(*d),
            Index::GenreDecade(g, d) => DataKey::GenreDecadeCardCount((*g, *d)),
        }
    }

    fn at_key(&self, i: u32) -> DataKey {
        match self {
            Index::All => DataKey::CardAt(i),
            Index::Genre(g) => DataKey::GenreCardAt((*g, i)),
            Index::Artist(a) => DataKey::ArtistCardAt((a.clone(), i)),
            Index::Year(y) => DataKey::YearCardAt((*y, i)),
            Index::Decade(d) => DataKey::DecadeCardAt((*d, i)),
            Index::Difficulty(d) => DataKey::DifficultyCardAt((*d, i)),
            Index::GenreDecade(g, d) => DataKey::GenreDecadeCardAt((*g, *d, i)),
        }
    }

    fn pos<'a>(&self, pos: &'a mut CardPos) -> &'a mut u32 {
        match self {
            Index::All => &mut pos.all,
            Index::Genre(_) => &mut pos.genre,
            Index::Artist(_) => &mut pos.artist,
            Index::Year(_) => &mut pos.year,
            Index::Decade(_) => &mut pos.decade,
            Index::Difficulty(_) => &mut pos.difficulty,
            Index::GenreDecade(_, _) => &mut pos.genre_decade,
        }
    }
}
pub(crate) fn ascii_lower_string(env: &Env, value: &String) -> String {
    let bytes = value.to_bytes();
    let mut buf = [0u8; 256];
    let len = bytes.len().min(256) as usize;
    for (i, item) in buf.iter_mut().enumerate().take(len) {
        let b = bytes.get(i as u32).unwrap();
        *item = b.to_ascii_lowercase();
    }
    String::from_bytes(env, &buf[..len])
}

pub(crate) fn ascii_lower_bytes(env: &Env, value: &String) -> Bytes {
    let bytes = value.to_bytes();
    let mut out = Bytes::new(env);
    for b in bytes.iter() {
        out.push_back(b.to_ascii_lowercase());
    }
    out
}

pub(crate) fn assert_clean_text(env: &Env, value: &String, err: Error) {
    let bytes = value.to_bytes();
    let len = bytes.len();
    for i in 0..len {
        let b = bytes.get(i).unwrap();
        let control = b < 0x20 || b == 0x7F;
        let edge_space =
            (i == 0 || i + 1 == len) && (b == b' ' || b == b'\t' || b == b'\n' || b == b'\r');
        if control || edge_space {
            panic_with_error!(env, err);
        }
    }
}

impl LyricsFlip {
    /// Unredacted catalogue read for admin paths (`update_card`,
    /// `remove_card`): `NonExistingCard` for soft-removed cards.
    pub(crate) fn read_catalogue_card(env: &Env, card_id: u64) -> Card {
        if Self::is_card_disabled(env, card_id) {
            panic_with_error!(env, Error::NonExistingCard);
        }
        Self::read_card(env, card_id)
    }

    /// LF-278: strips the answer fields from a card that a live round still
    /// references, so public catalogue reads can't map a live card to its
    /// answer.
    pub(crate) fn redact_if_live(env: &Env, mut card: Card) -> Card {
        if Self::card_has_live_round(env, card.card_id) {
            card.title = String::from_str(env, "");
            card.artist = String::from_str(env, "");
            card.year = 0;
        }
        card
    }

    /// LF-176: true when `remove_card` has soft-removed this card.
    pub(crate) fn is_card_disabled(env: &Env, card_id: u64) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::CardDisabled(card_id))
            .unwrap_or(false)
    }

    /// Raw card read for in-round paths (`next_card`, `submit_answer`,
    /// question building, round creation): a soft-removed card (LF-176) must
    /// stay readable so rounds that already drew it can finish and be graded.
    /// Panics `NonExistingCard` only when no stored card exists at all.
    pub(crate) fn read_card(env: &Env, card_id: u64) -> Card {
        let stored: Val = env
            .storage()
            .persistent()
            .get(&DataKey::Card(card_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard));
        let map: soroban_sdk::Map<soroban_sdk::Val, soroban_sdk::Val> =
            match soroban_sdk::Map::try_from_val(env, &stored) {
                Ok(m) => m,
                Err(_) => panic_with_error!(env, Error::NonExistingCard),
            };
        let card = if map.len() == 6 {
            let legacy = LegacyCard::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingCard));
            let card = Card::from(legacy);
            set_persistent(env, &DataKey::Card(card_id), &card);
            card
        } else {
            Card::try_from_val(env, &stored)
                .unwrap_or_else(|_| panic_with_error!(env, Error::NonExistingCard))
        };
        bump_persistent(env, &DataKey::Card(card_id));
        card
    }

    // ---- Internal helpers ----

    pub(crate) fn validate_card(env: &Env, card: &Card) {
        if card.title.is_empty() {
            panic_with_error!(env, Error::InvalidCardTitle);
        }
        if card.artist.is_empty() {
            panic_with_error!(env, Error::InvalidCardArtist);
        }
        assert_clean_text(env, &card.title, Error::InvalidCardTitle);
        assert_clean_text(env, &card.artist, Error::InvalidCardArtist);
        if card.lyrics.is_empty() {
            panic_with_error!(env, Error::InvalidCardLyrics);
        }
        if card.lyrics.len() > MAX_LYRICS_LEN {
            panic_with_error!(env, Error::LyricsTooLong);
        }
        let current_year = 1970 + env.ledger().timestamp() / SECONDS_PER_YEAR;
        if card.year < MIN_CARD_YEAR || card.year > current_year {
            panic_with_error!(env, Error::InvalidCardYear);
        }
        if !(1..=3).contains(&card.difficulty) {
            panic_with_error!(env, Error::InvalidCardDifficulty);
        }
    }

    /// Identity of a card for duplicate detection: sha256(title, 0x00, artist).
    pub(crate) fn card_key(env: &Env, card: &Card) -> BytesN<32> {
        let mut buf = ascii_lower_bytes(env, &card.title);
        buf.push_back(0);
        buf.append(&ascii_lower_bytes(env, &card.artist));
        env.crypto().sha256(&buf).into()
    }

    pub(crate) fn insert_card(env: &Env, card: Card) -> u64 {
        Self::validate_card(env, &card);
        let key = Self::card_key(env, &card);
        if env
            .storage()
            .persistent()
            .has(&DataKey::CardKey(key.clone()))
        {
            panic_with_error!(env, Error::DuplicateCard);
        }

        let card_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastCardId)
            .unwrap_or(0)
            + 1;
        env.storage().instance().set(&DataKey::LastCardId, &card_id);

        let card = Card { card_id, ..card };
        let mut pos = CardPos {
            all: 0,
            genre: 0,
            artist: 0,
            year: 0,
            decade: 0,
            difficulty: 0,
            genre_decade: 0,
        };
        for index in Index::of(env, &card).iter() {
            *index.pos(&mut pos) = Self::index_push(env, index, card_id);
        }
        // LF-267: maintain the filter indexes too.
        for index in Index::filters_of(&card).iter() {
            *index.pos(&mut pos) = Self::index_push(env, index, card_id);
        }
        set_persistent(env, &DataKey::CardPos(card_id), &pos);
        set_persistent(env, &DataKey::CardKey(key), &card_id);
        set_persistent(env, &DataKey::Card(card_id), &card);

        CardAdded {
            card_id,
            genre: card.genre,
        }
        .publish(env);
        card_id
    }

    pub(crate) fn read_card_pos(env: &Env, card_id: u64) -> CardPos {
        env.storage()
            .persistent()
            .get(&DataKey::CardPos(card_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard))
    }

    pub(crate) fn index_len(env: &Env, index: &Index) -> u32 {
        env.storage()
            .persistent()
            .get(&index.count_key())
            .unwrap_or(0)
    }

    pub(crate) fn index_get(env: &Env, index: &Index, i: u32) -> u64 {
        env.storage()
            .persistent()
            .get(&index.at_key(i))
            .unwrap_or_else(|| panic_with_error!(env, Error::NonExistingCard))
    }

    pub(crate) fn page_cards(env: &Env, index: &Index, start: u32, limit: u32) -> Vec<Card> {
        let len = Self::index_len(env, index);
        let end = start.saturating_add(limit.min(MAX_PAGE_LIMIT)).min(len);
        let mut out = Vec::new(env);
        for i in start..end {
            let card_id = Self::index_get(env, index, i);
            if !Self::is_card_disabled(env, card_id) {
                out.push_back(Self::read_card(env, card_id));
            }
        }
        out
    }

    /// Appends `card_id` and returns its position.
    pub(crate) fn index_push(env: &Env, index: &Index, card_id: u64) -> u32 {
        let len = Self::index_len(env, index);
        set_persistent(env, &index.at_key(len), &card_id);
        set_persistent(env, &index.count_key(), &(len + 1));
        len
    }

    /// Swap-removes the entry at `pos`, updating the position of the card
    /// that moves into the gap.
    pub(crate) fn index_remove(env: &Env, index: &Index, pos: u32) {
        let last = Self::index_len(env, index) - 1;
        if pos != last {
            let moved = Self::index_get(env, index, last);
            set_persistent(env, &index.at_key(pos), &moved);
            let mut moved_pos = Self::read_card_pos(env, moved);
            *index.pos(&mut moved_pos) = pos;
            set_persistent(env, &DataKey::CardPos(moved), &moved_pos);
        }
        env.storage().persistent().remove(&index.at_key(last));
        set_persistent(env, &index.count_key(), &last);
    }

    pub(crate) fn draw_cards(env: &Env, index: &Index, empty: Error) -> Vec<Card> {
        let limit = Self::index_len(env, index) as u64;
        if limit == 0 {
            panic_with_error!(env, empty);
        }
        let amount = Self::get_cards_per_round(env.clone()) as u64;
        let mut cards: Vec<Card> = Vec::new(env);
        for idx in Self::get_random_numbers(env, amount, limit, true).iter() {
            let card_id = Self::index_get(env, index, idx as u32);
            cards.push_back(Self::redact_if_live(env, Self::read_card(env, card_id)));
        }
        cards
    }

    /// LF-267: draws `amount` distinct card ids honouring `filter` and
    /// `difficulty`. The draw starts from the narrowest index that already
    /// satisfies part of the filter (genre+decade, decade, difficulty, genre
    /// or all cards) and rejects cards that fail the remaining checks, with a
    /// bounded number of retries. Every live matching card is reachable.
    pub(crate) fn draw_round_cards(
        env: &Env,
        filter: &RoundFilter,
        difficulty: Option<u32>,
        amount: u64,
    ) -> Vec<u64> {
        let decade = filter.decade.map(|d| d / 10 * 10);
        let source = match (filter.genre, decade, difficulty) {
            (Some(g), Some(d), _) => Index::GenreDecade(g, d),
            (None, Some(d), _) => Index::Decade(d),
            (None, None, Some(diff)) => Index::Difficulty(diff),
            (Some(g), None, _) => Index::Genre(g),
            (None, None, None) => Index::All,
        };
        let source_count = Self::index_len(env, &source);
        if source_count == 0 {
            if filter.genre.is_some() {
                panic_with_error!(env, Error::EmptyGenreCards);
            }
            panic_with_error!(env, Error::AmountExceedsLimit);
        }

        let mut cards: Vec<u64> = Vec::new(env);
        let mut attempts: u32 = 0;
        while (cards.len() as u64) < amount && attempts < MAX_FILTER_DRAW_ATTEMPTS {
            attempts += 1;
            let idx = env.prng().gen_range::<u64>(0..(source_count as u64)) as u32;
            let card_id = Self::index_get(env, &source, idx);
            if cards.contains(card_id) {
                continue;
            }
            let card = Self::read_card(env, card_id);
            let matches_decade = decade.map(|d| card.year / 10 * 10 == d).unwrap_or(true);
            let matches_difficulty = difficulty
                .map(|value| card.difficulty == value)
                .unwrap_or(true);
            if matches_decade && matches_difficulty {
                cards.push_back(card_id);
            }
        }

        if (cards.len() as u64) < amount {
            panic_with_error!(env, Error::AmountExceedsLimit);
        }
        cards
    }

    // ---- LF-176: card <-> live-round bookkeeping ----

    /// Registers `round_id` in the reverse index for `card_id`.
    pub(crate) fn add_live_round(env: &Env, card_id: u64, round_id: u64) {
        let key = DataKey::CardLiveRounds(card_id);
        let mut live: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(env));
        if !live.contains(round_id) {
            live.push_back(round_id);
            env.storage().persistent().set(&key, &live);
            bump_persistent(env, &key);
        }
    }

    /// Drops `round_id` from the reverse index for `card_id`, deleting the
    /// entry when no live rounds remain.
    pub(crate) fn remove_live_round(env: &Env, card_id: u64, round_id: u64) {
        let key = DataKey::CardLiveRounds(card_id);
        if let Some(mut live) = env.storage().persistent().get::<_, Vec<u64>>(&key) {
            if let Some(idx) = live.first_index_of(round_id) {
                live.remove(idx);
                if live.is_empty() {
                    env.storage().persistent().remove(&key);
                } else {
                    env.storage().persistent().set(&key, &live);
                    bump_persistent(env, &key);
                }
            }
        }
    }

    /// Drops `round_id` from the reverse index of every card it references.
    pub(crate) fn clear_live_rounds(env: &Env, round_id: u64) {
        for card_id in Self::read_round_cards(env, round_id).iter() {
            Self::remove_live_round(env, card_id, round_id);
        }
    }

    pub(crate) fn card_has_live_round(env: &Env, card_id: u64) -> bool {
        let live: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::CardLiveRounds(card_id))
            .unwrap_or(Vec::new(env));
        for round_id in live.iter() {
            if Self::is_round_live(env, round_id) {
                return true;
            }
        }
        false
    }
}

pub(crate) fn get_cards_count(env: Env) -> u64 {
    LyricsFlip::index_len(&env, &Index::All) as u64
}

pub(crate) fn get_genre_card_count(env: Env, genre: Genre) -> u32 {
    LyricsFlip::index_len(&env, &Index::Genre(genre))
}

pub(crate) fn get_card(env: Env, card_id: u64) -> Card {
    LyricsFlip::redact_if_live(&env, LyricsFlip::read_catalogue_card(&env, card_id))
}

pub(crate) fn get_cards(env: Env, caller: Address, start: u32, limit: u32) -> Vec<Card> {
    LyricsFlip::assert_admin(&env, &caller);
    LyricsFlip::page_cards(&env, &Index::All, start, limit)
}

pub(crate) fn get_cards_by_genre(
    env: Env,
    caller: Address,
    genre: Genre,
    start: u32,
    limit: u32,
) -> Vec<Card> {
    LyricsFlip::assert_admin(&env, &caller);
    LyricsFlip::page_cards(&env, &Index::Genre(genre), start, limit)
}

pub(crate) fn get_cards_of_genre(env: Env, genre: Genre) -> Vec<Card> {
    LyricsFlip::draw_cards(&env, &Index::Genre(genre), Error::EmptyGenreCards)
}

pub(crate) fn get_cards_of_artist(env: Env, artist: String) -> Vec<Card> {
    let normalized = ascii_lower_string(&env, &artist);
    LyricsFlip::draw_cards(&env, &Index::Artist(normalized), Error::ArtistCardsIsZero)
}

pub(crate) fn get_cards_of_a_year(env: Env, year: u64) -> Vec<Card> {
    LyricsFlip::draw_cards(&env, &Index::Year(year), Error::EmptyYearCards)
}

pub(crate) fn add_card(env: Env, caller: Address, card: Card) -> u64 {
    caller.require_auth();
    LyricsFlip::assert_admin(&env, &caller);
    LyricsFlip::insert_card(&env, card)
}

pub(crate) fn add_cards(env: Env, caller: Address, cards: Vec<Card>) -> Vec<u64> {
    caller.require_auth();
    LyricsFlip::assert_admin(&env, &caller);
    if cards.len() > MAX_CARDS_PER_BATCH {
        panic_with_error!(env, Error::BatchTooLarge);
    }
    let mut ids: Vec<u64> = Vec::new(&env);
    for card in cards.iter() {
        ids.push_back(LyricsFlip::insert_card(&env, card));
    }
    ids
}

pub(crate) fn update_card(env: Env, caller: Address, card_id: u64, card: Card) {
    caller.require_auth();
    LyricsFlip::assert_admin(&env, &caller);
    let old = LyricsFlip::read_catalogue_card(&env, card_id);
    LyricsFlip::validate_card(&env, &card);

    let answer_fields_changed =
        old.title != card.title || old.artist != card.artist || old.year != card.year;
    if answer_fields_changed && LyricsFlip::card_has_live_round(&env, card_id) {
        panic_with_error!(env, Error::CardInActiveRound);
    }

    let new_key = LyricsFlip::card_key(&env, &card);
    if let Some(existing) = env
        .storage()
        .persistent()
        .get::<_, u64>(&DataKey::CardKey(new_key.clone()))
    {
        if existing != card_id {
            panic_with_error!(env, Error::DuplicateCard);
        }
    }

    let mut pos = LyricsFlip::read_card_pos(&env, card_id);
    for index in Index::of(&env, &old).iter().skip(1) {
        LyricsFlip::index_remove(&env, index, *index.pos(&mut pos));
    }
    env.storage()
        .persistent()
        .remove(&DataKey::CardKey(LyricsFlip::card_key(&env, &old)));

    let card = Card { card_id, ..card };
    for index in Index::of(&env, &card).iter().skip(1) {
        *index.pos(&mut pos) = LyricsFlip::index_push(&env, index, card_id);
    }
    set_persistent(&env, &DataKey::CardPos(card_id), &pos);
    set_persistent(&env, &DataKey::CardKey(new_key), &card_id);
    set_persistent(&env, &DataKey::Card(card_id), &card);

    CardUpdated {
        card_id,
        genre: card.genre,
    }
    .publish(&env);
}

pub(crate) fn remove_card(env: Env, caller: Address, card_id: u64) {
    caller.require_auth();
    LyricsFlip::assert_admin(&env, &caller);
    let card = LyricsFlip::read_catalogue_card(&env, card_id);

    let mut pos = LyricsFlip::read_card_pos(&env, card_id);
    for index in Index::of(&env, &card).iter() {
        LyricsFlip::index_remove(&env, index, *index.pos(&mut pos));
    }
    env.storage()
        .persistent()
        .remove(&DataKey::CardKey(LyricsFlip::card_key(&env, &card)));
    env.storage()
        .persistent()
        .remove(&DataKey::CardPos(card_id));
    set_persistent(&env, &DataKey::CardDisabled(card_id), &true);

    CardRemoved { card_id }.publish(&env);
}
