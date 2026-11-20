import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GameResultModal } from '@/components/organisms/game-result-modal';
import { toast } from 'sonner';

const mockClaimWinnings = jest.fn();
const mockGetRound = jest.fn();

jest.mock('@/components/organisms/modal', () => ({
  Modal: ({ isOpen, children, footerContent }: any) =>
    isOpen ? (
      <div data-testid="modal">
        {children}
        {footerContent}
      </div>
    ) : null,
}));

jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: () => ({
    systemCalls: {
      claimWinnings: mockClaimWinnings,
      getRound: mockGetRound,
    },
    account: { address: 'GBTESTPLAYER123' },
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams('roundId=42'),
}));

jest.mock('sonner', () => ({
  toast: {
    loading: jest.fn().mockReturnValue('toast-1'),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('GameResultModal (LF-199)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders winner modal with Claim Winnings button', () => {
    render(
      <GameResultModal
        isOpen={true}
        modalType="won"
        roundId="42"
        roundData={{
          score: 5,
          maxRounds: 5,
          wagerAmount: '10',
          potentialWin: '20',
        }}
      />,
    );

    expect(screen.getByText(/You are amazing/i)).toBeInTheDocument();
    expect(screen.getByText(/10 XLM/i)).toBeInTheDocument();
    expect(screen.getByText(/20 XLM/i)).toBeInTheDocument();

    const claimBtn = screen.getByTestId('claim-winnings-button');
    expect(claimBtn).toBeInTheDocument();
    expect(claimBtn).toHaveTextContent('Claim Winnings');
  });

  it('claims winnings with pending and success toasts, then Claim button disappears', async () => {
    mockClaimWinnings.mockResolvedValueOnce(BigInt(20_0000000));

    render(
      <GameResultModal
        isOpen={true}
        modalType="won"
        roundId="42"
        roundData={{
          score: 5,
          maxRounds: 5,
          wagerAmount: '10',
          potentialWin: '20',
        }}
      />,
    );

    const claimBtn = screen.getByTestId('claim-winnings-button');
    fireEvent.click(claimBtn);

    expect(mockClaimWinnings).toHaveBeenCalledWith(BigInt(42));
    expect(toast.loading).toHaveBeenCalledWith('Claiming winnings…');

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Winnings claimed successfully'),
        expect.any(Object),
      );
    });

    // Button must disappear once claim succeeds
    await waitFor(() => {
      expect(screen.queryByTestId('claim-winnings-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('winnings-claimed-badge')).toBeInTheDocument();
    });
  });

  it('displays error toast when claim fails', async () => {
    mockClaimWinnings.mockRejectedValueOnce(new Error('Already claimed on-chain'));

    render(
      <GameResultModal
        isOpen={true}
        modalType="won"
        roundId="42"
        roundData={{
          score: 5,
          maxRounds: 5,
          wagerAmount: '10',
          potentialWin: '20',
        }}
      />,
    );

    const claimBtn = screen.getByTestId('claim-winnings-button');
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Already claimed on-chain', expect.any(Object));
    });
  });

  it('displays what the loser lost and does not show Claim button', () => {
    render(
      <GameResultModal
        isOpen={true}
        modalType="lost"
        roundId="42"
        roundData={{
          score: 2,
          maxRounds: 5,
          wagerAmount: '15',
        }}
      />,
    );

    expect(screen.getByText(/Better luck next time/i)).toBeInTheDocument();
    expect(screen.getByTestId('wager-lost-row')).toBeInTheDocument();
    expect(screen.getByText(/-15 XLM/i)).toBeInTheDocument();
    expect(screen.queryByTestId('claim-winnings-button')).not.toBeInTheDocument();
  });

  it('displays refund amount for a cancelled round and does not show Claim button', () => {
    render(
      <GameResultModal
        isOpen={true}
        modalType="cancelled"
        roundId="42"
        roundData={{
          wagerAmount: '25',
          refundAmount: '25',
          is_cancelled: true,
        }}
      />,
    );

    expect(screen.getByText(/Round Cancelled/i)).toBeInTheDocument();
    expect(screen.getByTestId('refund-row')).toBeInTheDocument();
    expect(screen.getByText(/\+25 XLM/i)).toBeInTheDocument();
    expect(screen.queryByTestId('claim-winnings-button')).not.toBeInTheDocument();
  });
});
