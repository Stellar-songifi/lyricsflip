import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, persist } from 'zustand/middleware';
import { createGameSlice } from './slices/game-slice';
import { createUserSlice } from './slices/user-slice';
import { Store } from './game-types';
export const useStore = create<Store>()(
  devtools(
    persist(
      immer((...a) => ({
        ...createGameSlice(...a),
        ...createUserSlice(...a),
      })),
      {
        name: 'game-store',
        partialize: (state) => ({
          user: {
            preferences: state.user.preferences,
          },
        }),
      },
    ),
  ),
);
