// Replaces `frontend/src/lib/dojo/dojoConfig.ts`. Dojo-only concepts with no
// Stellar equivalent (Torii URL, Relay URL, burner master address/private
// key, account class hash) are dropped; Soroban contract IDs replace the
// Dojo world manifest (`manifest_dev.json`).
//
// Contract IDs default to `deployments/testnet.json`, which the
// `contracts-deploy` workflow updates on every `contracts-v*` tag (LF-110).
// Env vars still take precedence for local or custom deployments.

import testnetDeployment from '../../../../deployments/testnet.json';

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
    };
  }
}

export interface StellarConfig {
  rpcUrl: string;
  networkPassphrase: string;
  lyricsflipContractId: string;
  lyricsflipNftContractId: string;
}

export const createConfig = (): StellarConfig => ({
  rpcUrl: getEnvVar('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org'),
  networkPassphrase: getEnvVar(
    'NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE',
    'Test SDF Network ; September 2015',
  ),
  lyricsflipContractId: getEnvVar(
    'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID',
    testnetDeployment.lyricsflip,
  ),
  lyricsflipNftContractId: getEnvVar(
    'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID',
    testnetDeployment.lyricsflipNft,
  ),
});
