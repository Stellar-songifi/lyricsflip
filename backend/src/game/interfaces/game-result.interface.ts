export interface GameResult {
  gameSessionId: string;
  gameMode: string;
  startTime: Date;
  endTime: Date;
  players: Array<{
    id: string;
    score: number;
    rank: number;
    correctAnswers?: number;
    totalAnswers?: number;
  }>;
  winner: string;
}
