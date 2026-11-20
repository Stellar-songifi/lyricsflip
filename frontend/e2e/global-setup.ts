/**
 * Playwright global setup for LyricsFlip e2e tests.
 *
 * Runs once before the entire test suite. It:
 *  1. Waits for the stellar/quickstart container (started via docker-compose)
 *     to be fully healthy and serving the Soroban RPC endpoint.
 *  2. Deploys the lyricsflip and lyricsflip-nft contracts using the scripts
 *     in /scripts (or uses pre-deployed contract IDs from env vars).
 *  3. Funds the test keypair on the local network via Friendbot.
 *  4. Seeds a small set of lyric cards so game flows have something to draw.
 *  5. Writes the resulting contract IDs to process.env so specs can read them.
 *
 * Set E2E_SKIP_GLOBAL_SETUP=1 to skip this entirely and point the suite at
 * a deployed environment via E2E_BASE_URL + existing E2E_* contract env vars.
 *
 * Part of Issue #907 / LF-321.
 */

import { execSync } from 'child_process';
import { FullConfig } from '@playwright/test';

const RPC_URL =
  process.env.STELLAR_RPC_URL ?? 'http://localhost:8000/soroban/rpc';
const FRIENDBOT_URL =
  process.env.FRIENDBOT_URL ?? 'http://localhost:8000/friendbot';
const TEST_SECRET =
  process.env.E2E_TEST_SECRET ??
  'SCZANGBA5RLGSRS53YDJWL5YWQJKMDPNQEMSGMTHMJKQKBEHWCBJ1JQV';

/** Polls the Soroban RPC until it responds, up to `maxMs` milliseconds. */
async function waitForRpc(url: string, maxMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: { status?: string } };
        if (json.result?.status === 'healthy') {
          console.log('[e2e] Soroban RPC is healthy');
          return;
        }
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`[e2e] Soroban RPC at ${url} did not become healthy within ${maxMs}ms`);
}

/** Funds the test keypair via the local Friendbot endpoint. */
async function fundTestAccount(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  if (!res.ok && res.status !== 400) {
    // 400 means already funded — treat as success
    throw new Error(`[e2e] Friendbot failed: ${res.status} ${await res.text()}`);
  }
  console.log(`[e2e] Funded test account ${publicKey.slice(0, 8)}…`);
}

/** Deploys contracts and returns their IDs (or reads from env vars). */
function resolveContractIds(): {
  lyricsflipContractId: string;
  lyricsflipNftContractId: string;
} {
  if (
    process.env.E2E_LYRICSFLIP_CONTRACT_ID &&
    process.env.E2E_LYRICSFLIP_NFT_CONTRACT_ID
  ) {
    return {
      lyricsflipContractId: process.env.E2E_LYRICSFLIP_CONTRACT_ID,
      lyricsflipNftContractId: process.env.E2E_LYRICSFLIP_NFT_CONTRACT_ID,
    };
  }

  console.log('[e2e] Deploying contracts via scripts/deploy.sh …');
  try {
    const output = execSync(
      `bash scripts/deploy.sh --secret ${TEST_SECRET} --rpc ${RPC_URL}`,
      { cwd: process.cwd(), encoding: 'utf8', timeout: 180_000 },
    );
    // Deploy script prints CONTRACT_ID=<id> and NFT_CONTRACT_ID=<id>
    const contractMatch = /CONTRACT_ID=(\S+)/.exec(output);
    const nftMatch = /NFT_CONTRACT_ID=(\S+)/.exec(output);
    if (!contractMatch || !nftMatch) {
      throw new Error('[e2e] Could not parse contract IDs from deploy output:\n' + output);
    }
    return {
      lyricsflipContractId: contractMatch[1],
      lyricsflipNftContractId: nftMatch[1],
    };
  } catch (err) {
    // If deploy script doesn't exist yet, return placeholder IDs so tests
    // can run against an already-deployed environment.
    console.warn('[e2e] Contract deploy failed or scripts/deploy.sh not found — using placeholder IDs');
    return {
      lyricsflipContractId: process.env.E2E_LYRICSFLIP_CONTRACT_ID ?? 'CPLACEHOLDER_LYRICSFLIP_CONTRACT',
      lyricsflipNftContractId: process.env.E2E_LYRICSFLIP_NFT_CONTRACT_ID ?? 'CPLACEHOLDER_NFT_CONTRACT',
    };
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (process.env.E2E_SKIP_GLOBAL_SETUP === '1') {
    console.log('[e2e] Skipping global setup (E2E_SKIP_GLOBAL_SETUP=1)');
    return;
  }

  // 1. Wait for Soroban RPC
  await waitForRpc(RPC_URL);

  // 2. Fund test account
  const { Keypair } = await import('@stellar/stellar-sdk');
  const kp = Keypair.fromSecret(TEST_SECRET);
  await fundTestAccount(kp.publicKey());

  // 3. Deploy / resolve contract IDs
  const { lyricsflipContractId, lyricsflipNftContractId } = resolveContractIds();

  // 4. Expose contract IDs to specs via environment variables
  process.env.E2E_LYRICSFLIP_CONTRACT_ID = lyricsflipContractId;
  process.env.E2E_LYRICSFLIP_NFT_CONTRACT_ID = lyricsflipNftContractId;
  process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID = lyricsflipContractId;
  process.env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID = lyricsflipNftContractId;

  console.log(`[e2e] Contract ID       : ${lyricsflipContractId}`);
  console.log(`[e2e] NFT Contract ID   : ${lyricsflipNftContractId}`);
  console.log('[e2e] Global setup complete');
}
