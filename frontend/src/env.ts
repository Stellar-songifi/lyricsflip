import { z } from 'zod';
import testnetDeployment from '../../deployments/testnet.json';

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().min(1).default('http://localhost:4000'),
  NEXT_PUBLIC_WS_URL: z.string().min(1).default('http://localhost:4000'),
  NEXT_PUBLIC_WAGER_ASSET_CODE: z.string().min(1).default('XLM'),
  NEXT_PUBLIC_STELLAR_HORIZON_URL: z
    .string()
    .min(1)
    .default('https://horizon-testnet.stellar.org'),
  NEXT_PUBLIC_STELLAR_RPC_URL: z
    .string()
    .min(1)
    .default('https://soroban-testnet.stellar.org'),
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .min(1)
    .default('Test SDF Network ; September 2015'),
  NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID: z
    .string()
    .default(testnetDeployment.lyricsflip || ''),
  NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID: z
    .string()
    .default(testnetDeployment.lyricsflipNft || ''),
});

const rawEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_WAGER_ASSET_CODE: process.env.NEXT_PUBLIC_WAGER_ASSET_CODE,
  NEXT_PUBLIC_STELLAR_HORIZON_URL: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL,
  NEXT_PUBLIC_STELLAR_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID:
    process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID,
  NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID:
    process.env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID,
};

const cleanedEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(rawEnv)) {
  if (value !== undefined && value !== '') {
    cleanedEnv[key] = value;
  }
}

const parsed = envSchema.safeParse(cleanedEnv);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export type Env = z.infer<typeof envSchema>;
export const env: Readonly<Env> = Object.freeze(parsed.data);
export default env;
