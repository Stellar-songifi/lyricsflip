export class PlayerBadgeDto {
  tokenId?: string;
  name?: string;
  imageUrl?: string;
  iconUrl?: string;
  description?: string;
  earnedAt?: Date;
}

export class PlayerRecentRoundDto {
  roundId: number | string;
  contractAddress?: string;
  genre?: string;
  score?: number;
  rank?: number;
  won: boolean;
  points?: number;
  correctAnswers?: number;
  totalAnswers?: number;
  playedAt?: Date;
}

export class PlayerStatsDto {
  roundsPlayed?: number;
  roundsWon: number;
  winRate: number;
  maxStreak: number;
  totalPoints: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracy: number;
  bestRoundScore: number;
}

export class PlayerProfileDto {
  address: string;
  username?: string;
  avatarUrl?: string;
  rank?: number | null;
  roundsWon?: number;
  winRate?: number;
  maxStreak?: number;
  totalPoints?: number;
  correctAnswers?: number;
  totalAnswers?: number;
  accuracy?: number;
  bestRoundScore?: number;
  stats?: PlayerStatsDto;
  badges?: PlayerBadgeDto[];
  recentRounds?: PlayerRecentRoundDto[];
  unclaimedWinnings?: number;
}
