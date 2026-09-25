'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

type ThemeState = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

/**
 * Returns the OS-level color scheme preference (or 'light' if unavailable).
 * Used as the initial value when no persisted preference exists.
 */
const getSystemTheme = (): Theme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

/**
 * Applies the theme class to <html> and persists the choice in localStorage.
 * Using Zustand `persist` so the theme survives page reloads.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light', // Overridden by persisted value or initialised from system preference below
      toggleTheme: () =>
        set((state) => {
          const newTheme: Theme = state.theme === 'light' ? 'dark' : 'light';
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', newTheme === 'dark');
          }
          return { theme: newTheme };
        }),
      setTheme: (theme: Theme) =>
        set(() => {
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', theme === 'dark');
          }
          return { theme };
        }),
    }),
    {
      name: 'lyricsflip-theme', // localStorage key
      onRehydrateStorage: () => (state) => {
        // After rehydration, sync the class with the persisted value.
        if (state && typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', state.theme === 'dark');
        }
      },
    },
  ),
);

/**
 * Call once (e.g. in a top-level `<script>` or `ThemeProvider` component)
 * to initialise the theme from the system preference when no persisted choice
 * exists yet. This prevents a flash of the wrong theme on first load.
 */
export const initThemeFromSystem = (): void => {
  const stored = localStorage.getItem('lyricsflip-theme');
  if (stored) return; // Already have a user preference
  const systemTheme = getSystemTheme();
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', systemTheme === 'dark');
  }
};
