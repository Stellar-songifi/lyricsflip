import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(4000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  STELLAR_NETWORK: Joi.string()
    .valid('testnet', 'futurenet', 'mainnet')
    .required(),

  // Optional - see configuration.ts for the defaults applied when unset.
  RATE_LIMIT_TTL: Joi.number().optional(),
  RATE_LIMIT_LIMIT: Joi.number().optional(),
  SOROBAN_RPC_URL: Joi.string().uri().optional(),
  STELLAR_RPC_URL: Joi.string().uri().optional(),
  LYRICSFLIP_CONTRACT_ID: Joi.string().optional(),
  SOROBAN_ADMIN_SECRET_KEY: Joi.string().optional(),
  CORS_ORIGINS: Joi.string().optional(),
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().optional(),
  REDIS_URL: Joi.string().optional(),
});
