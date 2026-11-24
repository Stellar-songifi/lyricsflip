/**
 * Home page smoke tests (LF-324).
 *
 * These specs verify the basic rendering of the home page and the
 * game-mode selection without a real wallet or Stellar network.
 */
import { test, expect } from './fixtures';

test.describe('Home page', () => {
  test('renders the game-mode selection', async ({ page }) => {
    await page.goto('/');
    // The welcome heading (or any visible copy)
    await expect(page.getByText(/CHOOSE YOUR PREFERRED GAME MODE/i)).toBeVisible();
  });

  test('shows Quick Game option', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Quick Game')).toBeVisible();
  });

  test('shows Wager (Single Player) option', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Wager \(Single Player\)/i)).toBeVisible();
  });

  test('shows Wager (Multi Player) option', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Wager \(Multi Player\)/i)).toBeVisible();
  });

  test('shows Try it / Practice button', async ({ page }) => {
    await page.goto('/');
    // The Practice mode button added by LF-326 (#912)
    await expect(page.getByRole('button', { name: /try it/i })).toBeVisible();
  });
});
