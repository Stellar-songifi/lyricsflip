export interface DomainOwnership {
  readonly domain: string;
  readonly module: string;
  readonly prefixes: readonly string[];
  readonly legacyPrefixes: readonly string[];
  readonly tables: readonly string[];
  readonly folders: readonly string[];
}

export const DOMAIN_MAP: readonly DomainOwnership[] = [
  {
    domain: 'Identity',
    module: 'IdentityModule',
    prefixes: ['auth', 'user'],
    legacyPrefixes: [],
    tables: ['users', 'players', 'password_reset_tokens', 'user_activity'],
    folders: ['auth', 'player', 'user'],
  },
  {
    domain: 'Catalogue',
    module: 'CatalogueModule',
    prefixes: ['songs', 'questions'],
    legacyPrefixes: [],
    tables: ['songs', 'tags', 'user_genre_preferences', 'questions'],
    folders: ['songs', 'questions'],
  },
  {
    domain: 'Rounds',
    module: 'RoundsModule',
    prefixes: ['rounds', 'game-modes', 'game-results', 'wagers', 'scoring'],
    legacyPrefixes: ['game-session', 'quick-game/rounds', 'rooms'],
    tables: [
      'game_sessions',
      'rooms',
      'player_rooms',
      'game_results',
      'wagers',
      'scoring',
      'custom_game_modes',
      'tournament',
      'indexer_state',
      'chain_round',
      'chain_round_player',
      'chain_answer',
      'chain_round_result',
      'chain_nft',
      'processed_event',
    ],
    folders: [
      'game',
      'game-results',
      'game-session',
      'indexer',
      'quick-game',
      'room',
      'rounds',
      'scoring',
      'tournament',
      'wager',
    ],
  },
  {
    domain: 'Realtime',
    module: 'RealtimeModule',
    prefixes: ['notifications'],
    legacyPrefixes: [],
    tables: ['notifications', 'notification_preferences', 'chat_rooms'],
    folders: ['notification', 'realtime'],
  },
  {
    domain: 'Social',
    module: 'SocialModule',
    prefixes: [
      'players',
      'leaderboard',
      'profile',
      'friends',
      'activity',
      'challenge',
      'referrals',
    ],
    legacyPrefixes: [],
    tables: [
      'profile',
      'friends',
      'activities',
      'challenges',
      'leaderboards',
      'leaderboard_round_results',
      'referrals',
    ],
    folders: ['leaderboard', 'referral', 'social'],
  },
  {
    domain: 'Rewards',
    module: 'RewardsModule',
    prefixes: ['rewards', 'achievements', 'progression'],
    legacyPrefixes: ['reward'],
    tables: [
      'achievement',
      'user_achievement',
      'player_stats',
      'player_level',
      'player_skill',
    ],
    folders: ['achievement', 'progression', 'reward', 'rewards'],
  },
  {
    domain: 'Admin',
    module: 'AdminModule',
    prefixes: ['analytics', 'admin/songs'],
    legacyPrefixes: [],
    tables: [
      'player_engagement_metrics',
      'song_category_metrics',
      'token_metrics',
      'user_progression_metrics',
    ],
    folders: ['admin', 'analytics', 'player-engagement'],
  },
] as const;

export function findDomainForPrefix(
  prefix: string,
): DomainOwnership | undefined {
  return DOMAIN_MAP.find((domain) =>
    [...domain.prefixes, ...domain.legacyPrefixes].includes(prefix),
  );
}

export function findDomainForTable(table: string): DomainOwnership | undefined {
  return DOMAIN_MAP.find((domain) => domain.tables.includes(table));
}
