// UI-only store types. Chain/server data lives in React Query (LF-213);
// nothing here should mirror on-chain game state.

// Modal slice types
export type ModalName =
  | 'wallet'
  | 'settings'
  | 'profile'
  | 'leaderboard'
  | 'howToPlay'
  | null;

export interface ModalState {
  activeModal: ModalName;
  modalProps: Record<string, unknown>;
}

export interface ModalActions {
  openModal: (name: Exclude<ModalName, null>, props?: Record<string, unknown>) => void;
  closeModal: () => void;
}

// Theme slice types
export type Theme = 'light' | 'dark';

export interface ThemeState {
  theme: Theme;
}

export interface WagerDetails {
  genre: string;
  difficulty: string;
  duration?: string;
  odds?: string;
  wagerAmount: string;
  potentialWin?: string;
  stakeStroops?: string;
}

export interface ThemeActions {
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Profile slice types
export interface ProfileState {
  usernameDraft: string;
}

export interface ProfileActions {
  setUsernameDraft: (draft: string) => void;
  clearUsernameDraft: () => void;
}

// Preferences (persisted)
export interface UserPreferences {
  theme: Theme;
  soundEnabled: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
}

export interface PreferencesActions {
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  toggleSound: () => void;
  setDifficulty: (difficulty: UserPreferences['difficulty']) => void;
}

// Combined UI store type
export interface UIState {
  modal: ModalState;
  theme: ThemeState;
  profile: ProfileState;
  preferences: UserPreferences;
}

export interface UIActions {
  modal: ModalActions;
  theme: ThemeActions;
  profile: ProfileActions;
  preferences: PreferencesActions;
}

export type UIStore = UIState & UIActions;