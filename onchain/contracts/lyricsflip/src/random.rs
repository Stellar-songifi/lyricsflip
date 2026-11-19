use crate::*;

impl LyricsFlip {
    /// LF-011 fix: partial Fisher-Yates shuffle — O(limit) with no
    /// deduplication loop.
    ///
    /// Builds an index array `[0, 1, …, limit-1]`, performs a single-pass
    /// Fisher-Yates shuffle seeded from `(seed, ledger_sequence,
    /// ledger_timestamp)`, and returns the first `amount` elements. This
    /// replaces the old SHA-256 + dedup loop which had coupon-collector
    /// worst-case cost when `amount ≈ limit`.
    ///
    /// `for_index`: when `false` the results are shifted by +1 so they
    /// become 1-based card IDs instead of 0-based array indices (mirrors the
    /// same offset used by the old implementation).
    pub(crate) fn get_random_numbers(
        env: &Env,
        seed: u64,
        amount: u64,
        limit: u64,
        for_index: bool,
    ) -> Vec<u64> {
        if amount > limit {
            panic_with_error!(env, Error::AmountExceedsLimit);
        }
        if limit == 0 {
            panic_with_error!(env, Error::LimitMustBeGreaterThanZero);
        }

        // Build a compact index array [0..limit).
        let mut indices: Vec<u64> = Vec::new(env);
        for i in 0..limit {
            indices.push_back(i);
        }

        // Seed an LCG from the on-chain entropy.
        // Using the same 32-byte SHA-256 block as before, but only once.
        let sequence = env.ledger().sequence() as u64;
        let timestamp = env.ledger().timestamp();
        let mut buf = [0u8; 32];
        buf[0..8].copy_from_slice(&seed.to_be_bytes());
        buf[8..16].copy_from_slice(&sequence.to_be_bytes());
        buf[16..24].copy_from_slice(&timestamp.to_be_bytes());
        // last 8 bytes left zero — distinguishes this from per-iteration hashes
        let bytes = Bytes::from_array(env, &buf);
        let hash = env.crypto().sha256(&bytes).to_array();
        let mut rng_state = u64::from_be_bytes([
            hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7],
        ]);

        // Partial Fisher-Yates: shuffle only the first `amount` positions.
        // Iteration i swaps indices[i] with a random position in [i, limit).
        let mut i: u32 = 0;
        while (i as u64) < amount {
            // LCG step (Numerical Recipes constants, same as shuffle_strings).
            rng_state = rng_state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let range = limit - (i as u64);
            let j = (i as u64) + (rng_state % range);
            // swap indices[i] and indices[j]
            let a = indices.get(i).unwrap();
            let b = indices.get(j as u32).unwrap();
            indices.set(i, b);
            indices.set(j as u32, a);
            i += 1;
        }

        // Collect the first `amount` shuffled indices, applying the +1 offset
        // when the caller wants 1-based card IDs.
        let mut result: Vec<u64> = Vec::new(env);
        for k in 0..(amount as u32) {
            let v = indices.get(k).unwrap();
            result.push_back(if for_index { v } else { v + 1 });
        }
        result
    }
}
