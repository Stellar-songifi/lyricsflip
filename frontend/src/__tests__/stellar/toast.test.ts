/**
 * Tests for src/lib/stellar/toast.ts
 *
 * Covers:
 *  - assertSufficientBalance via the public withTxToast / withTxToastResult API
 *  - Balance pre-check: account not found (404), insufficient balance, Horizon down
 *  - withTxToast: success path, contract error, user rejection, generic error
 *  - withTxToastResult: returns TxResult with closedAtSeconds and txHash
 *
 * Part of Issue #908 / LF-322.
 */

import { withTxToast, withTxToastResult } from '@/lib/stellar/toast';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('sonner', () => ({
  toast: {
    loading: jest.fn(() => 'mock-toast-id'),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/error-reporting', () => ({
  reportError: jest.fn(),
}));

// We mock global fetch to control Horizon balance responses.
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PASSPHRASE = 'Test SDF Network ; September 2015';
const TEST_ADDRESS = 'GABCDE1234567890TESTADDRESS';

/** Builds a minimal contract.AssembledTransaction mock. */
function makeAssembled<T>(
  result: T,
  options: { hash?: string; createdAt?: number } = {},
) {
  const { hash = 'TX_HASH_ABC', createdAt = 1_700_000_000 } = options;
  return {
    result,
    sign: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue({
      result,
      sendTransactionResponse: { hash },
      getTransactionResponse: { createdAt, ledger: 100 },
    }),
  };
}

/** Returns a mock Horizon 200 response with the given XLM balance. */
function horizonSuccess(xlmBalance: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ balances: [{ asset_type: 'native', balance: xlmBalance }] }),
  });
}

/** Returns a mock Horizon 404 (account not found). */
function horizonNotFound() {
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
}

/** Returns a mock Horizon 500 (server error — should be treated as unavailable). */
function horizonError() {
  return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
}

// ---------------------------------------------------------------------------
// withTxToastResult — success path
// ---------------------------------------------------------------------------

