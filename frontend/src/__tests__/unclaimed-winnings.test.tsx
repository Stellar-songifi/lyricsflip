import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnclaimedWinnings, type UnclaimedWinningItem } from '@/components/organisms/unclaimed-winnings';
import { toast } from 'sonner';

const mockClaimWinnings = jest.fn();

jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: () => ({
    systemCalls: {
      claimWinnings: mockClaimWinnings,
    },
    account: { address: 'GBTESTPLAYER123' },
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    loading: jest.fn().mockReturnValue('toast-claim-1'),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('UnclaimedWinnings (LF-199)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when there are no unclaimed rounds', async () => {
    render(<UnclaimedWinnings address="GBTESTPLAYER123" initialItems={[]} />);

    expect(screen.getByText('Unclaimed Winnings')).toBeInTheDocument();
    expect(screen.getByText('No unclaimed winnings')).toBeInTheDocument();
  });

  it('renders claimable rounds with round ID, wager, and prize', async () => {
    const items: UnclaimedWinningItem[] = [
      {
        roundId: '101',
        wagerAmount: '10',
        potentialWinnings: '20',
        asset: 'XLM',
        status: 'won',
      },
      {
        roundId: '102',
        wagerAmount: '25',
        potentialWinnings: '50',
        asset: 'XLM',
        status: 'won',
      },
    ];

    render(<UnclaimedWinnings address="GBTESTPLAYER123" initialItems={items} />);

    expect(screen.getByText('Round #101')).toBeInTheDocument();
    expect(screen.getByText('Wager: 10 XLM')).toBeInTheDocument();
    expect(screen.getByText('+20 XLM')).toBeInTheDocument();

    expect(screen.getByText('Round #102')).toBeInTheDocument();
    expect(screen.getByText('Wager: 25 XLM')).toBeInTheDocument();
    expect(screen.getByText('+50 XLM')).toBeInTheDocument();

    const claimButtons = screen.getAllByRole('button', { name: /^claim$/i });
    expect(claimButtons).toHaveLength(2);
  });

  it('winner can claim from profile page and the Claim button disappears upon success', async () => {
    mockClaimWinnings.mockResolvedValueOnce(BigInt(20_0000000));

    const items: UnclaimedWinningItem[] = [
      {
        roundId: '101',
        wagerAmount: '10',
        potentialWinnings: '20',
        asset: 'XLM',
        status: 'won',
      },
    ];

    render(<UnclaimedWinnings address="GBTESTPLAYER123" initialItems={items} />);

    const claimBtn = screen.getByTestId('claim-button-101');
    expect(claimBtn).toBeInTheDocument();

    fireEvent.click(claimBtn);

    expect(mockClaimWinnings).toHaveBeenCalledWith(BigInt(101));
    expect(toast.loading).toHaveBeenCalledWith(expect.stringContaining('Claiming winnings for Round #101'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Winnings claimed for Round #101'),
        expect.any(Object),
      );
    });

    // Acceptance criteria: button disappears once the claim succeeds
    await waitFor(() => {
      expect(screen.queryByTestId('claim-button-101')).not.toBeInTheDocument();
      expect(screen.getByTestId('claimed-status-101')).toBeInTheDocument();
    });
  });

  it('shows error toast when claim fails and preserves claim button', async () => {
    mockClaimWinnings.mockRejectedValueOnce(new Error('Network error'));

    const items: UnclaimedWinningItem[] = [
      {
        roundId: '101',
        wagerAmount: '10',
        potentialWinnings: '20',
        asset: 'XLM',
        status: 'won',
      },
    ];

    render(<UnclaimedWinnings address="GBTESTPLAYER123" initialItems={items} />);

    const claimBtn = screen.getByTestId('claim-button-101');
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error', expect.any(Object));
    });

    expect(screen.getByTestId('claim-button-101')).toBeInTheDocument();
  });
});
