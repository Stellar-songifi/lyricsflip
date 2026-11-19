'use client';

import { create } from 'zustand';
import { get as apiGet } from '@/services/api';

/** How often the unread badge is refreshed while subscribed. */
const UNREAD_POLL_MS = 60_000;

interface NotificationState {
  /** Unread notifications for the signed-in user. */
  unreadCount: number;
  /** Loads the unread count from `GET /notifications/unread-count`. */
  fetchUnreadCount: () => Promise<void>;
  /** Polls the unread count; returns a function that stops polling. */
  subscribeToNotifications: () => () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  unreadCount: 0,

  fetchUnreadCount: async () => {
    try {
      const { count } = await apiGet<{ count: number }>(
        '/notifications/unread-count',
      );
      set({ unreadCount: count });
    } catch {
      // Signed-out users have no notifications; keep the badge hidden.
    }
  },

  subscribeToNotifications: () => {
    const id = setInterval(() => void get().fetchUnreadCount(), UNREAD_POLL_MS);
    return () => clearInterval(id);
  },
}));
