/**
 * LF-365: the "testnet was reset" banner must be driven by a real instance
 * lookup, and must stay quiet on RPC errors or non-testnet networks.
 */
const mockGetLedgerEntries = jest.fn();
const mockIsValidContract = jest.fn(
  (id: string) => typeof id === 'string' && id.startsWith('C') && id.length === 56,
);

const GAME_ID = 'C'.padEnd(56, 'A');
const NFT_ID = 'C'.padEnd(56, 'B');

jest.mock('@stellar/stellar-sdk', () => ({
  Address: jest.fn((id: string) => ({
    toScAddress: () => `address:${id}`,
  })),
  StrKey: { isValidContract: (id: string) => mockIsValidContract(id) },
  rpc: {
    Server: jest.fn(() => ({ getLedgerEntries: mockGetLedgerEntries })),
  },
  xdr: {
    LedgerKey: {
      contractData: jest.fn((data: { contract: string }) => ({
        toXDR: () => `key:${data.contract}`,
      })),
    },
    LedgerKeyContractData: jest.fn((input: unknown) => input),
    ScVal: { scvLedgerKeyContractInstance: () => 'instance' },
    ContractDataDurability: { persistent: 'persistent' },
  },
}));

let mockConfig: {
  rpcUrl: string;
  networkPassphrase: string;
  lyricsflipContractId: string;
  lyricsflipNftContractId: string;
};
jest.mock('@/lib/stellar/stellar-config', () => ({
  createConfig: () => mockConfig,
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import {
  TESTNET_PASSPHRASE,
  findMissingContracts,
  useContractAvailability,
} from '@/lib/stellar/hooks/use-contract-availability';

const entryFor = (id: string) => ({ key: { toXDR: () => `key:address:${id}` } });

const testnetConfig = (overrides: Partial<typeof mockConfig> = {}) => ({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: TESTNET_PASSPHRASE,
  lyricsflipContractId: GAME_ID,
  lyricsflipNftContractId: NFT_ID,
  ...overrides,
});

describe('findMissingContracts', () => {
  beforeEach(() => {
    mockGetLedgerEntries.mockReset();
  });

  it('returns only the IDs whose instance entry is absent', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [entryFor(GAME_ID)] });

    await expect(findMissingContracts([GAME_ID, NFT_ID], 'https://rpc')).resolves.toEqual([
      NFT_ID,
    ]);
    expect(mockGetLedgerEntries).toHaveBeenCalledTimes(1);
    expect(mockGetLedgerEntries.mock.calls[0]).toHaveLength(2);
  });

  it('returns an empty list when every instance exists', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [entryFor(GAME_ID), entryFor(NFT_ID)] });

    await expect(findMissingContracts([GAME_ID, NFT_ID], 'https://rpc')).resolves.toEqual([]);
  });

  it('does not call RPC without IDs', async () => {
    await expect(findMissingContracts([], 'https://rpc')).resolves.toEqual([]);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('propagates RPC failures so callers cannot misreport a reset', async () => {
    mockGetLedgerEntries.mockRejectedValue(new Error('RPC down'));

    await expect(findMissingContracts([GAME_ID], 'https://rpc')).rejects.toThrow('RPC down');
  });
});

describe('useContractAvailability', () => {
  beforeEach(() => {
    mockGetLedgerEntries.mockReset();
    mockIsValidContract.mockClear();
    mockConfig = testnetConfig();
  });

  it('reports a reset when a recorded instance is missing', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [entryFor(GAME_ID)] });

    const { result } = renderHook(() => useContractAvailability());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTestnetReset).toBe(true);
    expect(result.current.missingContracts).toEqual([NFT_ID]);
  });

  it('stays quiet on a healthy testnet', async () => {
    mockGetLedgerEntries.mockResolvedValue({ entries: [entryFor(GAME_ID), entryFor(NFT_ID)] });

    const { result } = renderHook(() => useContractAvailability());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTestnetReset).toBe(false);
    expect(result.current.missingContracts).toEqual([]);
  });

  it('does not check networks that are not periodically reset', async () => {
    mockConfig = testnetConfig({ networkPassphrase: 'Public Global Stellar Network ; September 2015' });

    const { result } = renderHook(() => useContractAvailability());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
    expect(result.current.isTestnetReset).toBe(false);
  });

  it('ignores unconfigured or invalid contract IDs', async () => {
    mockConfig = testnetConfig({ lyricsflipContractId: '', lyricsflipNftContractId: 'nope' });

    const { result } = renderHook(() => useContractAvailability());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockIsValidContract).toHaveBeenCalled();
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
    expect(result.current.isTestnetReset).toBe(false);
  });

  it('does not claim a reset when the RPC call fails', async () => {
    mockGetLedgerEntries.mockRejectedValue(new Error('RPC down'));

    const { result } = renderHook(() => useContractAvailability());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTestnetReset).toBe(false);
  });

  it('checks again on refresh and on the poll interval', async () => {
    jest.useFakeTimers();
    mockGetLedgerEntries.mockResolvedValue({ entries: [entryFor(GAME_ID), entryFor(NFT_ID)] });

    try {
      const { result } = renderHook(() => useContractAvailability(1000));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockGetLedgerEntries).toHaveBeenCalledTimes(1);

      act(() => result.current.refresh());
      await waitFor(() => expect(mockGetLedgerEntries).toHaveBeenCalledTimes(2));

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      await waitFor(() => expect(mockGetLedgerEntries).toHaveBeenCalledTimes(3));
    } finally {
      jest.useRealTimers();
    }
  });
});
