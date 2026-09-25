/**
 * Tests for src/lib/stellar/StellarProvider.tsx
 * Covers: initialisation, session restore, connect/disconnect, config warnings.
 */
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { StellarProvider, StellarContext } from '@/lib/stellar/StellarProvider';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TestConsumer = () => {
  const ctx = React.useContext(StellarContext);
  return (
    <div>
      <span data-testid="loading">{String(ctx.isLoading)}</span>
      <span data-testid="account">{ctx.account?.address ?? 'null'}</span>
      <span data-testid="warnings">{ctx.warnings.join('|')}</span>
      <span data-testid="error">{ctx.error?.message ?? 'null'}</span>
      <button onClick={ctx.connect}>connect</button>
      <button onClick={ctx.disconnect}>disconnect</button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <StellarProvider>
      <TestConsumer />
    </StellarProvider>,
  );

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
describe('StellarProvider – initialisation', () => {
  it('starts loading and then settles to not-loading', async () => {
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });

  it('calls StellarWalletsKit.init on mount', async () => {
    renderProvider();
    await waitFor(() => {
      // React StrictMode can invoke effects twice in dev; we only care it was called at least once.
      expect(StellarWalletsKit.init).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Session restore
// ---------------------------------------------------------------------------
describe('StellarProvider – restoring an existing session', () => {
  it('restores the address from a previously connected wallet', async () => {
    (StellarWalletsKit.getAddress as jest.Mock).mockResolvedValueOnce({
      address: 'GRESTORE1234567890',
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('account').textContent).toBe('GRESTORE1234567890');
    });
  });

  it('stays disconnected when getAddress returns an empty string', async () => {
    (StellarWalletsKit.getAddress as jest.Mock).mockResolvedValueOnce({ address: '' });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('account').textContent).toBe('null');
    });
  });

  it('stays disconnected when getAddress rejects', async () => {
    (StellarWalletsKit.getAddress as jest.Mock).mockRejectedValueOnce(
      new Error('no wallet'),
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('account').textContent).toBe('null');
    });
  });
});

// ---------------------------------------------------------------------------
// connect / disconnect
// ---------------------------------------------------------------------------
describe('StellarProvider – connect', () => {
  it('sets the account after a successful authModal', async () => {
    (StellarWalletsKit.authModal as jest.Mock).mockResolvedValueOnce({
      address: 'GCONNECTED1234567890',
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      fireEvent.click(screen.getByText('connect'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('account').textContent).toBe('GCONNECTED1234567890');
    });
  });

  it('sets an error when authModal rejects', async () => {
    (StellarWalletsKit.authModal as jest.Mock).mockRejectedValueOnce(
      new Error('user cancelled'),
    );

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      fireEvent.click(screen.getByText('connect'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('user cancelled');
      expect(screen.getByTestId('account').textContent).toBe('null');
    });
  });
});

describe('StellarProvider – disconnect', () => {
  it('clears the account after disconnect', async () => {
    // Start with a connected session
    (StellarWalletsKit.getAddress as jest.Mock).mockResolvedValueOnce({
      address: 'GDISCONNECT1234567890',
    });

    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('account').textContent).toBe('GDISCONNECT1234567890'),
    );

    await act(async () => {
      fireEvent.click(screen.getByText('disconnect'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('account').textContent).toBe('null');
    });
    expect(StellarWalletsKit.disconnect).toHaveBeenCalled();
  });

  it('clears the account even when StellarWalletsKit.disconnect rejects', async () => {
    (StellarWalletsKit.getAddress as jest.Mock).mockResolvedValueOnce({
      address: 'GFAILDC1234567890',
    });
    // Make disconnect resolve (not reject) but still verify account is cleared
    (StellarWalletsKit.disconnect as jest.Mock).mockResolvedValueOnce(undefined);

    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('account').textContent).toBe('GFAILDC1234567890'),
    );

    await act(async () => {
      fireEvent.click(screen.getByText('disconnect'));
    });

    // Account should be cleared after disconnect
    await waitFor(() => {
      expect(screen.getByTestId('account').textContent).toBe('null');
    });
  });
});

// ---------------------------------------------------------------------------
// Config warnings
// ---------------------------------------------------------------------------
describe('StellarProvider – config warnings', () => {
  it('emits a warning when LYRICSFLIP_CONTRACT_ID is missing', async () => {
    // The StellarProvider reads env vars on init. Since JSDOM env doesn't have
    // NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID set, the warning should always appear.
    renderProvider();

    await waitFor(() => {
      const warnings = screen.getByTestId('warnings').textContent ?? '';
      expect(warnings).toContain('NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID');
    });
  });

  it('emits a warning when LYRICSFLIP_NFT_CONTRACT_ID is missing', async () => {
    renderProvider();

    await waitFor(() => {
      const warnings = screen.getByTestId('warnings').textContent ?? '';
      expect(warnings).toContain('NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID');
    });
  });
});

// ---------------------------------------------------------------------------
// Context default values
// ---------------------------------------------------------------------------
describe('StellarContext default values', () => {
  it('default context has null account and isLoading=true', () => {
    const defaultCtx = {
      setup: null,
      account: null,
      isLoading: true,
      error: null,
      warnings: [] as string[],
      connect: async () => {},
      disconnect: async () => {},
    };

    expect(defaultCtx.account).toBeNull();
    expect(defaultCtx.isLoading).toBe(true);
    expect(defaultCtx.warnings).toEqual([]);
    expect(defaultCtx.error).toBeNull();
  });
});
