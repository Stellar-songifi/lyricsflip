/**
 * E2E flow 2: Create lobby → join from second context → both ready → play → finalize.
 *
 * Uses two browser contexts (player A creates, player B joins). Both contexts
 * have the wallet mock injected so neither needs a browser extension.
 *
 * Part of Issue #907 / LF-321.
 */

import { test, expect, TEST_ADDRESS, TEST_SECRET, buildWalletMockScript } from './fixtures';
import { Keypair } from '@stellar/stellar-sdk';

// Generate a second keypair for player B
const PLAYER_B_KP = Keypair.random();
const PLAYER_B_ADDRESS = PLAYER_B_KP.publicKey();
const PLAYER_B_SECRET = PLAYER_B_KP.secret();

test.describe('Multiplayer lobby flow', () => {
  test('host creates lobby, guest joins, both ready, play through, finalize', async ({
    browser,
  }) => {
    // ── Context A (host / player A) ──────────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.addInitScript(buildWalletMockScript(TEST_ADDRESS, TEST_SECRET));

    // ── Context B (guest / player B) ────────────────────────────────────────
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.addInitScript(buildWalletMockScript(PLAYER_B_ADDRESS, PLAYER_B_SECRET));

    try {
      // ── 1. Player A connects and navigates to multiplayer ────────────────
      await pageA.goto('/');
      await pageA
        .getByRole('button', { name: /connect.*wallet|sign.*in/i })
        .first()
        .click();
      await expect(
        pageA.getByText(TEST_ADDRESS.slice(0, 6), { exact: false }),
      ).toBeVisible({ timeout: 15_000 });

      const multiBtn = pageA
        .getByRole('link', { name: /multiplayer|challenge|lobby/i })
        .or(pageA.getByRole('button', { name: /multiplayer|challenge|lobby/i }))
        .first();
      await multiBtn.click();
      await pageA.waitForURL(/multiplayer|lobby/i, { timeout: 15_000 });

      // ── 2. Player A creates a lobby ──────────────────────────────────────
      const createBtn = pageA
        .getByRole('button', { name: /create.*lobby|create.*round|new.*round/i })
        .first();
      await createBtn.click();

      // Pick a genre if prompted
      const genreBtn = pageA.getByRole('button', { name: /pop|hip.?hop|rock/i }).first();
      if (await genreBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await genreBtn.click();
      }

      // Confirm / submit
      const confirmBtn = pageA
        .getByRole('button', { name: /confirm|start|create/i })
        .first();
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      // Wait for the lobby/room page — it should contain a round ID or invite link
      await pageA.waitForURL(/multiplayer\/\w+|round\/\w+|lobby\/\w+/i, { timeout: 30_000 });
      const lobbyUrl = pageA.url();
      const roundIdMatch = /\/(\w{8,})(?:\/|$)/.exec(lobbyUrl);
      const roundId = roundIdMatch?.[1] ?? '';
      expect(roundId.length).toBeGreaterThan(0);

      // ── 3. Player B connects and joins via URL ───────────────────────────
      await pageB.goto('/');
      await pageB
        .getByRole('button', { name: /connect.*wallet|sign.*in/i })
        .first()
        .click();
      await expect(
        pageB.getByText(PLAYER_B_ADDRESS.slice(0, 6), { exact: false }),
      ).toBeVisible({ timeout: 15_000 });

      await pageB.goto(lobbyUrl);
      const joinBtn = pageB
        .getByRole('button', { name: /join/i })
        .first();
      if (await joinBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await joinBtn.click();
      }

      // ── 4. Both players mark themselves ready ────────────────────────────
      const readyBtnA = pageA.getByRole('button', { name: /ready/i }).first();
      const readyBtnB = pageB.getByRole('button', { name: /ready/i }).first();

      if (await readyBtnA.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await readyBtnA.click();
      }
      if (await readyBtnB.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await readyBtnB.click();
      }

      // ── 5. Play through cards on both contexts ───────────────────────────
      for (const page of [pageA, pageB]) {
        for (let i = 0; i < 10; i++) {
          const opt = page.locator('[data-testid="answer-option"], .answer-option').first()
            .or(page.getByRole('button', { name: /option|answer/i }).first());
          if (!(await opt.isVisible({ timeout: 5_000 }).catch(() => false))) break;
          await opt.click();
          await page.waitForTimeout(1000);
          const done = page.getByText(/score|result|finalize|game over|round complete/i);
          if (await done.isVisible().catch(() => false)) break;
        }
      }

      // ── 6. Finalize the round (player A) ────────────────────────────────
      const finalizeBtn = pageA.getByRole('button', { name: /finalize/i }).first();
      if (await finalizeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await finalizeBtn.click();
      }

      // ── 7. Both contexts see the result screen ───────────────────────────
      for (const page of [pageA, pageB]) {
        await expect(
          page.getByText(/score|result|pts|winner|round complete/i).first(),
        ).toBeVisible({ timeout: 25_000 });
      }
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
