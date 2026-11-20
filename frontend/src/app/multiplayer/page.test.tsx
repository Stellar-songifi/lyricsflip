import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MultiplayerPage from './page';
import type { OpenRound } from '@/hooks/use-open-rounds';

const mockPush = jest.fn();
const mockCreateRound = jest.fn();
const mockJoinRound = jest.fn();
const mockCancelRound = jest.fn();
const mockConnect = jest.fn();
const mockRefresh = jest.fn();
const mockUseOpenRounds = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: () => ({
    systemCalls: {
      createRound: mockCreateRound,
      joinRound: mockJoinRound,
      cancelRound: mockCancelRound,
    },
    account: { address: 'GCREATOR' },
    connect: mockConnect,
  }),
}));

jest.mock('@/hooks/use-open-rounds', () => ({
  useOpenRounds: (...args: unknown[]) => mockUseOpenRounds(...args),
}));

const makeEntry = (
  roundId: number,
  overrides: Partial<OpenRound> = {},
): OpenRound => ({
  round: {
    round_id: BigInt(roundId),
    admin: 'GADMIN',
    genre: 'Pop',
    wager_amount: BigInt(0),
    start_time: BigInt(0),
    is_started: false,
    is_completed: false,
    end_time: BigInt(0),
    next_card_index: 0,
    is_cancelled: false,
  },
  players: ['GADMIN'],
  playerCount: 1,
  maxPlayers: 4,
  createdAtSeconds: Math.floor(Date.now() / 1000) - 90,
  isFull: false,
  isExpired: false,
  ...overrides,
});

const setOpenRounds = (rounds: OpenRound[]) => {
  mockUseOpenRounds.mockReturnValue({
    rounds,
    isLoading: false,
    error: null,
    lastUpdatedAt: Date.now(),
    refresh: mockRefresh,
  });
};

describe('MultiplayerLobbyPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRound.mockResolvedValue(BigInt(42));
    mockJoinRound.mockResolvedValue(undefined);
    mockCancelRound.mockResolvedValue(undefined);
    mockRefresh.mockResolvedValue(undefined);
    setOpenRounds([makeEntry(1)]);
  });

  it('renders the join-by-round-ID and create-round surfaces', () => {
    render(<MultiplayerPage />);

    expect(
      screen.getByRole('heading', { name: /multiplayer/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter round id/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /join round/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create round/i }),
    ).toBeInTheDocument();
  });

  it('lists open rounds with genre, players and age', () => {
    render(<MultiplayerPage />);

    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/4 players/i)).toBeInTheDocument();
    expect(screen.getByText(/1m ago/i)).toBeInTheDocument();
  });

  it('joins a round from the list and navigates to it', async () => {
    render(<MultiplayerPage />);

    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));

    await waitFor(() =>
      expect(mockJoinRound).toHaveBeenCalledWith(BigInt(1)),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/multiplayer/1'));
  });

  it('offers Cancel for your own lobbies and calls cancel_round', async () => {
    setOpenRounds([makeEntry(1, { round: { ...makeEntry(1).round, admin: 'GCREATOR' } })]);

    render(<MultiplayerPage />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() =>
      expect(mockCancelRound).toHaveBeenCalledWith(BigInt(1)),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('paginates the list', () => {
    setOpenRounds([1, 2, 3, 4, 5, 6].map((id) => makeEntry(id)));

    render(<MultiplayerPage />);

    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/round 6/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/round 6/i)).toBeInTheDocument();
  });

  it('does not reference the hard-coded sample-room-id', () => {
    render(<MultiplayerPage />);

    expect(document.body.textContent).not.toMatch(/sample-room-id/i);
  });
});
