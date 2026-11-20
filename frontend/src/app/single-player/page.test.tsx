import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import SinglePlayerPage from './page';
import { CARD_TIMEOUT_SECONDS } from '@/features/game/hooks/use-card-timer';

const mockGetRound = jest.fn();
const mockGetRoundCards = jest.fn();
const mockStartRound = jest.fn();
const mockNextCard = jest.fn();
const mockNextCardWithMeta = jest.fn();
const mockBuildQuestionCard = jest.fn();
const mockSubmitAnswer = jest.fn();
const mockSubmitAnswerWithMeta = jest.fn();
const mockGetPlayerStat = jest.fn();
const mockClaimReward = jest.fn();
const mockIsMilestoneClaimed = jest.fn();
const mockToastError = jest.fn();
const mockFinalizeRound = jest.fn().mockResolvedValue(undefined);
const mockGetRoundScores = jest.fn().mockResolvedValue({ GPLAYER1: 1 });

const mockSystemCalls = {
  getRound: mockGetRound,
  getRoundCards: mockGetRoundCards,
  startRound: mockStartRound,
  nextCard: mockNextCard,
  nextCardWithMeta: mockNextCardWithMeta,
  buildQuestionCard: mockBuildQuestionCard,
  submitAnswer: mockSubmitAnswer,
  submitAnswerWithMeta: mockSubmitAnswerWithMeta,
  getPlayerStat: mockGetPlayerStat,
  claimReward: mockClaimReward,
  isMilestoneClaimed: mockIsMilestoneClaimed,
  finalizeRound: mockFinalizeRound,
  getRoundScores: mockGetRoundScores,
};

jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    loading: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams('roundId=1'),
}));

jest.mock('@/lib/stellar/hooks/use-stellar', () => ({
  useStellar: () => ({
    account: { address: 'GPLAYER1' },
    systemCalls: mockSystemCalls,
  }),
}));

jest.mock('@/lib/confetti', () => ({ fireConfetti: jest.fn() }));

jest.mock('@/components/organisms/game-result-popup', () => ({
  __esModule: true,
  default: ({ isWin }: { isWin: boolean }) => (
    <div data-testid="game-result-popup">Result: {isWin ? 'Win' : 'Loss'}</div>
  ),
}));