describe('withTxToastResult – success', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(horizonSuccess('10.0000000'));
  });

  it('returns the result, closedAtSeconds, and txHash on success', async () => {
    const assembled = makeAssembled(42, { hash: 'MY_HASH', createdAt: 1_800_000_000 });
    const res = await withTxToastResult(
      () => Promise.resolve(assembled as any),
      TEST_PASSPHRASE,
      undefined,
      TEST_ADDRESS,
    );
    expect(res.result).toBe(42);
    expect(res.closedAtSeconds).toBe(1_800_000_000);
    expect(res.txHash).toBe('MY_HASH');
  });

  it('calls sign then send in order', async () => {
    const assembled = makeAssembled(true);
    await withTxToastResult(
      () => Promise.resolve(assembled as any),
      TEST_PASSPHRASE,
    );
    expect(assembled.sign).toHaveBeenCalledTimes(1);
    expect(assembled.send).toHaveBeenCalledTimes(1);
    const signOrder = assembled.sign.mock.invocationCallOrder[0];
    const sendOrder = assembled.send.mock.invocationCallOrder[0];
    expect(signOrder).toBeLessThan(sendOrder);
  });

  it('sets closedAtSeconds to null when getTransactionResponse has no createdAt', async () => {
    const assembled = {
      result: 'x',
      sign: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue({
        result: 'x',
        sendTransactionResponse: { hash: 'H' },
        getTransactionResponse: {},
      }),
    };
    const res = await withTxToastResult(
      () => Promise.resolve(assembled as any),
      TEST_PASSPHRASE,
    );
    expect(res.closedAtSeconds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// withTxToast — convenience wrapper
// ---------------------------------------------------------------------------

describe('withTxToast', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(horizonSuccess('10.0000000'));
  });

  it('returns just the result value', async () => {
    const assembled = makeAssembled('hello');
    const result = await withTxToast(
      () => Promise.resolve(assembled as any),
      TEST_PASSPHRASE,
    );
    expect(result).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Balance pre-check
// ---------------------------------------------------------------------------

describe('balance pre-check', () => {
  it('throws a friendly error when the Horizon account is not found (404)', async () => {
    mockFetch.mockResolvedValue(horizonNotFound());
    const assembled = makeAssembled(true);

    await expect(
      withTxToastResult(
        () => Promise.resolve(assembled as any),
        TEST_PASSPHRASE,
        undefined,
        TEST_ADDRESS,
      ),
    ).rejects.toThrow(/account not found|does not exist/i);
    // Should not have called sign at all
    expect(assembled.sign).not.toHaveBeenCalled();
  });

  it('throws a friendly error when XLM balance is below minimum', async () => {
    // 0.0000001 XLM = 1 stroop — well below the 0.1 XLM minimum
    mockFetch.mockResolvedValue(horizonSuccess('0.0000001'));
    const assembled = makeAssembled(true);

    await expect(
      withTxToastResult(
        () => Promise.resolve(assembled as any),
        TEST_PASSPHRASE,
        undefined,
        TEST_ADDRESS,
      ),
    ).rejects.toThrow(/txInsufficientBalance|balance.*too low/i);
    expect(assembled.sign).not.toHaveBeenCalled();
  });

  it('proceeds when balance is exactly at the minimum (0.1 XLM)', async () => {
    mockFetch.mockResolvedValue(horizonSuccess('0.1000000'));
    const assembled = makeAssembled(true);

    await expect(
      withTxToastResult(
        () => Promise.resolve(assembled as any),
        TEST_PASSPHRASE,
        undefined,
        TEST_ADDRESS,
      ),
    ).resolves.toBeDefined();
    expect(assembled.sign).toHaveBeenCalled();
  });

  it('proceeds when Horizon is unavailable (non-404 HTTP error)', async () => {
    mockFetch.mockResolvedValue(horizonError());
    const assembled = makeAssembled(true);

    // Horizon 500 → silently ignore and let the transaction attempt proceed
    await expect(
      withTxToastResult(
        () => Promise.resolve(assembled as any),
        TEST_PASSPHRASE,
        undefined,
        TEST_ADDRESS,
      ),
    ).resolves.toBeDefined();
    expect(assembled.sign).toHaveBeenCalled();
  });

  it('proceeds when Horizon fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));
    const assembled = makeAssembled(true);

    await expect(
      withTxToastResult(
        () => Promise.resolve(assembled as any),
        TEST_PASSPHRASE,
        undefined,
        TEST_ADDRESS,
      ),
    ).resolves.toBeDefined();
    expect(assembled.sign).toHaveBeenCalled();
  });

  it('skips balance check when no publicKey is supplied', async () => {
    // fetch should NOT be called
    const assembled = makeAssembled(99);
    await withTxToastResult(() => Promise.resolve(assembled as any), TEST_PASSPHRASE);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error handling inside withTxToastResult
// ---------------------------------------------------------------------------

describe('withTxToastResult – error handling', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(horizonSuccess('10.0000000'));
  });

  it('re-throws the error after showing a toast', async () => {
    const { toast } = await import('sonner');
    const err = new Error('Simulation failed: Error(Contract, #34)');
    const assembled = {
      result: null,
      sign: jest.fn().mockRejectedValue(err),
      send: jest.fn(),
    };

    await expect(
      withTxToastResult(() => Promise.resolve(assembled as any), TEST_PASSPHRASE),
    ).rejects.toThrow(err);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('All cards have been drawn'),
      expect.any(Object),
    );
  });

  it('shows user-rejection message for cancelled signature', async () => {
    const { toast } = await import('sonner');
    const assembled = {
      result: null,
      sign: jest.fn().mockRejectedValue(new Error('User cancelled signature request')),
      send: jest.fn(),
    };

    await expect(
      withTxToastResult(() => Promise.resolve(assembled as any), TEST_PASSPHRASE),
    ).rejects.toThrow();

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('rejected the signature request'),
      expect.any(Object),
    );
  });

  it('shows Horizon RPC error message for account not found during simulation', async () => {
    const { toast } = await import('sonner');
    const assembled = {
      result: null,
      sign: jest.fn().mockRejectedValue(
        new Error('source account not found during simulation'),
      ),
      send: jest.fn(),
    };

    await expect(
      withTxToastResult(() => Promise.resolve(assembled as any), TEST_PASSPHRASE),
    ).rejects.toThrow();

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('XLM'),
      expect.any(Object),
    );
  });

  it('calls reportError for unexpected errors', async () => {
    const { reportError } = await import('@/lib/error-reporting');
    const assembled = {
      result: null,
      sign: jest.fn().mockRejectedValue(new Error('Unexpected RPC crash')),
      send: jest.fn(),
    };

    await expect(
      withTxToastResult(() => Promise.resolve(assembled as any), TEST_PASSPHRASE),
    ).rejects.toThrow();

    expect(reportError).toHaveBeenCalled();
  });
});
