/**
 * LF-203: loading the badge gallery makes at most 2 RPC calls, however many
 * tokens exist in total.
 */
const mockSimulate = jest.fn();
const mockGetLedgerEntries = jest.fn();

// The real SDK can't load under this Jest setup (ESM-only deps), so this is a
// minimal stand-in: ScVals are plain values and ledger keys serialise to the
// token id they point at.
jest.mock('@stellar/stellar-sdk', () => {
  const chain = { addOperation: () => chain, setTimeout: () => chain, build: () => ({}) };
  return {
    Account: jest.fn(),
    Address: jest.fn(() => ({ toScAddress: () => 'contract' })),
    BASE_FEE: '100',
    Contract: jest.fn(() => ({ call: jest.fn(() => 'op') })),
    TransactionBuilder: jest.fn(() => chain),
    nativeToScVal: (value: unknown) => value,
    scValToNative: (value: unknown) => value,
    rpc: {
      Server: jest.fn(() => ({
        simulateTransaction: mockSimulate,
        getLedgerEntries: mockGetLedgerEntries,
      })),
      Api: { isSimulationError: (sim: object) => 'error' in sim },
    },
    xdr: {
      LedgerKey: {
        contractData: (data: { key: unknown[] }) => ({
          toXDR: () => `key:${String(data.key[1])}`,
        }),
      },
      LedgerKeyContractData: jest.fn((input) => input),
      ScVal: { scvVec: (items: unknown[]) => items, scvSymbol: (s: string) => s },
      ContractDataDurability: { persistent: 'persistent' },
    },
  };
});

jest.mock('@/lib/stellar/stellar-config', () => ({
  createConfig: () => ({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    lyricsflipNftContractId: 'CNFT',
  }),
}));

import { fetchOwnedNfts } from '@/hooks/use-owned-nfts';

const kindEntry = (tokenId: bigint, kind: number) => ({
  key: { toXDR: () => `key:${tokenId}` },
  val: { type: 'contractData', contractData: { val: kind } },
});

describe('fetchOwnedNfts', () => {
  beforeEach(() => {
    mockSimulate.mockReset();
    mockGetLedgerEntries.mockReset();
  });

  it('lists tokens with their milestone in exactly two RPC calls', async () => {
    // Many tokens exist in total; the owner holds 7 and 3.
    mockSimulate.mockResolvedValue({ result: { retval: [BigInt(7), BigInt(3)] } });
    // Token 3 has kind 2 (TenWins); token 7 has no stored kind, so it is 0.
    mockGetLedgerEntries.mockResolvedValue({ entries: [kindEntry(BigInt(3), 2)] });

    const nfts = await fetchOwnedNfts('GOWNER');

    expect(mockSimulate).toHaveBeenCalledTimes(1);
    expect(mockGetLedgerEntries).toHaveBeenCalledTimes(1);
    expect(mockGetLedgerEntries.mock.calls[0]).toHaveLength(2);
    expect(nfts).toEqual([
      { tokenId: BigInt(3), kind: 2, name: 'Music Connoisseur' },
      { tokenId: BigInt(7), kind: 0, name: 'First Win' },
    ]);
  });

  it('makes a single call when the owner has no tokens', async () => {
    mockSimulate.mockResolvedValue({ result: { retval: [] } });

    await expect(fetchOwnedNfts('GOWNER')).resolves.toEqual([]);
    expect(mockSimulate).toHaveBeenCalledTimes(1);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('surfaces simulation errors', async () => {
    mockSimulate.mockResolvedValue({ error: 'boom' });

    await expect(fetchOwnedNfts('GOWNER')).rejects.toThrow('boom');
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });
});
