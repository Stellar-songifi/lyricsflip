import { StateCreator } from 'zustand';
import { UserState, UserActions, Store } from '../game-types';
import { UserPreferences } from '../types';

export const initialUserPreferences: UserPreferences = {
  theme: 'light',
  soundEnabled: true,
  difficulty: 'normal',
};

export const initialUserState: UserState = {
  username: null,
  isLoggedIn: false,
  preferences: initialUserPreferences,
};

// Fixed type signature for the slice creator
export const createUserSlice: StateCreator<
Store,
[['zustand/immer', never]],
[['zustand/immer', never]],
{ user: UserState } & { user: UserActions }
> = (set) => ({
  user: {
    ...initialUserState,

    // Actions
    login: (username) => {
      set((state) => {
        state.user.username = username;
        state.user.isLoggedIn = true;
      });
    },

    logout: () => {
      set((state) => {
        state.user.username = null;
        state.user.isLoggedIn = false;
      });
    },

    updatePreferences: (preferences) => {
      set((state) => {
        state.user.preferences = {
          ...state.user.preferences,
          ...preferences,
        };
      });
    },

    toggleTheme: () => {
      set((state) => {
        state.user.preferences.theme = 
          state.user.preferences.theme === 'light' ? 'dark' : 'light';
      });
    },

    toggleSound: () => {
      set((state) => {
        state.user.preferences.soundEnabled = !state.user.preferences.soundEnabled;
      });
    },

    setDifficulty: (difficulty) => {
      set((state) => {
        state.user.preferences.difficulty = difficulty;
      });
    },
  },
});