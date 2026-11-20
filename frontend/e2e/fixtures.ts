/**
 * Shared Playwright fixtures for LyricsFlip e2e tests (LF-324).
 *
 * Wallet interactions are mocked by injecting a fake StellarWalletsKit into
 * the browser context before each test. This keeps tests hermetic: no real
 * keypair or funded account is needed.
 */
import { test as base, type Page } from '@playwright/test';

/** Inject a minimal wallet-kit stub before the page loads. */
async function injectWalletStub(page: Page) {
  await page.addInitScript(() => {
    // Minimal stub so the app can read a connected address without signing
    (window as any).__WALLET_KIT_STUB__ = {
      getAddress: async () => ({
        address: 'GBZTESTADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
      getNetwork: async () => ({
        networkPassphrase: 'Test SDF Network ; September 2015',
      }),
      signTransaction: async (tx: string) => ({ signedTxXdr: tx }),
    };
  });
}

export const test = base.extend<{ walletPage: Page }>({
  walletPage: async ({ page }, use) => {
    await injectWalletStub(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
