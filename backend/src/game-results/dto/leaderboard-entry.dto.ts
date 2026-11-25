export class LeaderboardEntryDto {
  userId: string;
  username: string;
  score: number;
  rank: number;
  achievements: string[];
  gameId: string;
  correctAnswers?: number;
  totalAnswers?: number;
  accuracy?: number;
}
