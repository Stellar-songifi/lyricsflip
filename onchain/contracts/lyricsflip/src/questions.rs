use crate::*;

impl LyricsFlip {
    // ---- build_question_card helpers ----

    pub(crate) fn build_title_question(env: &Env, card: Card, cards_count: u64) -> QuestionCard {
        let correct = card.title.clone();
        Self::build_options_question(
            env,
            card,
            cards_count,
            QuestionKind::Title,
            correct,
            |candidate: &Card| candidate.title.clone(),
        )
    }

    pub(crate) fn build_artist_question(env: &Env, card: Card, cards_count: u64) -> QuestionCard {
        let correct = card.artist.clone();
        Self::build_options_question(
            env,
            card,
            cards_count,
            QuestionKind::Artist,
            correct,
            |candidate: &Card| candidate.artist.clone(),
        )
    }

    /// Builds a multiple-choice card from the correct value plus three distinct
    /// distractor values drawn from the card catalogue.
    ///
    /// LF-010: instead of requesting a fixed 10 random ids (which panics with
    /// `AmountExceedsLimit` on small catalogues) and reseeding forever until 3
    /// distinct distractors show up (which burns the whole CPU budget when the
    /// catalogue has fewer than 4 distinct values), we walk the shuffled
    /// catalogue in bounded windows:
    ///
    /// * Each attempt inspects at most `min(10, cards_count)` candidates.
    /// * Same-genre cards are consulted first so the wrong options stay
    ///   plausible (they sound like the correct card).
    /// * Every card is examined at most once across all attempts, so the loop
    ///   always terminates; if fewer than 4 distinct values exist in the whole
    ///   catalogue the call fails with `NotEnoughDistinctCards` instead.
    pub(crate) fn build_options_question(
        env: &Env,
        card: Card,
        cards_count: u64,
        kind: QuestionKind,
        correct: String,
        get_value: impl Fn(&Card) -> String,
    ) -> QuestionCard {
        let candidates = Self::distractor_candidate_ids(env, &card, cards_count);
        let total = candidates.len() as u64;
        let sample = core::cmp::min(MAX_DISTRACTOR_SAMPLE, total);
        let max_attempts = if sample == 0 {
            0
        } else {
            total.div_ceil(sample)
        };

        let mut false_answers: Vec<String> = Vec::new(env);
        let mut attempt: u64 = 0;
        while false_answers.len() < 3 && attempt < max_attempts {
            let start = attempt * sample;
            let mut seen: u64 = 0;
            while false_answers.len() < 3 && seen < sample {
                let id = candidates.get((start + seen) as u32).unwrap();
                let value = get_value(&Self::read_card(env, id));
                let norm_value = ascii_lower_string(env, &value);
                let norm_correct = ascii_lower_string(env, &correct);
                if norm_value != norm_correct && !Self::contains_string(&false_answers, &value) {
                    false_answers.push_back(value);
                }
                seen += 1;
            }
            attempt += 1;
        }
        if false_answers.len() < 3 {
            panic_with_error!(env, Error::NotEnoughDistinctCards);
        }

        let mut options: Vec<String> = Vec::new(env);
        options.push_back(correct);
        for answer in false_answers.iter() {
            options.push_back(answer.clone());
        }

        let shuffled = Self::shuffle_strings(env, options);

        QuestionCard {
            lyric: card.lyrics.clone(),
            timestamp: env.ledger().timestamp(),
            kind,
            option_one: shuffled.get(0).unwrap(),
            option_two: shuffled.get(1).unwrap(),
            option_three: shuffled.get(2).unwrap(),
            option_four: shuffled.get(3).unwrap(),
        }
    }

