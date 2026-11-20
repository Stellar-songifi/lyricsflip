/**
 * Playwright global setup (LF-324).
 *
 * When E2E_SKIP_GLOBAL_SETUP is not set, this file is expected to start a
 * local Stellar quickstart container, deploy the contracts, and export their
 * IDs as NEXT_PUBLIC_* environment variables. For now it is a no-op stub:
 * set E2E_SKIP_GLOBAL_SETUP=1 to run the specs against a deployed environment
 * without container orchestration.
 */
export default async function globalSetup(): Promise<void> {
  // Full Stellar quickstart integration will be wired up once the contracts
  // CI pipeline exposes a stable deploy script (tracked in LF-321).
  // Until then, tests rely on mocked system calls and do not need a live RPC.
  if (!process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID) {
    process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID =
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  }
  if (!process.env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID) {
    process.env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID =
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  }
}
