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
  /** Convenience alias for legacy components */
  id?: string;
  name?: string;
}

export interface QuestionCard {
  id: string;
  lyrics: string;
  options: string[];
  timeLimit: number;
}

export interface SongOption {
  title: string;
  artist: string;
}

export interface RoomState {
  roomId: string;
  status: RoomStatus;
  players: Player[];
  currentRoundIndex: number;
  maxRounds: number;
  createdAt: string;
  currentCard?: QuestionCard | null;
  /** Backwards compatibility fields for existing UI components */
  id?: string;
  name?: string;
  description?: string;
  timeLeft?: string;
  potWin?: string;
  scores?: number;
  currentLyric?: {
    text: string;
    title?: string;
    artist?: string;
  };
  songOptions?: SongOption[];
}

export interface PlayerJoinedPayload {
  playerId: string;
  username: string;
  playerCount: number;
  timestamp: string;
  /** Legacy alias */
  id?: string;
  name?: string;
  score?: number;
}

export interface PlayerLeftPayload {
  playerId: string;
  username?: string;
  playerCount?: number;
  timestamp?: string;
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
  /** Legacy alias */
  totalScore?: number;
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
  timestamp?: string;
}

/** Client -> Server payloads */
export interface RoomJoinPayload {
  roomId: string;
  playerId?: string;
  username?: string;
  /** Legacy alias */
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

/** Server -> Client events map */
export interface ServerToClientEvents {
  'room:state': (payload: RoomState) => void;
  'player:joined': (payload: PlayerJoinedPayload) => void;
  'player:left': (payload: PlayerLeftPayload) => void;
  'player:ready': (payload: PlayerReadyPayload) => void;
  'card:next': (payload: CardNextPayload) => void;
  'timer:tick': (payload: TimerTickPayload) => void;
  'score:update': (payload: ScoreUpdatePayload) => void;
  'round:completed': (payload: RoundCompletedPayload) => void;
  'error': (payload: RealtimeErrorPayload) => void;

  // Legacy aliases supported for compatibility
  room_data: (payload: RoomState) => void;
  player_joined: (payload: PlayerJoinedPayload) => void;
  player_left: (payload: PlayerLeftPayload) => void;
  player_answered: (payload: { playerId: string; songIndex: number }) => void;
  score_update: (payload: ScoreUpdatePayload) => void;
  time_update: (payload: { timeLeft: string }) => void;
  new_lyric: (payload: {
    lyric: RoomState['currentLyric'];
    songOptions: SongOption[];
  }) => void;
  room_error: (payload: { message: string }) => void;
}

/** Client -> Server events map */
export interface ClientToServerEvents {
  'room:join': (
    payload: RoomJoinPayload,
    callback?: (res: { success: boolean; roomState?: RoomState; error?: string }) => void,
  ) => void;
  'room:leave': (
    payload: RoomLeavePayload,
    callback?: (res: { success: boolean; error?: string }) => void,
  ) => void;
  'room:ready': (
    payload: RoomReadyPayload,
    callback?: (res: { success: boolean; error?: string }) => void,
  ) => void;
  'answer:submitted': (
    payload: AnswerSubmittedPayload,
    callback?: (res: { success: boolean; error?: string }) => void,
  ) => void;

  // Legacy aliases
  join_room: (payload: { roomId: string; playerName: string }) => void;
  select_song: (payload: { roomId: string; songIndex: number }) => void;
  leave_room: (payload: { roomId: string }) => void;
}

export type RoomData = RoomState;