    /// Ordered card ids used to pick distractors for `card`: same-genre cards
    /// (shuffled with the PRNG) first so wrong options stay plausible, then
    /// every remaining card. Each card appears exactly once, so a question can
    /// always be answered — or fail with `NotEnoughDistinctCards` —
    /// without ever looping.
    pub(crate) fn distractor_candidate_ids(env: &Env, card: &Card, cards_count: u64) -> Vec<u64> {
        let genre_index = Index::Genre(card.genre);
        let genre_len = Self::index_len(env, &genre_index) as u64;

        let mut candidates: Vec<u64> = Vec::new(env);

        if genre_len > 0 {
            let sample_len = core::cmp::min(genre_len, 6);
            let indices = Self::get_random_numbers(env, sample_len, genre_len, true);
            for idx in indices.iter() {
                candidates.push_back(Self::index_get(env, &genre_index, idx as u32));
            }
        }

        if candidates.len() < 4 && cards_count > candidates.len() as u64 {
            let needed = core::cmp::min(cards_count, 10);
            let shuffled_all = Self::get_random_numbers(env, needed, cards_count, false);
            for id in shuffled_all.iter() {
                if !candidates.contains(id) {
                    candidates.push_back(id);
                }
            }
        }
        candidates
    }

    /// Year distractors: pick 6 random offsets in the range [-5, +5] \ {0},
    /// deduplicate, and take the first 3. Year options are stored as their
    /// decimal string representation so they fit into the same `Vec<String>`
    /// shuffle as Title and Artist questions.
    pub(crate) fn build_year_question(env: &Env, card: Card) -> QuestionCard {
        // LF-268: shuffle the offsets with the contract PRNG.
        let offsets: [i64; 10] = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
        let mut shuffled_offsets = offsets;
        let mut j = 10usize;
        while j > 1 {
            j -= 1;
            let rand_idx = env.prng().gen_range::<u64>(0..(j as u64 + 1)) as usize;
            shuffled_offsets.swap(j, rand_idx);
        }

        let correct_year = card.year as i64;
        // LF-160: clamp distractors to [MIN_CARD_YEAR, current_year] so a
        // question never offers an impossible year. Widen the offset tier when
        // clamping leaves fewer than 3 distinct values, and fall back to a
        // deterministic sweep of the valid range as a last resort.
        let current_year = 1970 + env.ledger().timestamp() / SECONDS_PER_YEAR;
        let min_year = MIN_CARD_YEAR as i64;
        let max_year = current_year as i64;

        let mut false_years: Vec<String> = Vec::new(env);

        let try_push = |year: i64, out: &mut Vec<String>| -> bool {
            if year < min_year || year > max_year || year == correct_year {
                return false;
            }
            let year_str = Self::u64_to_string(env, year as u64);
            if Self::contains_string(out, &year_str) {
                return false;
            }
            out.push_back(year_str);
            true
        };

        // Tier 1: original ±1..5, seeded shuffle preserved for determinism.
        for &offset in shuffled_offsets.iter() {
            if false_years.len() >= 3 {
                break;
            }
            let _ = try_push(correct_year + offset, &mut false_years);
        }

        // Tier 2: ±6..15.
        let tier2: [i64; 20] = [
            6, -6, 7, -7, 8, -8, 9, -9, 10, -10, 11, -11, 12, -12, 13, -13, 14, -14, 15, -15,
        ];
        for &offset in tier2.iter() {
            if false_years.len() >= 3 {
                break;
            }
            let _ = try_push(correct_year + offset, &mut false_years);
        }

        // Tier 3: ±16..50.
        let mut tier3_offset: i64 = 16;
        while tier3_offset <= 50 && false_years.len() < 3 {
            let _ = try_push(correct_year + tier3_offset, &mut false_years);
            if false_years.len() >= 3 {
                break;
            }
            let _ = try_push(correct_year - tier3_offset, &mut false_years);
            tier3_offset += 1;
        }

        // Fallback: deterministic sweep of the valid range.
        if false_years.len() < 3 {
            let mut y = min_year;
            while y <= max_year && false_years.len() < 3 {
                let _ = try_push(y, &mut false_years);
                y += 1;
            }
        }

        let correct_str = Self::u64_to_string(env, card.year);
        let mut options: Vec<String> = Vec::new(env);
        options.push_back(correct_str);
        for y in false_years.iter() {
            options.push_back(y.clone());
        }

        let shuffled = Self::shuffle_strings(env, options);

        QuestionCard {
            lyric: card.lyrics.clone(),
            timestamp: env.ledger().timestamp(),
            kind: QuestionKind::Year,
            option_one: shuffled.get(0).unwrap(),
            option_two: shuffled.get(1).unwrap(),
            option_three: shuffled.get(2).unwrap(),
            option_four: shuffled.get(3).unwrap(),
        }
    }

