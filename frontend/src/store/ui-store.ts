import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/**
 * UI-only state store.
 *
 * Chain/server data lives in React Query (LF-213). This store holds only
 * ephemeral UI state and user preferences. Only preferences (theme and the
 * username draft) are persisted.
 */

export type Theme = 'light' | 'dark' | 'system';

export interface ModalState {
  /** Identifier of the currently open modal, or null when none is open. */
  activeModal: string | null;
  /** Arbitrary payload passed to the active modal. */
  modalPayload: unknown;
}

export interface ModalSlice extends ModalState {
  openModal: (id: string, payload?: unknown) => void;
  closeModal: () => void;
  setModalPayload: (payload: unknown) => void;
}

export interface ThemeSlice {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export interface ProfileSlice {
  /** Draft username, persisted so it survives reloads. */
  usernameDraft: string;
  setUsernameDraft: (draft: string) => void;
  clearUsernameDraft: () => void;
}

export type UIStore = ModalSlice & ThemeSlice & ProfileSlice;

export const createModalSlice = (
  set: (fn: (state: UIStore) => void) => void,
): ModalSlice => ({
  activeModal: null,
  modalPayload: undefined,
  openModal: (id, payload) =>
    set((state) => {
      state.activeModal = id;
      state.modalPayload = payload;
    }),
  closeModal: () =>
    set((state) => {
      state.activeModal = null;
      state.modalPayload = undefined;
    }),
  setModalPayload: (payload) =>
    set((state) => {
      state.modalPayload = payload;
    }),
});

export const createThemeSlice = (
  set: (fn: (state: UIStore) => void) => void,
): ThemeSlice => ({
  theme: 'system',
  setTheme: (theme) =>
    set((state) => {
      state.theme = theme;
    }),
  toggleTheme: () =>
    set((state) => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
    }),
});

export const createProfileSlice = (
  set: (fn: (state: UIStore) => void) => void,
): ProfileSlice => ({
  usernameDraft: '',
  setUsernameDraft: (draft) =>
    set((state) => {
      state.usernameDraft = draft;
    }),
  clearUsernameDraft: () =>
    set((state) => {
      state.usernameDraft = '';
    }),
});

export const useUIStore = create<UIStore>()(
  persist(
    immer((set) => ({
      ...createModalSlice(set),
      ...createThemeSlice(set),
      ...createProfileSlice(set),
    })),
    {
      name: 'lyricsflip-ui-store',
      storage: createJSONStorage(() => localStorage),
      // Persist only preferences; modal state is ephemeral.
      partialize: (state) => ({
        theme: state.theme,
        usernameDraft: state.usernameDraft,
      }),
    },
  ),
);

/* -------------------------------------------------------------------------- */
/*                              Selector helpers                              */
/* -------------------------------------------------------------------------- */

export const selectActiveModal = (state: UIStore) => state.activeModal;
export const selectModalPayload = (state: UIStore) => state.modalPayload;
export const selectOpenModal = (state: UIStore) => state.openModal;
export const selectCloseModal = (state: UIStore) => state.closeModal;

export const selectTheme = (state: UIStore) => state.theme;
export const selectSetTheme = (state: UIStore) => state.setTheme;
export const selectToggleTheme = (state: UIStore) => state.toggleTheme;

export const selectUsernameDraft = (state: UIStore) => state.usernameDraft;
export const selectSetUsernameDraft = (state: UIStore) => state.setUsernameDraft;
export const selectClearUsernameDraft = (state: UIStore) => state.clearUsernameDraft;

export default useUIStore;