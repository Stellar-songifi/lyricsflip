import { Reflector } from '@nestjs/core';
import { AuthController } from '../../auth/auth.controller';
import { GameSessionController } from '../../game-session/game-session.controller';
import { SongsController } from '../../songs/songs.controller';
import { LeaderboardController, PlayersController } from '../../leaderboard/leaderboard.controller';
import {
  ANSWER_THROTTLE,
  AUTH_THROTTLE,
  DEFAULT_THROTTLE,
  LEADERBOARD_THROTTLE,
  PLAYER_PROFILE_THROTTLE,
  RECOMMENDED_THROTTLE,
  SEARCH_THROTTLE,
} from './throttle-limits';

// @nestjs/throttler stores per-route overrides under these metadata keys.
const LIMIT_KEY = 'THROTTLER:LIMITdefault';
const TTL_KEY = 'THROTTLER:TTLdefault';

describe('per-route throttle limits', () => {
  const reflector = new Reflector();

  // -------------------------------------------------------------------------
  // Existing tiers
  // -------------------------------------------------------------------------

  it('auth routes use the stricter auth limit, independent of the global limit', () => {
    // Applied at controller level so it covers every /auth/* route.
    expect(reflector.get(LIMIT_KEY, AuthController)).toBe(AUTH_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, AuthController)).toBe(AUTH_THROTTLE.ttl);
    expect(AUTH_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  it('answer submission uses the answer limit', () => {
    const handler = GameSessionController.prototype.submitGuess;
    expect(reflector.get(LIMIT_KEY, handler)).toBe(ANSWER_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, handler)).toBe(ANSWER_THROTTLE.ttl);
    expect(ANSWER_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  // -------------------------------------------------------------------------
  // New per-route tiers (LF-350)
  // -------------------------------------------------------------------------

  it('song search (GET /songs) uses the search limit', () => {
    const handler = SongsController.prototype.findAll;
    expect(reflector.get(LIMIT_KEY, handler)).toBe(SEARCH_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, handler)).toBe(SEARCH_THROTTLE.ttl);
    expect(SEARCH_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  it('recommended songs (GET /songs/recommended) uses the recommended limit', () => {
    const handler = SongsController.prototype.recommend;
    expect(reflector.get(LIMIT_KEY, handler)).toBe(RECOMMENDED_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, handler)).toBe(RECOMMENDED_THROTTLE.ttl);
    expect(RECOMMENDED_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  it('leaderboard (GET /leaderboard) uses the leaderboard limit', () => {
    const handler = LeaderboardController.prototype.getLeaderboard;
    expect(reflector.get(LIMIT_KEY, handler)).toBe(LEADERBOARD_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, handler)).toBe(LEADERBOARD_THROTTLE.ttl);
    expect(LEADERBOARD_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  it('player rank (GET /leaderboard/rank/:id) uses the leaderboard limit', () => {
    const handler = LeaderboardController.prototype.getPlayerRank;
    expect(reflector.get(LIMIT_KEY, handler)).toBe(LEADERBOARD_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, handler)).toBe(LEADERBOARD_THROTTLE.ttl);
  });

  it('player profile (GET /players/:address) uses the player-profile limit', () => {
    const handler = PlayersController.prototype.getPlayerProfile;
    expect(reflector.get(LIMIT_KEY, handler)).toBe(PLAYER_PROFILE_THROTTLE.limit);
    expect(reflector.get(TTL_KEY, handler)).toBe(PLAYER_PROFILE_THROTTLE.ttl);
    expect(PLAYER_PROFILE_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });

  // -------------------------------------------------------------------------
  // Ordering invariants — tighter limits must be tighter than the default
  // -------------------------------------------------------------------------

  it('all per-route limits are stricter than the global default', () => {
    expect(AUTH_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
    expect(ANSWER_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
    expect(SEARCH_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
    expect(RECOMMENDED_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
    expect(LEADERBOARD_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
    expect(PLAYER_PROFILE_THROTTLE.limit).toBeLessThan(DEFAULT_THROTTLE.limit);
  });
});
