import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for LyricsFlip end-to-end tests (LF-066, LF-215).
 *
 * The suite runs against the local dev server. Wallet interactions are mocked
 * via a fake StellarWalletsKit injected in `e2e/fixtures.ts`, so no real
 * keypair or funded account is required. Set E2E_BASE_URL to point the suite
 * at a deployed environment (e.g. testnet) instead of the local server.
 *
 * A global setup (e2e/global-setup.ts) starts a local Stellar quickstart
 * container, deploys and seeds the lyricsflip contracts, and exposes the
 * resulting contract IDs to the specs via environment variables. Set
 * E2E_SKIP_GLOBAL_SETUP=1 to skip the container when running against a
 * deployed environment.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: process.env.E2E_SKIP_GLOBAL_SETUP
    ? undefined
    : require.resolve('./e2e/global-setup.ts'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});