const round = {
  round_id: BigInt(1),
  admin: 'GADMIN',
  genre: 'Pop' as const,
  wager_amount: BigInt(0),
  start_time: BigInt(1_000),
  is_started: true,
  is_completed: false,
  end_time: BigInt(9_999_999_999),
  next_card_index: 0,
  is_cancelled: false,
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

describe('SinglePlayerPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRound.mockResolvedValue(round);
    mockGetRoundCards.mockResolvedValue([BigInt(7)]);
    mockNextCard.mockResolvedValue(card);
    mockNextCardWithMeta.mockResolvedValue({ result: card, closedAtMs: null, startedAtMs: Date.now() });
    mockBuildQuestionCard.mockResolvedValue(question);
    mockSubmitAnswer.mockResolvedValue(true);
    mockSubmitAnswerWithMeta.mockResolvedValue({ result: true, closedAtMs: null });
    mockGetPlayerStat.mockResolvedValue({
      total_rounds: BigInt(0),
      rounds_won: BigInt(0),
      current_streak: BigInt(0),
      max_streak: BigInt(0),
    });
    mockIsMilestoneClaimed.mockResolvedValue(false);
    mockClaimReward.mockResolvedValue(BigInt(100));
  });

  it('loads the round and renders the lyric with four answer options', async () => {
    render(<SinglePlayerPage />);

    expect(await screen.findByText('Cause this is thriller')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /option 1: thriller/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^option \d/i })).toHaveLength(4);
  });

  it('submits the selected answer as a Title answer', async () => {
    render(<SinglePlayerPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: /option 1: thriller/i }),
    );

    await waitFor(() =>
      expect(mockSubmitAnswerWithMeta).toHaveBeenCalledWith(BigInt(1), {
        tag: 'Title',
        values: ['Thriller'],
      }),
    );
  });

  it('reveals the answer and counts the card after answering', async () => {
    render(<SinglePlayerPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: /option 1: thriller/i }),
    );

    expect(await screen.findByRole('button', { name: /next card/i })).toBeInTheDocument();
  });

  it('closes the answer window when the card deadline has already passed', async () => {
    const startedAtMs = Date.now() - (CARD_TIMEOUT_SECONDS + 2) * 1000;
    mockNextCardWithMeta.mockResolvedValue({ result: card, closedAtMs: null, startedAtMs });

    render(<SinglePlayerPage />);

    const option = await screen.findByRole('button', { name: /option 1: thriller/i });
    await waitFor(() => expect(option).toBeDisabled());
  });

  it('shows "Too late" when the contract scores a click submitted after the window', async () => {
    const startedAtMs = Date.now();
    mockNextCardWithMeta.mockResolvedValue({ result: card, closedAtMs: null, startedAtMs });
    mockSubmitAnswerWithMeta.mockResolvedValue({
      result: false,
      closedAtMs: startedAtMs + (CARD_TIMEOUT_SECONDS + 3) * 1000,
    });

    render(<SinglePlayerPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: /option 1: thriller/i }),
    );

    expect(await screen.findByText('Too late')).toBeInTheDocument();
  });

  it('keeps "Submitting…" visible until the answer transaction is confirmed', async () => {
    let resolveSubmit: (value: {
      result: boolean;
      closedAtMs: number | null;
    }) => void = () => {};
    mockSubmitAnswerWithMeta.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(<SinglePlayerPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: /option 1: thriller/i }),
    );

    expect(await screen.findByText('Submitting…')).toBeInTheDocument();

    await act(async () => {
      resolveSubmit({ result: true, closedAtMs: Date.now() });
    });

    await waitFor(() =>
      expect(screen.queryByText('Submitting…')).not.toBeInTheDocument(),
    );
  });

  it('shows "Wrong" when an in-time answer is simply incorrect', async () => {
    const startedAtMs = Date.now();
    mockNextCardWithMeta.mockResolvedValue({ result: card, closedAtMs: null, startedAtMs });
    mockSubmitAnswerWithMeta.mockResolvedValue({
      result: false,
      closedAtMs: startedAtMs + 2_000,
    });

    render(<SinglePlayerPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: /option 2: bad/i }),
    );

    expect(await screen.findByText('Wrong')).toBeInTheDocument();
  });

  describe('Milestone checks and badge flow (LF-191)', () => {
    const completeAndFinishRound = async () => {
      render(<SinglePlayerPage />);
      fireEvent.click(
        await screen.findByRole('button', { name: /option 1: thriller/i }),
      );
      const finishBtn = await screen.findByRole('button', {
        name: /finish round/i,
      });
      fireEvent.click(finishBtn);
    };

    it('skips milestone claims when stats thresholds are not reached', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(1),
        rounds_won: BigInt(0),
        current_streak: BigInt(0),
        max_streak: BigInt(2),
      });

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockGetPlayerStat).toHaveBeenCalled();
      });
      expect(mockClaimReward).not.toHaveBeenCalled();
      expect(
        screen.queryByText(/You Just earned a new badge/i),
      ).not.toBeInTheDocument();
    });

    it('claims FirstWin when rounds_won >= 1 and milestone is unclaimed', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(1),
        rounds_won: BigInt(1),
        current_streak: BigInt(1),
        max_streak: BigInt(1),
      });
      mockIsMilestoneClaimed.mockResolvedValue(false);

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockClaimReward).toHaveBeenCalledWith(0);
      });
      expect(await screen.findByText(/First Win/)).toBeInTheDocument();
    });

    it('handles skipped thresholds (e.g. 11 wins) and claims TenWins', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(15),
        rounds_won: BigInt(11),
        current_streak: BigInt(1),
        max_streak: BigInt(2),
      });
      // FirstWin (0) is already claimed, TenWins (2) is unclaimed
      mockIsMilestoneClaimed.mockImplementation(
        async (_player: string, milestone: number) => milestone === 0,
      );

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockClaimReward).toHaveBeenCalledWith(2);
      });
      expect(mockClaimReward).not.toHaveBeenCalledWith(0);
      expect(await screen.findByText(/Music Connoisseur/)).toBeInTheDocument();
    });

    it('checks Streak5 against max_streak rather than current_streak', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(10),
        rounds_won: BigInt(0),
        current_streak: BigInt(1), // current is low
        max_streak: BigInt(5), // max reaches threshold
      });
      mockIsMilestoneClaimed.mockResolvedValue(false);

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockClaimReward).toHaveBeenCalledWith(1);
      });
      expect(await screen.findByText(/Streak Master/)).toBeInTheDocument();
    });

    it('skips already claimed milestones', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(5),
        rounds_won: BigInt(5),
        current_streak: BigInt(2),
        max_streak: BigInt(2),
      });
      mockIsMilestoneClaimed.mockResolvedValue(true);

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockGetPlayerStat).toHaveBeenCalled();
      });
      expect(mockClaimReward).not.toHaveBeenCalled();
      expect(
        screen.queryByText(/You Just earned a new badge/i),
      ).not.toBeInTheDocument();
    });

    it('handles mint failure without opening modal and shows error toast', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(1),
        rounds_won: BigInt(1),
        current_streak: BigInt(1),
        max_streak: BigInt(1),
      });
      mockIsMilestoneClaimed.mockResolvedValue(false);
      mockClaimReward.mockRejectedValue(
        new Error('Transaction failed: Error(Contract, #24)'),
      );

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          expect.stringContaining('You have not reached that milestone yet.'),
        );
      });
      expect(
        screen.queryByText(/You Just earned a new badge/i),
      ).not.toBeInTheDocument();
    });

    it('claims multiple unclaimed milestones in a row and queues modals', async () => {
      mockGetPlayerStat.mockResolvedValue({
        total_rounds: BigInt(12),
        rounds_won: BigInt(10),
        current_streak: BigInt(5),
        max_streak: BigInt(5),
      });
      mockIsMilestoneClaimed.mockResolvedValue(false);

      await completeAndFinishRound();

      await waitFor(() => {
        expect(mockClaimReward).toHaveBeenCalledWith(0);
        expect(mockClaimReward).toHaveBeenCalledWith(1);
        expect(mockClaimReward).toHaveBeenCalledWith(2);
      });

      // First badge modal (First Win)
      expect(await screen.findByText(/First Win/)).toBeInTheDocument();

      // Dismiss first modal
      const closeBtn1 = screen.getByRole('button', {
        name: /close badge notification/i,
      });
      fireEvent.click(closeBtn1);

      // Second badge modal (Streak Master)
      expect(await screen.findByText(/Streak Master/)).toBeInTheDocument();

      // Dismiss second modal
      const closeBtn2 = screen.getByRole('button', {
        name: /close badge notification/i,
      });
      fireEvent.click(closeBtn2);

      // Third badge modal (Music Connoisseur)
      expect(await screen.findByText(/Music Connoisseur/)).toBeInTheDocument();

      // Dismiss third modal
      const closeBtn3 = screen.getByRole('button', {
        name: /close badge notification/i,
      });
      fireEvent.click(closeBtn3);

      await waitFor(() => {
        expect(
          screen.queryByText(/You Just earned a new badge/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  it('calls finalizeRound and queries authoritative round scores when round completes', async () => {
    mockGetRoundCards.mockResolvedValue([BigInt(7)]);
    mockGetRound.mockResolvedValue({ ...round, next_card_index: 0 });
    const startedAtMs = Date.now();
    mockNextCardWithMeta.mockResolvedValue({ result: card, closedAtMs: null, startedAtMs });
    mockSubmitAnswerWithMeta.mockResolvedValue({
      result: true,
      closedAtMs: startedAtMs + 1_000,
    });
    mockFinalizeRound.mockResolvedValue(undefined);
    mockGetRoundScores.mockResolvedValue({ GPLAYER1: 1 });
    mockGetPlayerStat.mockResolvedValue({
      rounds_played: BigInt(1),
      rounds_won: BigInt(1),
      current_streak: BigInt(1),
      max_streak: BigInt(1),
    });

    render(<SinglePlayerPage />);

    // Answer the only card
    fireEvent.click(
      await screen.findByRole('button', { name: /option 1: thriller/i }),
    );

    // Click finish round
    const nextBtn = await screen.findByRole('button', { name: /next card/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockFinalizeRound).toHaveBeenCalledWith(BigInt(1));
      expect(mockGetRoundScores).toHaveBeenCalledWith(BigInt(1));
    });
  });

  it('gracefully treats RoundAlreadyFinalized (code 19) as success during finalization', async () => {
    mockGetRoundCards.mockResolvedValue([BigInt(7)]);
    mockGetRound.mockResolvedValue({ ...round, next_card_index: 0 });
    const startedAtMs = Date.now();
    mockNextCardWithMeta.mockResolvedValue({ result: card, closedAtMs: null, startedAtMs });
    mockSubmitAnswerWithMeta.mockResolvedValue({
      result: true,
      closedAtMs: startedAtMs + 1_000,
    });
    mockFinalizeRound.mockRejectedValue(new Error('Transaction failed: Error(Contract, #19)'));
    mockGetRoundScores.mockResolvedValue({ GPLAYER1: 1 });
    mockGetPlayerStat.mockResolvedValue({
      rounds_played: BigInt(1),
      rounds_won: BigInt(1),
      current_streak: BigInt(1),
      max_streak: BigInt(1),
    });

    render(<SinglePlayerPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: /option 1: thriller/i }),
    );

    const nextBtn = await screen.findByRole('button', { name: /next card/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockFinalizeRound).toHaveBeenCalledWith(BigInt(1));
      expect(mockGetRoundScores).toHaveBeenCalledWith(BigInt(1));
    });
  });
});
