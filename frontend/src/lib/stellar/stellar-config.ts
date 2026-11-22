// Replaces `frontend/src/lib/dojo/dojoConfig.ts`. Dojo-only concepts with no
// Stellar equivalent (Torii URL, Relay URL, burner master address/private
// key, account class hash) are dropped; Soroban contract IDs replace the
// Dojo world manifest (`manifest_dev.json`).
//
// Contract IDs default to `deployments/testnet.json`, which the
// `contracts-deploy` workflow updates on every `contracts-v*` tag (LF-110).
// Env vars still take precedence for local or custom deployments.

import testnetDeployment from '../../../../deployments/testnet.json';
import { env } from '@/env';

const getEnvVar = (name: string, defaultValue = ''): string => {
  if (typeof window !== 'undefined') {
    return window.__ENV?.[name as keyof typeof window.__ENV] || defaultValue;
  }
  return process.env[name] || defaultValue;
};

declare global {
  interface Window {
    __ENV?: {
      NEXT_PUBLIC_STELLAR_RPC_URL?: string;
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE?: string;
      NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID?: string;
      NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID?: string;
      NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID?: string;
      NEXT_PUBLIC_WAGERING_ENABLED?: string;
    };
  }
}

export interface StellarConfig {
  rpcUrl: string;
  networkPassphrase: string;
  lyricsflipContractId: string;
  lyricsflipNftContractId: string;
  /** LF-303: escrow contract that holds wagers and pays out winnings. */
  lyricsflipEscrowContractId: string;
  /**
   * LF-303: wager/claim UI stays hidden until escrow is wired end to end
   * (LF-256). Requires `NEXT_PUBLIC_WAGERING_ENABLED=true` and an escrow id.
   */
  wageringEnabled: boolean;
}

export const createConfig = (): StellarConfig => ({
  rpcUrl: getEnvVar(
    'NEXT_PUBLIC_STELLAR_RPC_URL',
    env.NEXT_PUBLIC_STELLAR_RPC_URL,
  ),
  networkPassphrase: getEnvVar(
    'NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE',
    env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  ),
  lyricsflipContractId: getEnvVar(
    'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID',
    env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID || testnetDeployment.lyricsflip || '',
  ),
  lyricsflipNftContractId: getEnvVar(
    'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID',
    env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID ||
      testnetDeployment.lyricsflipNft ||
      '',
  ),
  lyricsflipEscrowContractId: getEnvVar(
    'NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID',
    env.NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID,
  ),
  wageringEnabled:
    getEnvVar(
      'NEXT_PUBLIC_WAGERING_ENABLED',
      env.NEXT_PUBLIC_WAGERING_ENABLED,
    ) === 'true' &&
    getEnvVar(
      'NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID',
      env.NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID,
    ) !== '',
});
