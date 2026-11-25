/**
 * E2E flow 1: Wallet connect → solo round → result screen.
 *
 * Steps:
 *  1. Navigate to home, trigger wallet connect.
 *  2. Verify the connected wallet address is shown.
 *  3. Start a solo round (single-player mode).
 *  4. Answer every card until the round ends.
 *  5. Verify the result / score screen is displayed.
 *
 * The wallet is replaced by the fixed-keypair fake from fixtures.ts so no
 * real browser extension is required.
 *
 * Part of Issue #907 / LF-321.
 */

import { test, expect, TEST_ADDRESS } from './fixtures';

test.describe('Solo round flow', () => {
  test('connect wallet, play solo round, see result', async ({ walletPage: page }) => {
    // ── 1. Load home page ────────────────────────────────────────────────────
    await page.goto('/');
    await expect(page).toHaveTitle(/LyricsFlip/i);

    // ── 2. Connect wallet ────────────────────────────────────────────────────
    const connectBtn = page.getByRole('button', { name: /connect.*wallet|sign.*in/i }).first();
    await connectBtn.click();

    // The mock wallet resolves immediately — wait for the address to appear
    await expect(
      page.getByText(TEST_ADDRESS.slice(0, 6), { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Navigate to single-player / solo mode ─────────────────────────────
    const soloBtn = page
      .getByRole('link', { name: /solo|single.?player/i })
      .or(page.getByRole('button', { name: /solo|single.?player/i }))
      .first();
    await soloBtn.click();

    // Wait for the genre / game-mode selection screen
    await page.waitForURL(/solo|single/i, { timeout: 15_000 });

    // ── 4. Pick a genre and start ────────────────────────────────────────────
    // Click the first available genre card or button
    const genreBtn = page
      .getByRole('button', { name: /hip.?hop|pop|rock|jazz/i })
      .first();
    await genreBtn.click();

    // Click "Start" or "Play" to initiate the round
    const startBtn = page
      .getByRole('button', { name: /start|play|begin/i })
      .first();
    await startBtn.click();

    // ── 5. Play through the cards ────────────────────────────────────────────
    // Answer up to 10 cards (the default cards-per-round is typically 5)
    for (let i = 0; i < 10; i++) {
      // Wait for a question card to appear
      const optionLocator = page.getByRole('button', { name: /option|answer/i }).first()
        .or(page.locator('[data-testid="answer-option"]').first())
        .or(page.locator('.answer-option').first());

      const isVisible = await optionLocator.isVisible().catch(() => false);
      if (!isVisible) break;

      // Pick the first option
      await optionLocator.click();

      // Wait briefly for the next card or result to appear
      await page.waitForTimeout(1500);

      // If a result / score screen is shown, we're done
      const doneLocator = page.getByText(/score|result|well done|game over|round complete/i);
      if (await doneLocator.isVisible().catch(() => false)) break;
    }

    // ── 6. Assert the result screen is shown ────────────────────────────────
    await expect(
      page
        .getByText(/score|result|pts|well done|game over|round complete/i)
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
