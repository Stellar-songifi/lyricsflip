import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import testnetDeployment from '../../deployments/testnet.json';

const isProduction = process.env.NODE_ENV === 'production';

const apiBaseUrl = z
  .string()
  .url()
  .default('http://localhost:4000/api/v1')
  .transform((value) => {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = !path || path === '/api' ? '/api/v1' : path;
    return url.toString().replace(/\/$/, '');
  })
  .refine((value) => new URL(value).pathname === '/api/v1', {
    message: 'Must point to the backend /api/v1 root',
  });

const contractId = (name: string, requiredInProduction = false) =>
  z.string().default('').superRefine((value, ctx) => {
    if (isProduction && value && !StrKey.isValidContract(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} must be a valid C... Stellar contract StrKey`,
      });
    } else if (isProduction && requiredInProduction && !value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} is required in production`,
      });
    }
  });

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: apiBaseUrl,
  NEXT_PUBLIC_WS_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_WAGER_ASSET_CODE: z.string().min(1).default('XLM'),
  NEXT_PUBLIC_STELLAR_HORIZON_URL: z
    .string().url()
    .default('https://horizon-testnet.stellar.org'),
  NEXT_PUBLIC_STELLAR_RPC_URL: z
    .string().url()
    .default('https://soroban-testnet.stellar.org'),
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .min(1)
    .default('Test SDF Network ; September 2015'),
  NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID: contractId(
    'NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID',
    true,
  ).default(testnetDeployment.lyricsflip || ''),
  NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID: contractId(
    'NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID',
    true,
  ).default(testnetDeployment.lyricsflipNft || ''),
  NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID: contractId(
    'NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID',
  ).default(testnetDeployment.lyricsflipEscrow || ''),
  NEXT_PUBLIC_STELLAR_FRIENDBOT_URL: z
    .string().url()
    .default('https://friendbot.stellar.org'),
  NEXT_PUBLIC_STELLAR_NETWORK: z.string().default('testnet'),
  NEXT_PUBLIC_WAGERING_ENABLED: z.enum(['true', 'false']).default('false'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://lyricsflip.xyz'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://lyricsflip.xyz'),
  NEXT_PUBLIC_INDEXER_URL: z.string().url().or(z.literal('')).default(''),
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
  NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID:
    process.env.NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID,
  NEXT_PUBLIC_STELLAR_FRIENDBOT_URL:
    process.env.NEXT_PUBLIC_STELLAR_FRIENDBOT_URL,
  NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
  NEXT_PUBLIC_WAGERING_ENABLED: process.env.NEXT_PUBLIC_WAGERING_ENABLED,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL,
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
