// Local game-session state for the zustand `useStore` (game-stores.ts).
// Restored after 6cd68d1 deleted it while the game timer, single-player
// hooks and wager modal still depended on it. Shared shapes come from the
// UI types.
import type { UserPreferences, WagerDetails } from './types';

export type GameStatus = 'idle' | 'playing' | 'ended';
export type GuessResult = 'correct' | 'incorrect' | null;

export interface GameConfig {
  genre: string;
  difficulty: string;
  duration: string;
  odds: number;
  wagerAmount: number;
}

export interface GameState {
  score: number;
  level: number;
  isPlaying: boolean;
  lastPlayed: Date | null;
  timeLeft: number;
  isTimerRunning: boolean;
  potentialWin: number;
  currentRound: number;
  maxRounds: number;
  gameStatus: GameStatus;
  gameConfig: GameConfig;
  lastGuessResult: GuessResult;
  roundId: bigint | null;
}

export interface LyricData {
  text: string;
  title: string;
  artist: string;
  options: SongOption[];
}

export interface SongOption {
  title: string;
  artist: string;
}

export interface GameActions {
  incrementScore: (by: number) => void;
  incrementLevel: () => void;
  increaseScore: () => void;
  setGuessResult: (result: GuessResult) => void;
  startGame: (config?: GameConfig) => void;
  endGame: () => void;
  resetGame: () => void;
  setGameStatus: (status: GameStatus) => void;
  setRoundId: (roundId: bigint) => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: (newTime?: number) => void;
  tickTimer: () => void;
}

// User slice types

export interface UserState {
  username: string | null;
  isLoggedIn: boolean;
  preferences: UserPreferences;
}

export interface UserActions {
  login: (username: string) => void;
  logout: () => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  toggleTheme: () => void;
  toggleSound: () => void;
  setDifficulty: (difficulty: UserPreferences['difficulty']) => void;
}

// Combined store type
export interface StoreState {
  game: GameState;
  user: UserState;
}

export interface StoreActions {
  game: GameActions;
  user: UserActions;
}

export type Store = StoreState & StoreActions;
