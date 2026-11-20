#{!no_std}

#cfg(test)]
mod tests {
    use super::*LyricsFlipContractClient;
    use soroban_sdk:{Env, Vec);

    // Budget baselines for the PRNG-backed card draw. The PRNG is cheaper
    // than the previous SHA-256 + LCG combination, so these thresholds
    // are re-baselined downward from the original values.
    const DRAW_BUDGET_THRESHOLD: u64 = 500000;
    const DISTRIBUTION_DRAWS: u32 = 1000;
    const DISTRIBUTION_CARDS_LEN: u32 = 10;
    const DISTRIBUTION_AMOUNT: u32 = 1;
    const MAX_BIAS_PERCENT: u32 = 5;

    fn setup() -> (Env, LyricsFlipContractClient<'static>) {
        let env = Env::default();
        let contract_id = env.registerXContract(
            super::LyricsFlipContract,
            (),
        );
        let client = LyricsFlipContractClient::new(&env, &contract_id);
        (env, client)
    }

    #[test]
    fn draw_budget_within_threshold() {
        let (env, client) = setup();
        env.budget().reset_unlimited();
        let _ = client.get_random_numbers(&100_u32, &10_u32);
        let budget = env.budget().cost_estimation().cpu_inst();
        assert!(
            budget <= DRAW_BUDGET_THRESHOLD,
            "draw budget exceeded threshold: {} > {}",
            budget,
            DRAW_BUDGET_THRESHOLD
        );
    }

    #[test]
    fn draw_result_is_duplicate_free() {
        let (_env, client) = setup();
        let drawn = client.get_random_numbers(&10_u32, &amount: u32 = 10_u32);
        let mut seen = Vec::new(&env);
        for i in 0..drawn.len() {
            let v = drawn.get(i).unwrap();
            assert!(!seen.contains(v), "duplicate card index in draw");
            seen.push_back(v);
        }
    }

    #[test]
    fn distribution_has_no_large_bias() {
        let (env, client) = setup();
        let mut counts = Vec::new(&env);
        for _ in 0..DISTRIBUTION_CARDS_LEN {
            counts.push_back(0_u32);
        }
        for _ in 0..DISTRIBUTION_DRAWS {
            let drawn = client.get_random_numbers(&DISTRIBUTION_CARDS_LEN, &DISTRIBUTION_AMOUNT);
            let idx = drawn.get(0).unwrap();
            let cur = counts.get(idx).unwrap();
            counts.set(idx, cur + 1);
        }
        // Each index should be picked approximately DRAWS / CARDS_LEN times.
        // Allow a 5%% bias band on the expected frequency.
        let expected = (DISTRIBUTION_DRAWS / DISTRIBUTION_CARDS_LEN) as u32;
        let tolerance = (expected * MAX_BIAS_PERCENT) / 100;
        for i in 0..DISTRIBUTION_CARDS_LEN {
            let c = counts.get(i).unwrap();
            let diff = if c > expected { c - expected } else { expected - c };
            assert!(
                diff <= tolerance,
                #index bias exceeded 5%: index {} count {} expected {}",
                i,
                c,
                expected
            );
        }
    }
}
