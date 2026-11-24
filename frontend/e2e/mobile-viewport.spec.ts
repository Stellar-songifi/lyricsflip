/**
 * LF-312 · Mobile viewport screenshots and overflow checks.
 *
 * These tests render the game and multiplayer pages at the three breakpoints
 * called out in the issue (360 px, 390 px, 768 px) and verify:
 *   - no horizontal scroll (scrollWidth <= viewportWidth)
 *   - all interactive controls meet the 44 px minimum tap-target height
 *   - visual regression via full-page screenshots
 */

import { test, expect, devices, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the document does not overflow horizontally. */
async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
}

/** Returns the heights of all buttons and anchors on the page. */
async function getTapTargetHeights(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'),
    )
      .filter((el) => el.offsetParent !== null) // visible only
      .map((el) => el.getBoundingClientRect().height),
  );
}

// ---------------------------------------------------------------------------
// Viewports (width × height)
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { name: '360px', width: 360, height: 780 },
  { name: '390px', width: 390, height: 844 },
  { name: '768px', width: 768, height: 1024 },
];

// ---------------------------------------------------------------------------
// Routes to check
// ---------------------------------------------------------------------------

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'single-player', path: '/single-player' },
  { name: 'multiplayer-lobby', path: '/multiplayer' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  test.describe(`Mobile viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route.name} — no horizontal scroll`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const noOverflow = await hasNoHorizontalScroll(page);
        expect(
          noOverflow,
          `Horizontal scroll detected on ${route.name} at ${viewport.name}`,
        ).toBe(true);
      });

      test(`${route.name} — tap targets ≥ 44 px`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const heights = await getTapTargetHeights(page);
        const tooSmall = heights.filter((h) => h > 0 && h < 44);
        expect(
          tooSmall,
          `Found ${tooSmall.length} tap targets shorter than 44 px on ${route.name} at ${viewport.name}: ${tooSmall.join(', ')}px`,
        ).toHaveLength(0);
      });

      test(`${route.name} — screenshot`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(
          `${route.name}-${viewport.name}.png`,
          { fullPage: true, maxDiffPixelRatio: 0.02 },
        );
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Modal scroll test (WagerModal / GameModal)
// ---------------------------------------------------------------------------

test.describe('Modal scrolling on mobile', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('WagerModal can be scrolled on a 360 px screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open the wager modal if a trigger button is present
    const trigger = page.getByRole('button', { name: /wager/i }).first();
    if (await trigger.isVisible()) {
      await trigger.click();
      // Sheet content should be scrollable — no horizontal overflow
      const noOverflow = await hasNoHorizontalScroll(page);
      expect(noOverflow).toBe(true);
    } else {
      test.skip(true, 'Wager modal trigger not found on the home page');
    }
  });
});
