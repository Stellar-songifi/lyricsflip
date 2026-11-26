import * as Joi from 'joi';
import { StrKey } from '@stellar/stellar-sdk';

const contractIdSchema = Joi.string().custom((value: string, helpers) => {
  if (!StrKey.isValidContract(value)) {
    return helpers.error('any.invalid', {
      message: `"${value}" is not a valid Stellar contract ID (expected a StrKey-encoded contract address starting with "C")`,
    });
  }
  return value;
}, 'Stellar contract ID validation');

/**
 * Rejects secrets that are obviously unsafe: the literal placeholder values
 * shipped in .env.example, or any value shorter than 32 characters.
 *
 * Only applied when NODE_ENV=production so development stays frictionless.
 */
const productionSecretSchema = Joi.string()
  .required()
  .when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(32)
      .invalid('change-me', 'change-me-too', 'secret', 'password')
      .messages({
        'string.min':
          '{{#label}} must be at least 32 characters long in production.',
        'any.invalid':
          '{{#label}} is set to a known placeholder value — replace it before deploying to production.',
      }),
  });

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),

  PORT: Joi.number().default(4000),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),

  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: Joi.string().required(),
  DB_MIGRATIONS_RUN: Joi.boolean().default(true),

  // ── Auth / JWT ────────────────────────────────────────────────────────────
  JWT_SECRET: productionSecretSchema,
  JWT_REFRESH_SECRET: productionSecretSchema,
  JWT_ACCESS_TOKEN_TTL: Joi.number().integer().min(1).default(3600),
  JWT_REFRESH_TOKEN_TTL: Joi.number().integer().min(1).default(7_776_000),
  JWT_TOKEN_AUDIENCE: Joi.string().optional(),
  JWT_TOKEN_ISSUER: Joi.string().optional(),

  // ── CORS ──────────────────────────────────────────────────────────────────
  // The refresh-token cookie requires credentials: true, which is incompatible
  // with a wildcard origin. Production must list explicit origins; fail at boot
  // instead of leaving the API open to every site. Runtime enforcement lives
  // in config/cors.ts (LF-359).
  CORS_ORIGINS: Joi.string()
    .optional()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .required()
        .custom((value: string, helpers) => {
          const origins = value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean);
          if (origins.length === 0 || origins.includes('*')) {
            return helpers.error('any.invalid');
          }
          return value;
        })
        .messages({
          'any.required':
            'CORS_ORIGINS must list explicit allowed origins in production.',
          'any.invalid':
            'CORS_ORIGINS must not be "*" or empty in production — list explicit allowed origins.',
        }),
    }),

  // ── Rate limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_TTL: Joi.number().optional(),
  RATE_LIMIT_LIMIT: Joi.number().optional(),

  // ── Email ─────────────────────────────────────────────────────────────────
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().integer().optional(),
  SMTP_SECURE: Joi.boolean().optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().optional(),
  APP_URL: Joi.string().uri().optional(),
  PASSWORD_RESET_TTL_MINUTES: Joi.number().integer().min(1).default(15),

  // ── Analytics ─────────────────────────────────────────────────────────────
  ANALYTICS_API_KEY: Joi.string().allow('').optional(),

  // ── Stellar / Soroban ─────────────────────────────────────────────────────
  STELLAR_NETWORK: Joi.string()
    .valid('testnet', 'futurenet', 'mainnet')
    .required(),
  SOROBAN_RPC_URL: Joi.string().uri().optional(),
  STELLAR_RPC_URL: Joi.string().uri().optional(),
  LYRICSFLIP_CONTRACT_ID: contractIdSchema.optional(),
  LYRICSFLIP_NFT_CONTRACT_ID: contractIdSchema.optional(),
  // LF-340: escrow contract that holds wagers and pays out winnings. Its
  // Deposited/Refunded/Settled/Claimed events are the source of truth for
  // wager records — the indexer derives all Wager rows from them.
  LYRICSFLIP_ESCROW_CONTRACT_ID: contractIdSchema.optional(),
  // Stellar network passphrase, used to build read-only contract
  // simulations (e.g. the nightly wager reconciliation balance check).
  STELLAR_NETWORK_PASSPHRASE: Joi.string().optional(),
  SOROBAN_ADMIN_SECRET_KEY: Joi.string().allow('').optional(),
  SOROBAN_ADMIN_PUBLIC_KEY: Joi.string().allow('').optional(),

  // ── Wallet auth ───────────────────────────────────────────────────────────
  // Raw-signature support must never be enabled in production.
  WALLET_AUTH_ALLOW_RAW_SIGNATURES: Joi.boolean()
    .default(false)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.boolean().valid(false).messages({
        'any.only':
          'WALLET_AUTH_ALLOW_RAW_SIGNATURES must not be true in production.',
      }),
    }),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().optional(),
  REDIS_URL: Joi.string().optional(),

  // ── Indexer tuning ────────────────────────────────────────────────────────
  INDEXER_POLL_INTERVAL_MS: Joi.number().integer().min(0).optional(),
  INDEXER_EVENT_LIMIT: Joi.number().integer().min(1).optional(),
  INDEXER_KEEPER_ENABLED: Joi.boolean().optional(),
  INDEXER_RETENTION_DAYS: Joi.number().integer().min(0).optional(),
  INDEXER_START_LEDGER: Joi.number().integer().min(0).optional(),
  INDEXER_BACKOFF_BASE_MS: Joi.number().integer().min(0).optional(),
  INDEXER_BACKOFF_MAX_MS: Joi.number().integer().min(0).optional(),

  // Health check tuning - see configuration.ts for the defaults applied when unset.
  INDEXER_MAX_LAG_LEDGERS: Joi.number()
    .integer()
    .min(0)
    .optional()
    .default(100),
  INDEXER_MAX_LAG_LEDGERS: Joi.number().integer().min(0).optional().default(100),
  RPC_HEALTH_TIMEOUT_MS: Joi.number().integer().min(1).optional().default(5000),
  // LF-340: wager reconciliation config.
  SOROBAN_NATIVE_TOKEN_CONTRACT_ID: contractIdSchema.optional(),
  WAGER_RECONCILIATION_TOLERANCE: Joi.string().optional(),
});