    /// Converts a `u64` year value to its decimal string representation.
    /// Soroban's `no_std` environment has no format!/write! macros, so we
    /// build the string manually by repeated division.
    pub(crate) fn u64_to_string(env: &Env, mut n: u64) -> String {
        if n == 0 {
            return String::from_str(env, "0");
        }
        // Collect digits in reverse.
        let mut digits: [u8; 20] = [0u8; 20];
        let mut len = 0usize;
        while n > 0 {
            digits[len] = b'0' + (n % 10) as u8;
            n /= 10;
            len += 1;
        }
        // Reverse into a fixed-size array and build a `&str`.
        let mut buf: [u8; 20] = [0u8; 20];
        for i in 0..len {
            buf[i] = digits[len - 1 - i];
        }
        // SAFETY: all bytes are ASCII digits.
        let s = core::str::from_utf8(&buf[..len]).unwrap_or("0");
        String::from_str(env, s)
    }

    pub(crate) fn contains_string(v: &Vec<String>, target: &String) -> bool {
        for item in v.iter() {
            if item == *target {
                return true;
            }
        }
        false
    }

    /// LF-268: Fisher-Yates shuffle over a small (4-element) options list
    /// using the contract PRNG.
    pub(crate) fn shuffle_strings(env: &Env, arr: Vec<String>) -> Vec<String> {
        let mut result = arr;
        let mut j = result.len();
        while j > 1 {
            j -= 1;
            let rand_idx = env.prng().gen_range::<u64>(0..(j as u64 + 1)) as u32;
            if j != rand_idx {
                let a = result.get(j).unwrap();
                let b = result.get(rand_idx).unwrap();
                result.set(j, b);
                result.set(rand_idx, a);
            }
        }
        result
    }
    pub(crate) fn correct_option(env: &Env, question: &QuestionCard, choice: &Answer) -> u32 {
        let matches = |option: &String| match choice {
            Answer::Title(value) | Answer::Artist(value) => option == value,
            Answer::Year(value) => option == &Self::u64_to_string(env, *value),
        };
        let options = [
            &question.option_one,
            &question.option_two,
            &question.option_three,
            &question.option_four,
        ];
        for (index, option) in options.iter().enumerate() {
            if matches(option) {
                return (index + 1) as u32;
            }
        }
        0
    }
}

pub(crate) fn get_question(env: Env, caller: Address, round_id: u64) -> QuestionCard {
    caller.require_auth();
    if !LyricsFlip::is_round_player(&env, round_id, &caller) {
        panic_with_error!(env, Error::NotAParticipant);
    }
    let round = LyricsFlip::read_round(&env, round_id);
    if !round.is_started {
        panic_with_error!(env, Error::RoundNotStarted);
    }
    if round.next_card_index == 0 {
        panic_with_error!(env, Error::NoActiveCard);
    }
    let current_index = round.next_card_index - 1;
    let round_cards = LyricsFlip::read_round_cards(&env, round_id);
    let card_id = round_cards
        .get(current_index)
        .unwrap_or_else(|| panic_with_error!(env, Error::NoMoreCards));
    let card = LyricsFlip::read_card(&env, card_id);
    let kind = QuestionKind::Title;
    LyricsFlip::build_question_card(env, card, kind)
}

pub(crate) fn build_question_card(env: Env, card: Card, kind: QuestionKind) -> QuestionCard {
    let cards_count = LyricsFlip::index_len(&env, &Index::All) as u64;

    match kind {
        QuestionKind::Title => LyricsFlip::build_title_question(&env, card, cards_count),
        QuestionKind::Artist => LyricsFlip::build_artist_question(&env, card, cards_count),
        QuestionKind::Year => LyricsFlip::build_year_question(&env, card),
    }
}
