'use client';

/**
 * Lightweight username store persisted to localStorage.
 *
 * The backend auth (LF-082) is not yet available, so we persist the username
 * client-side using Zustand's `persist` middleware.  When the backend lands,
 * this store can be wired to an API call without changing the consumer API.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  /** The address → username mapping stored locally. */
  usernames: Record<string, string>;
  /** Set a username for a given Stellar address. */
  setUsername: (address: string, username: string) => void;
  /** Retrieve the stored username for a given address, or undefined. */
  getUsername: (address: string) => string | undefined;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      usernames: {},

      setUsername: (address, username) =>
        set((state) => ({
          usernames: { ...state.usernames, [address]: username },
        })),

      getUsername: (address) => get().usernames[address],
    }),
    {
      name: 'lyricsflip-profiles',
    },
  ),
);
