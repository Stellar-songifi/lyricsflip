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
  // Soroban RPC endpoint + deployed contracts, consumed by the event
  // indexer (indexer/services/indexer.service.ts). SOROBAN_RPC_URL takes
  // precedence to match health/stellar-rpc.health.ts's own fallback order.
  // Both the game contract and the NFT contract are indexed so that
  // `NftMinted` events are picked up alongside game events.
  soroban: {
    rpcUrl: process.env.SOROBAN_RPC_URL || process.env.STELLAR_RPC_URL,
    contractIds: [
      process.env.LYRICSFLIP_CONTRACT_ID,
      process.env.LYRICSFLIP_NFT_CONTRACT_ID,
    ].filter((id): id is string => Boolean(id)),
    // Indexer tuning (indexer/services/indexer.service.ts). All optional;
    // defaults keep the poll loop cheap and the keeper off.
    pollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS, 10) || 5_000,
    eventLimit: parseInt(process.env.INDEXER_EVENT_LIMIT, 10) || 100,
    keeperEnabled: process.env.INDEXER_KEEPER_ENABLED === 'true',
    // Soroban RPC event retention window (days). Used to detect a cursor that
    // has fallen outside the window and trigger a state backfill (LF-223).
    retentionDays: parseInt(process.env.INDEXER_RETENTION_DAYS, 10) || 7,
    // Exponential backoff on RPC errors.
    backoffBaseMs: parseInt(process.env.INDEXER_BACKOFF_BASE_MS, 10) || 1_000,
    backoffMaxMs: parseInt(process.env.INDEXER_BACKOFF_MAX_MS, 10) || 60_000,
    // Optional starting ledger when no cursor has been persisted yet.
    startLedger: process.env.INDEXER_START_LEDGER
      ? parseInt(process.env.INDEXER_START_LEDGER, 10)
      : undefined,
  },
  // Health-check tuning (health/*): how long to wait on the RPC's
  // getLatestLedger before declaring it unreachable, and how many ledgers the
  // indexer may fall behind the RPC's latest ledger before /health/ready
  // reports the indexer as unhealthy.
  health: {
    rpcTimeoutMs: parseInt(process.env.RPC_HEALTH_TIMEOUT_MS, 10) || 3_000,
    indexerMaxLagLedgers:
      parseInt(process.env.INDEXER_MAX_LAG_LEDGERS, 10) || 100,
  },
  cors: {
    // Comma-separated list of allowed origins (main.ts). Must be explicit,
    // not `*`: the refresh-token cookie (LF-202) needs `credentials: true`,
    // which browsers refuse for a wildcard origin.
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
      : (process.env.FRONTEND_URL ?? 'http://localhost:3000'),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    url: process.env.REDIS_URL,
  },
});
