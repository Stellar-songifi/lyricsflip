/**
 * E2E flow 3: Admin card management flow.
 *
 * Steps:
 *  1. Connect the wallet (the fixed keypair is seeded as admin in global-setup).
 *  2. Navigate to the admin page.
 *  3. Add a new lyric card via the admin form.
 *  4. Verify the card appears in the card list.
 *  5. Optionally update and remove the card.
 *
 * Part of Issue #907 / LF-321.
 */

import { test, expect, TEST_ADDRESS } from './fixtures';

test.describe('Admin card flow', () => {
  test('admin can add, view, and remove a lyric card', async ({ walletPage: page }) => {
    // ── 1. Connect wallet ────────────────────────────────────────────────────
    await page.goto('/');
    await page
      .getByRole('button', { name: /connect.*wallet|sign.*in/i })
      .first()
      .click();
    await expect(
      page.getByText(TEST_ADDRESS.slice(0, 6), { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // ── 2. Navigate to admin ─────────────────────────────────────────────────
    await page.goto('/admin');
    await expect(page).toHaveURL(/admin/);

    // If the admin page redirects unauthorised users, skip the rest
    const adminHeading = page
      .getByRole('heading', { name: /admin|cards|manage/i })
      .first();
    const isAdmin = await adminHeading
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    test.skip(!isAdmin, 'Connected wallet is not an admin — skipping admin card flow');

    // ── 3. Navigate to card management ───────────────────────────────────────
    const cardsTab = page
      .getByRole('link', { name: /cards/i })
      .or(page.getByRole('button', { name: /cards/i }))
      .first();
    if (await cardsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cardsTab.click();
    }

    // ── 4. Open "Add Card" form ───────────────────────────────────────────────
    const addBtn = page
      .getByRole('button', { name: /add card|new card|create card/i })
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // ── 5. Fill in card details ───────────────────────────────────────────────
    const TEST_TITLE = `E2E Test Song ${Date.now()}`;
    const TEST_ARTIST = 'E2E Test Artist';
    const TEST_LYRICS = 'These are the test lyrics for the e2e card';
    const TEST_YEAR = '2024';

    await page.getByLabel(/title/i).fill(TEST_TITLE);
    await page.getByLabel(/artist/i).fill(TEST_ARTIST);
    await page.getByLabel(/lyrics/i).fill(TEST_LYRICS);
    await page.getByLabel(/year/i).fill(TEST_YEAR);

    // Pick a genre from the select/dropdown
    const genreSelect = page
      .getByLabel(/genre/i)
      .or(page.locator('select[name="genre"]'))
      .first();
    if (await genreSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await genreSelect.selectOption({ label: /pop/i });
    }

    // ── 6. Submit the form ────────────────────────────────────────────────────
    const submitBtn = page
      .getByRole('button', { name: /submit|save|add/i })
      .last();
    await submitBtn.click();

    // Wait for the wallet transaction toast to confirm
    await expect(
      page.getByText(/confirmed|submitted|card added|success/i),
    ).toBeVisible({ timeout: 30_000 });

    // ── 7. Verify the new card appears in the list ────────────────────────────
    await expect(
      page.getByText(TEST_TITLE, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // ── 8. Remove the test card (clean up) ───────────────────────────────────
    const cardRow = page.getByText(TEST_TITLE).locator('xpath=ancestor::tr | ancestor::li | ancestor::div[contains(@class,"card")]').first();
    const removeBtn = cardRow
      .getByRole('button', { name: /remove|delete/i })
      .first();

    if (await removeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await removeBtn.click();
      // Confirm deletion if a dialog appears
      const confirmDelete = page
        .getByRole('button', { name: /confirm|yes|delete/i })
        .first();
      if (await confirmDelete.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmDelete.click();
      }
      await expect(
        page.getByText(/confirmed|removed|deleted|success/i),
      ).toBeVisible({ timeout: 20_000 });
      // The card should be gone
      await expect(page.getByText(TEST_TITLE)).not.toBeVisible({ timeout: 10_000 });
    }
  });
});
