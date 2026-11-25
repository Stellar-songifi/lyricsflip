import { Throttle } from '@nestjs/throttler';

// ---------------------------------------------------------------------------
// Route-by-route rate-limit budget table (LF-350)
// ---------------------------------------------------------------------------
// All TTLs are in milliseconds (NestJS throttler v5 convention).
// Limits are per tracker key — authenticated wallet address when present,
// falling back to IP (see CustomThrottlerGuard.getTracker).
//
// | Tier            | ttl     | limit | Routes                                    |
// |-----------------|---------|-------|-------------------------------------------|
// | DEFAULT         | 60 000  |    60 | All other GET endpoints                   |
// | AUTH            | 60 000  |     5 | POST /auth/* (sign-in, sign-up, refresh)  |
// | FORGOT_PASSWORD | 60 000  |     3 | POST /auth/forgot-password                |
// | RESET_PASSWORD  | 60 000  |     5 | POST /auth/reset-password                 |
// | ANSWER          | 60 000  |    10 | POST /game-session/:id/guess              |
// | SEARCH          | 60 000  |    20 | GET /songs (search / filter)              |
// | LEADERBOARD     | 60 000  |    30 | GET /leaderboard, GET /leaderboard/rank/* |
// | PLAYER_PROFILE  | 60 000  |    20 | GET /players/:address                     |
// | RECOMMENDED     | 60 000  |    15 | GET /songs/recommended                    |
// ---------------------------------------------------------------------------

/** Global default: general reads and all unlisted endpoints. */
export const DEFAULT_THROTTLE = { ttl: 60_000, limit: 60 };

/** Auth challenges: sign-in, sign-up, refresh, wallet challenge/verify. */
export const AUTH_THROTTLE = { ttl: 60_000, limit: 5 };

/** Password-reset request — tightest auth limit. */
export const FORGOT_PASSWORD_THROTTLE = { ttl: 60_000, limit: 3 };

/** Password-reset submission. */
export const RESET_PASSWORD_THROTTLE = { ttl: 60_000, limit: 5 };

/** Off-chain answer / guess submission. */
export const ANSWER_THROTTLE = { ttl: 60_000, limit: 10 };

/** Wallet challenge issuance, per IP (a per-address cap lives in WalletAuthProvider). */
export const WALLET_CHALLENGE_THROTTLE = { ttl: 60_000, limit: 10 };

export const WalletChallengeThrottle = () =>
  Throttle({ default: WALLET_CHALLENGE_THROTTLE });
/**
 * Song search / catalogue filter (GET /songs).
 * Expensive: runs a full-text DB query and may scan a large dataset.
 */
export const SEARCH_THROTTLE = { ttl: 60_000, limit: 20 };

/**
 * Recommended songs for a user (GET /songs/recommended).
 * Expensive: joins preferences and rankings.
 */
export const RECOMMENDED_THROTTLE = { ttl: 60_000, limit: 15 };

/**
 * Leaderboard pages (GET /leaderboard, GET /leaderboard/rank/:id).
 * Read-heavy aggregation query; can be cached at a higher layer, but we
 * still cap direct API calls to prevent cache-bypass floods.
 */
export const LEADERBOARD_THROTTLE = { ttl: 60_000, limit: 30 };

/**
 * Player profile (GET /players/:address).
 * Fetches indexed on-chain + off-chain stats; more expensive than a simple
 * leaderboard page because it aggregates per-player data across tables.
 */
export const PLAYER_PROFILE_THROTTLE = { ttl: 60_000, limit: 20 };

// ---------------------------------------------------------------------------
// Decorator factories
// All factories return a @Throttle() call scoped to the 'default' throttler
// that AppModule registers.  Using named throttlers keeps the override
// mechanism simple: NestJS picks up the most specific metadata
// (method > class > global), so a method-level decorator always wins.
// ---------------------------------------------------------------------------

export const AuthThrottle = () => Throttle({ default: AUTH_THROTTLE });
export const AnswerThrottle = () => Throttle({ default: ANSWER_THROTTLE });
export const SearchThrottle = () => Throttle({ default: SEARCH_THROTTLE });
export const RecommendedThrottle = () =>
  Throttle({ default: RECOMMENDED_THROTTLE });
export const LeaderboardThrottle = () =>
  Throttle({ default: LEADERBOARD_THROTTLE });
export const PlayerProfileThrottle = () =>
  Throttle({ default: PLAYER_PROFILE_THROTTLE });
