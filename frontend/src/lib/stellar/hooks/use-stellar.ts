'use client';

// Replaces `frontend/src/lib/dojo/hooks/useDojo.ts`. Keeps the same
// `{ setup, account, isLoading, error }` return shape as the Dojo hook plus
// a top-level `systemCalls` (which many components already destructured
// from `useDojo()` even though the Dojo hook never actually provided it —
// that wiring is completed here rather than carried over broken).

import { useContext } from 'react';
import { StellarContext, type StellarContextType, type StellarSetupResult } from '../stellar-provider';
import type { SystemCalls } from '../client';
import type { StellarAccount } from '../types';

export type { StellarSetupResult as StellarSetup };

export interface UseStellarResult {
  setup: StellarSetupResult | null;
  systemCalls: SystemCalls | null;
  account: StellarAccount | null;
  isLoading: boolean;
  error: Error | null;
  warnings: string[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** True once the user holds a backend session (signed challenge or restored cookie). */
  isAuthenticated: boolean;
  authError: Error | null;
  /** True once the reload-time session restore has finished. */
  isSessionChecked: boolean;
}

export function useStellar(): UseStellarResult {
  const {
    setup,
    account,
    isLoading,
    error,
    warnings,
    connect,
    disconnect,
    isAuthenticated,
    authError,
    isSessionChecked,
  }: StellarContextType = useContext(StellarContext);

  return {
    setup,
    systemCalls: setup?.systemCalls ?? null,
    account,
    isLoading,
    error,
    warnings,
    connect,
    disconnect,
    isAuthenticated,
    authError,
    isSessionChecked,
  };
}
