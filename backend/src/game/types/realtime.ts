/**
 * Real-Time Multiplayer Protocol specification (LF-091 / LF-197).
 * Source of truth: docs/realtime-protocol.md
 */

export type RoomStatus = 'waiting' | 'starting' | 'playing' | 'completed';

export interface Player {
  playerId: string;
  username: string;
  isReady: boolean;
  score: number;
  joinedAt: string;
  id?: string;
  name?: string;
}

export interface QuestionCard {
  id: string;
  lyrics: string;
  options: string[];
  timeLimit: number;
}

export interface RoomState {
  roomId: string;
  status: RoomStatus;
  players: Player[];
  currentRoundIndex: number;
  maxRounds: number;
  createdAt: string;
  currentCard?: QuestionCard | null;
}

export interface PlayerJoinedPayload {
  playerId: string;
  username: string;
  playerCount: number;
  timestamp: string;
}

export interface PlayerLeftPayload {
  playerId: string;
  username: string;
  playerCount: number;
  timestamp: string;
}

export interface PlayerReadyPayload {
  playerId: string;
  readyCount: number;
  totalPlayers: number;
}

export interface CardNextPayload {
  roundIndex: number;
  question: QuestionCard;
  timestamp: string;
}

export interface TimerTickPayload {
  roundIndex: number;
  remainingMs: number;
  timestamp: string;
}

export interface ScoreUpdatePayload {
  playerId: string;
  score: number;
  pointsGained: number;
  timestamp: string;
}

export interface PlayerResult {
  playerId: string;
  answer: string;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface RoundCompletedPayload {
  roundIndex: number;
  correctAnswer: string;
  playerResults: PlayerResult[];
  timestamp: string;
}

export interface RealtimeErrorPayload {
  code: string;
  message: string;
  timestamp: string;
}

export interface RoomJoinPayload {
  roomId: string;
  playerId?: string;
  username?: string;
  playerName?: string;
}

export interface RoomLeavePayload {
  roomId: string;
}

export interface RoomReadyPayload {
  roomId: string;
}

export interface AnswerSubmittedPayload {
  roomId: string;
  answer: string;
  roundIndex?: number;
}
