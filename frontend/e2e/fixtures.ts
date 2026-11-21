/**
 * Playwright fixtures for LyricsFlip e2e tests.
 *
 * Provides:
 *  - `mockWallet`: injects a fake StellarWalletsKit into the page that signs
 *    with a fixed testnet keypair, so no real browser extension is needed.
 *  - `page`: extended with the mock wallet auto-applied before each test.
 *
 * Part of Issue #907 / LF-321.
 */

import { test as base, expect, type Page } from '@playwright/test';
import { Keypair } from '@stellar/stellar-sdk';

// ── Fixed test keypair (funded on testnet / local quickstart via global-setup) ──

export const TEST_SECRET =
  process.env.E2E_TEST_SECRET ??
  'SCZANGBA5RLGSRS53YDJWL5YWQJKMDPNQEMSGMTHMJKQKBEHWCBJ1JQV'; // local dev default

export const TEST_KEYPAIR = Keypair.fromSecret(TEST_SECRET);
export const TEST_ADDRESS = TEST_KEYPAIR.publicKey();

// ── Wallet mock script injected before every page load ──────────────────────

/**
 * JavaScript injected into the page (via addInitScript) that replaces the
 * real StellarWalletsKit with a lightweight fake that:
 *  - Signs XDR envelopes with the fixed keypair (no browser extension popup).
 *  - Immediately resolves getPublicKey() with TEST_ADDRESS.
 *
 * The script is evaluated in the page context, so it has access to globals
 * like `window.__stellarTestAddress` set via page.evaluate().
 */
export function buildWalletMockScript(address: string, secret: string): string {
  return `
(function () {
  // Lightweight stand-in for Keypair.sign from @stellar/stellar-sdk.
  // We import the SDK from the already-bundled app rather than re-bundling it.
  window.__e2eTestAddress = ${JSON.stringify(address)};
  window.__e2eTestSecret  = ${JSON.stringify(secret)};

  // Override StellarWalletsKit on the window so the StellarProvider picks
  // it up instead of the real kit.  The real kit constructor is called in
  // stellar-provider.tsx; we intercept by replacing the class.
  const OriginalKit = window.StellarWalletsKit;
  function FakeKit(opts) {
    this._opts = opts;
  }
  FakeKit.prototype.openModal    = function (cb) { cb?.({ address: window.__e2eTestAddress }); };
  FakeKit.prototype.getPublicKey = function ()   { return Promise.resolve(window.__e2eTestAddress); };
  FakeKit.prototype.signTransaction = function (xdrStr, opts) {
    // Dynamically import the SDK so we reuse the page's bundled copy.
    return import('@stellar/stellar-sdk').then(({ Keypair, Transaction, Networks }) => {
      const kp = Keypair.fromSecret(window.__e2eTestSecret);
      const passphrase = opts?.networkPassphrase ?? Networks.TESTNET;
      const tx = new Transaction(xdrStr, passphrase);
      tx.sign(kp);
      return { signedTxXdr: tx.toXDR(), signerAddress: kp.publicKey() };
    });
  };
  FakeKit.signTransaction = FakeKit.prototype.signTransaction;
  FakeKit.init = function (opts) { return Promise.resolve(new FakeKit(opts)); };

  window.StellarWalletsKit = FakeKit;
  if (typeof globalThis !== 'undefined') globalThis.StellarWalletsKit = FakeKit;
})();
`;
}

// ── Custom fixtures ──────────────────────────────────────────────────────────

type LyricsFlipFixtures = {
  /** A Page whose StellarWalletsKit is replaced with the test-keypair fake. */
  walletPage: Page;
};

export const test = base.extend<LyricsFlipFixtures>({
  walletPage: async ({ page }, use) => {
    // Inject the fake wallet before any JS in the page runs.
    await page.addInitScript(buildWalletMockScript(TEST_ADDRESS, TEST_SECRET));
    await use(page);
  },
});

export { expect };
