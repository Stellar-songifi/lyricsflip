export default () => ({
  rateLimit: {
    // In milliseconds - @nestjs/throttler v5+ expects `ttl` in ms, not
    // seconds. Defaults mirror common/throttler/throttle-limits.ts's
    // DEFAULT_THROTTLE (60 requests/minute); /auth/* and answer submission
    // apply their own stricter, non-configurable overrides.
    ttl: parseInt(process.env.RATE_LIMIT_TTL, 10) || 60_000,
    limit: parseInt(process.env.RATE_LIMIT_LIMIT, 10) || 60,
  },
  env: process.env.NODE_ENV,
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT, 10),
  database: {
    url: process.env.DATABASE_URL,
    synchronize:
      process.env.DB_SYNCHRONIZE !== undefined
        ? process.env.DB_SYNCHRONIZE === 'true'
        : process.env.NODE_ENV === 'development',
    migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  stellar: {
    network: process.env.STELLAR_NETWORK,
  },
  // Soroban RPC endpoint + deployed game contract, consumed by the event
  // indexer (indexer/services/indexer.service.ts). SOROBAN_RPC_URL takes
  // precedence to match health/stellar-rpc.health.ts's own fallback order.
  soroban: {
    rpcUrl: process.env.SOROBAN_RPC_URL || process.env.STELLAR_RPC_URL,
    contractIds: process.env.LYRICSFLIP_CONTRACT_ID
      ? [process.env.LYRICSFLIP_CONTRACT_ID]
      : [],
  },
  cors: {
    // Comma-separated list of allowed origins, or `*` for all (main.ts).
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
      : '*',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    url: process.env.REDIS_URL,
  },
});
