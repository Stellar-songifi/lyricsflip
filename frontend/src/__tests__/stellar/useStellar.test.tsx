/**
 * Tests for src/lib/stellar/hooks/useStellar.ts
 * Verifies the hook reads from StellarContext and surfaces the right shape.
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import { StellarContext } from '@/lib/stellar/StellarProvider';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import type { StellarContextType } from '@/lib/stellar/StellarProvider';
import type { SystemCalls } from '@/lib/stellar/client';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

const mockSystemCalls = { getPlayerStat: jest.fn() } as unknown as SystemCalls;

const buildContextValue = (overrides: Partial<StellarContextType> = {}): StellarContextType => ({
  setup: null,
  account: null,
  isLoading: false,
  error: null,
  warnings: [],
  connect: mockConnect,
  disconnect: mockDisconnect,
  ...overrides,
});

const makeWrapper =
  (contextValue: StellarContextType) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(StellarContext.Provider, { value: contextValue }, children);

describe('useStellar', () => {
  it('returns null systemCalls when setup is null', () => {
    const { result } = renderHook(() => useStellar(), {
      wrapper: makeWrapper(buildContextValue({ setup: null })),
    });

    expect(result.current.systemCalls).toBeNull();
    expect(result.current.account).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns systemCalls from setup when connected', () => {
    const contextValue = buildContextValue({
      setup: { systemCalls: mockSystemCalls, account: { address: 'GTEST123' } },
      account: { address: 'GTEST123' },
    });

    const { result } = renderHook(() => useStellar(), {
      wrapper: makeWrapper(contextValue),
    });

    expect(result.current.systemCalls).toBe(mockSystemCalls);
    expect(result.current.account?.address).toBe('GTEST123');
  });

  it('forwards connect and disconnect functions', () => {
    const { result } = renderHook(() => useStellar(), {
      wrapper: makeWrapper(buildContextValue()),
    });

    expect(result.current.connect).toBe(mockConnect);
    expect(result.current.disconnect).toBe(mockDisconnect);
  });

  it('forwards isLoading state', () => {
    const { result } = renderHook(() => useStellar(), {
      wrapper: makeWrapper(buildContextValue({ isLoading: true })),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('forwards error state', () => {
    const error = new Error('wallet error');
    const { result } = renderHook(() => useStellar(), {
      wrapper: makeWrapper(buildContextValue({ error })),
    });

    expect(result.current.error).toBe(error);
  });

  it('forwards warnings array', () => {
    const warnings = ['missing contract id', 'missing nft contract id'];
    const { result } = renderHook(() => useStellar(), {
      wrapper: makeWrapper(buildContextValue({ warnings })),
    });

    expect(result.current.warnings).toEqual(warnings);
  });
});
