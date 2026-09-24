import { createConfig } from '@/lib/stellar/stellarConfig';

export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID',
  'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID',
] as const;

/**
 * Returns the names of required env vars that have no value.
 * Used to render the "App is not configured" screen instead of
 * failing later with console warnings nobody sees.
 */
export function getMissingRequiredEnv(): string[] {
  const config = createConfig();
  const missing: string[] = [];
  if (!config.lyricsflipContractId) {
    missing.push('NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID');
  }
  if (!config.lyricsflipNftContractId) {
    missing.push('NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID');
  }
  return missing;
}
