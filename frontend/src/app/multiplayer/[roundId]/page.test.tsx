import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MultiplayerRoundPage from './page';

const mockPush = jest.fn();
const mockGetRound = jest.fn();
const mockGetRoundPlayers = jest.fn();
const mockJoinRound = jest.fn();
const mockStartRound = jest.fn();
const mockNextCard = jest.fn();
const mockBuildQuestionCard = jest.fn();
const mockSubmitAnswer = jest.fn();
const mockFinalizeRound = jest.fn();
const mockGetRoundScores = jest.fn();
const mockRoundEvents = jest.fn();
const mockGameEvents = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ roundId: '123' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: () => ({
    systemCalls: {
      getRound: mockGetRound,
      getRoundPlayers: mockGetRoundPlayers,
      joinRound: mockJoinRound,
      startRound: mockStartRound,
      nextCard: mockNextCard,
      buildQuestionCard: mockBuildQuestionCard,
      submitAnswer: mockSubmitAnswer,
      finalizeRound: mockFinalizeRound,
      getRoundScores: mockGetRoundScores,
    },
    account: { address: 'GPLAYER1' },
    connect: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-round-events', () => ({
  useRoundEvents: (...args: unknown[]) => mockRoundEvents(...args),
}));

jest.mock('@/hooks/use-round-game-events', () => ({
  useRoundGameEvents: (...args: unknown[]) => mockGameEvents(...args),
}));

// The card countdown has its own unit tests; the page test stubs it so the
// 15 s interval doesn't outlive the assertions.
jest.mock('@/features/game/hooks/use-card-timer', () => ({
  CARD_TIMEOUT_SECONDS: 15,
  useCardTimer: () => ({ timeLeft: 15, isExpired: false, reset: jest.fn() }),
}));

const baseRound = {
  round_id: BigInt(123),
  admin: 'GHOSTHOST',
  genre: 'Pop' as const,
  wager_amount: BigInt(0),
  start_time: BigInt(0),
  is_started: false,
  is_completed: false,
  end_time: BigInt(0),
  next_card_index: 0,
  is_cancelled: false,
};

const startedRound = {
  ...baseRound,
  is_started: true,
  start_time: BigInt(1_000),
  end_time: BigInt(Math.floor(Date.now() / 1000) + 120),
};

const completedRound = {
  ...startedRound,
  is_completed: true,
  end_time: BigInt(Math.floor(Date.now() / 1000) - 10),
};

const card = {
  card_id: BigInt(7),
  genre: 'Pop' as const,
  artist: 'Michael Jackson',
  title: 'Thriller',
  year: BigInt(1982),
  difficulty: 1,
  lyrics: 'Cause this is thriller',
};

const question = {
  lyric: 'Cause this is thriller',
  timestamp: BigInt(0),
  kind: 'Title' as const,
  option_one: 'Thriller',
  option_two: 'Bad',
  option_three: 'Beat It',
  option_four: 'Smooth Criminal',
};

const emptyGameEvents = {
  scores: {},
  answered: {},
  winners: null,
  finalScores: null,
  completed: false,
  error: null,
  lastUpdatedAt: Date.now(),
};

