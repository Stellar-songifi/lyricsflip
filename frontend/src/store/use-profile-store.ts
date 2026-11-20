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
import { get as apiGet } from '@/services/api';

/** Player profile returned by `GET /user/players/:address`. */
export interface Profile {
  address: string;
  username?: string;
  [key: string]: unknown;
}

interface ProfileState {
  /** Fetched player profiles keyed by Stellar address. */
  profiles: Record<string, Profile>;
  /** Fetch and cache one player's profile. Failures are ignored. */
  fetchProfile: (address: string) => Promise<void>;
  /** Fetch and cache every profile not already cached. */
  fetchProfiles: (addresses: string[]) => Promise<void>;
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
      profiles: {},

      fetchProfile: async (address) => {
        try {
          const profile = await apiGet<Profile>(
            `/user/players/${encodeURIComponent(address)}`,
          );
          set((state) => ({
            profiles: { ...state.profiles, [address]: { ...profile, address } },
          }));
        } catch {
          // Unknown players have no profile; callers fall back to the address.
        }
      },

      fetchProfiles: async (addresses) => {
        const missing = [...new Set(addresses)].filter(
          (address) => !get().profiles[address],
        );
        await Promise.all(
          missing.map((address) => get().fetchProfile(address)),
        );
      },

      setUsername: (address, username) =>
        set((state) => ({
          usernames: { ...state.usernames, [address]: username },
        })),

      getUsername: (address) => get().usernames[address],
    }),
    {
      name: 'lyricsflip-profiles',
      partialize: (state) => ({ usernames: state.usernames }),
    },
  ),
);
