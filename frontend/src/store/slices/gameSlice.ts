import { StateCreator } from 'zustand';
import { GameState, GameActions, GameConfig, Store } from '../Types';

export const initialGameConfig: GameConfig = {
  genre: '',
  difficulty: '',
  duration: '',
  odds: 0,
  wagerAmount: 0,
};

export const initialGameState: GameState = {
  score: 0,
  level: 1,
  isPlaying: false,
  lastPlayed: null,
  timeLeft: 15,
  isTimerRunning: false,
  potentialWin: 0,
  currentRound: 0,
  maxRounds: 5,
  gameStatus: 'idle',
  gameConfig: initialGameConfig,
  lastGuessResult: null,
  roundId: null,
};

const durationToSeconds = (duration: string) =>
  duration === '5 mins' ? 300 : duration === '10 mins' ? 600 : 900;

export const createGameSlice: StateCreator<
  Store,
  [['zustand/immer', never]],
  [['zustand/immer', never]],
  { game: GameState } & { game: GameActions }
> = (set) => ({
  game: {
    ...initialGameState,

    // Existing Actions
    incrementScore: (by) => {
      set((state) => {
        state.game.score += by;
      });
    },

    incrementLevel: () => {
      set((state) => {
        state.game.level += 1;
      });
    },

    increaseScore: () => {
      set((state) => {
        state.game.score += 1;
        state.game.currentRound += 1;
        state.game.lastGuessResult = 'correct';
      });
    },

    setGuessResult: (result) => {
      set((state) => {
        state.game.lastGuessResult = result;
      });
    },

    startGame: (config) => {
      set((state) => {
        state.game.isPlaying = true;
        state.game.score = 0;
        state.game.level = 1;
        state.game.currentRound = 0;
        state.game.lastGuessResult = null;
        state.game.isTimerRunning = false;
        state.game.gameStatus = 'playing';
        if (config) {
          state.game.gameConfig = config;
          state.game.potentialWin = config.wagerAmount * config.odds;
          state.game.timeLeft = durationToSeconds(config.duration);
        } else {
          state.game.timeLeft = 15; // Reset timer on game start
        }
      });
    },

    endGame: () => {
      set((state) => {
        state.game.isPlaying = false;
        state.game.lastPlayed = new Date();
        state.game.isTimerRunning = false; // Stop timer on game end
        state.game.gameStatus = 'ended';
      });
    },

    resetGame: () => {
      set((state) => {
        Object.assign(state.game, initialGameState, {
          gameConfig: { ...initialGameConfig },
        });
      });
    },

    setGameStatus: (status) => {
      set((state) => {
        state.game.gameStatus = status;
      });
    },

    setRoundId: (roundId) => {
      set((state) => {
        state.game.roundId = roundId;
      });
    },

    // New Timer Actions
    startTimer: () => {
      set((state) => {
        if (state.game.timeLeft > 0) {
          state.game.isTimerRunning = true;
          state.game.isPlaying = true;
        }
      });
    },

    stopTimer: () => {
      set((state) => {
        state.game.isTimerRunning = false;
      });
    },

    resetTimer: (newTime = 15) => {
      set((state) => {
        state.game.timeLeft = newTime;
      });
    },

    tickTimer: () => {
      set((state) => {
        if (state.game.isTimerRunning) {
          // Clamp to 0 — never show a negative time value.
          state.game.timeLeft = Math.max(0, state.game.timeLeft - 1);
          if (state.game.timeLeft <= 0) {
            state.game.isTimerRunning = false;
            state.game.isPlaying = false; // Auto-end game
            state.game.lastPlayed = new Date();
          }
        }
      });
    },
  },
});