describe('multiplayer/[roundId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRound.mockResolvedValue(baseRound);
    mockGetRoundPlayers.mockResolvedValue(['GPLAYER1', 'GPLAYER2']);
    mockJoinRound.mockResolvedValue(undefined);
    mockStartRound.mockResolvedValue(undefined);
    mockNextCard.mockResolvedValue(card);
    mockBuildQuestionCard.mockResolvedValue(question);
    mockSubmitAnswer.mockResolvedValue(true);
    mockFinalizeRound.mockResolvedValue(undefined);
    mockGetRoundScores.mockResolvedValue({});
    mockRoundEvents.mockReturnValue({
      joined: ['GPLAYER2'],
      ready: [],
      started: false,
      error: null,
    });
    mockGameEvents.mockReturnValue(emptyGameEvents);
  });

  describe('lobby', () => {
    it('lists the players from contract state', async () => {
      render(<MultiplayerRoundPage />);

      expect(await screen.findByText('GPLAYER1 (you)')).toBeInTheDocument();
      expect(screen.getByText('GPLAYER2')).toBeInTheDocument();
      expect(screen.getByText(/Players \(2\)/)).toBeInTheDocument();
    });

    it('readies up through start_round', async () => {
      render(<MultiplayerRoundPage />);

      const ready = await screen.findByRole('button', { name: /ready/i });
      fireEvent.click(ready);

      await waitFor(() =>
        expect(mockStartRound).toHaveBeenCalledWith(BigInt(123)),
      );
    });

    it('joins the round when the wallet is not a participant yet', async () => {
      mockGetRoundPlayers.mockResolvedValue(['GPLAYER2']);

      render(<MultiplayerRoundPage />);

      await waitFor(() =>
        expect(mockJoinRound).toHaveBeenCalledWith(BigInt(123)),
      );
    });

    it('shows an error when the round cannot be loaded', async () => {
      mockGetRound.mockRejectedValue(new Error('boom'));

      render(<MultiplayerRoundPage />);

      expect(
        await screen.findByText(/does not exist or could not be loaded/i),
      ).toBeInTheDocument();
    });
  });

  describe('game screen', () => {
    it('draws the player card and submits a title answer', async () => {
      mockGetRound.mockResolvedValue(startedRound);

      render(<MultiplayerRoundPage />);

      expect(
        await screen.findByText('Cause this is thriller'),
      ).toBeInTheDocument();
      expect(mockNextCard).toHaveBeenCalledWith(BigInt(123));

      fireEvent.click(
        screen.getByRole('button', { name: /option 1: thriller/i }),
      );

      await waitFor(() =>
        expect(mockSubmitAnswer).toHaveBeenCalledWith(BigInt(123), {
          tag: 'Title',
          values: ['Thriller'],
        }),
      );
      expect(await screen.findByTestId('answer-outcome')).toHaveTextContent(
        'Correct',
      );
      expect(
        screen.getByRole('button', { name: /next card/i }),
      ).toBeInTheDocument();
    });

    it('draws the next card after answering', async () => {
      mockGetRound.mockResolvedValue(startedRound);

      render(<MultiplayerRoundPage />);

      fireEvent.click(
        await screen.findByRole('button', { name: /option 1: thriller/i }),
      );
      await screen.findByRole('button', { name: /next card/i });
      fireEvent.click(screen.getByRole('button', { name: /next card/i }));

      await waitFor(() => expect(mockNextCard).toHaveBeenCalledTimes(2));
    });

    it('shows each opponent score and card progress from AnswerSubmitted', async () => {
      mockGetRound.mockResolvedValue(startedRound);
      mockGameEvents.mockReturnValue({
        ...emptyGameEvents,
        scores: { GPLAYER1: 100, GPLAYER2: 40 },
        answered: { GPLAYER1: 1, GPLAYER2: 1 },
      });

      render(<MultiplayerRoundPage />);

      expect(
        await screen.findByTestId('score-GPLAYER2'),
      ).toHaveTextContent('40');
      expect(screen.getByTestId('answered-GPLAYER2')).toHaveTextContent(
        '1 cards',
      );
    });

    it('waits for other players once every card has been drawn', async () => {
      mockGetRound.mockResolvedValue(startedRound);
      mockNextCard.mockRejectedValue(new Error('Error(Contract, #34)'));

      render(<MultiplayerRoundPage />);

      expect(await screen.findByTestId('waiting-state')).toHaveTextContent(
        /answered every card/i,
      );
    });

    it('offers finalize after the round deadline and calls finalize_round', async () => {
      mockGetRound.mockResolvedValue({
        ...startedRound,
        end_time: BigInt(Math.floor(Date.now() / 1000) - 5),
      });

      render(<MultiplayerRoundPage />);

      const finalize = await screen.findByRole('button', {
        name: /finalize round/i,
      });
      fireEvent.click(finalize);

      await waitFor(() =>
        expect(mockFinalizeRound).toHaveBeenCalledWith(BigInt(123)),
      );
    });

    it('renders the final results and winner once the round completes', async () => {
      mockGetRound.mockResolvedValue(completedRound);
      mockGameEvents.mockReturnValue({
        ...emptyGameEvents,
        completed: true,
        winners: ['GPLAYER1'],
        scores: { GPLAYER1: 120, GPLAYER2: 60 },
        finalScores: { GPLAYER1: 120, GPLAYER2: 60 },
        answered: { GPLAYER1: 2, GPLAYER2: 1 },
      });

      render(<MultiplayerRoundPage />);

      expect(
        await screen.findByRole('heading', { name: /round 123 results/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/you won/i)).toBeInTheDocument();
      expect(screen.getByTestId('score-GPLAYER1')).toHaveTextContent('120');
    });
  });
});
