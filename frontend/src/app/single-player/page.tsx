"use client";
import { SongOptions } from '@/components/molecules/song-options';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import { LyricCard } from '@/components/organisms/LyricCard';
import BadgeModal from '@/components/organisms/newbadgemodal';
import { useCardTimer, CARD_TIMEOUT_SECONDS } from '@/features/game/hooks/useCardTimer';
import { fireConfetti } from '@/lib/confetti';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Answer,
  MILESTONES,
  type Card,
  type Milestone,
  type QuestionCard,
  type Round,
} from '@/lib/stellar/types';
import { useCallback, useEffect, useState } from 'react';
import { Answer, type Card, type QuestionCard, type Round } from '@/lib/stellar/types';
import { useGameTimer } from '@/features/game/hooks/useGameTimer';

interface SongOption {
  title: string;
  artist: string;
}

const MILESTONE_NAMES: Record<Milestone, string> = {
  [MILESTONES.FirstWin]: 'First Win',
  [MILESTONES.Streak5]: 'Streak Master',
  [MILESTONES.TenWins]: 'Music Connoisseur',
};
// Default round duration in seconds (5 minutes)
const DEFAULT_ROUND_SECONDS = 300;

export default function SinglePlayerGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundId = searchParams.get('roundId');
  const { account, systemCalls } = useStellar();

  // ── Round state ───────────────────────────────────────────────────────────
  const { systemCalls } = useStellar();

  // Use the single shared timer — no local setInterval here.
  const { timeLeft, startTimer, stopTimer, resetTimer } = useGameTimer();

  const [round, setRound] = useState<Round | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [question, setQuestion] = useState<QuestionCard | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SongOption | null>(null);
  const [correctOption, setCorrectOption] = useState<SongOption | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [score, setScore] = useState(0);

  // Stop the timer when the component unmounts (e.g. user navigates away).
  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);

  // Round-level countdown (5-min) displayed in StatisticsPanel
  const [roundTimeLeft, setRoundTimeLeft] = useState(300);

  // Badge modal state (Issue #476)
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [earnedBadgeName, setEarnedBadgeName] = useState<string>('');
  const statusRef = useRef<HTMLParagraphElement>(null);

  // ── Per-card 15-second timer (Issue #472) ────────────────────────────────
  /**
   * The card timer is active while:
   *   - a card is loaded
   *   - no answer has been selected yet
   *   - the card isn't already flipped
   */
  const cardTimerActive =
    isGameStarted && question !== null && selectedOption === null && !isCardFlipped;

  const handleCardTimeout = useCallback(() => {
    // Time ran out – flip the card to reveal the answer and count as a miss
    if (card) {
      setCorrectOption({ title: card.title, artist: card.artist });
    }
    setIsCardFlipped(true);
    // selectedOption stays null → the wrong-answer highlight is skipped,
    // but the correct answer is revealed (same UX as a miss)
    setAnsweredCount((prev) => prev + 1);
  }, [card]);

  const { timeLeft: cardTimeLeft, reset: resetCardTimer } = useCardTimer({
    isActive: cardTimerActive,
    onTimeout: handleCardTimeout,
  });

  // Reset per-card timer when a new card loads
  useEffect(() => {
    if (question !== null) {
      resetCardTimer();
    }
  }, [question, resetCardTimer]);

  // ── Contract data fetching ────────────────────────────────────────────────
  const loadNextCard = useCallback(async () => {
    if (!systemCalls || !roundId) return;
    const id = BigInt(roundId);
    setSelectedOption(null);
    setCorrectOption(null);
    setIsCardFlipped(false);
    setTxStatus('Drawing next card…');
    const nextCard = await systemCalls.nextCard(id);
    setTxStatus('Building question…');
    const questionCard = await systemCalls.buildQuestionCard(nextCard, 'Title');
    setCard(nextCard);
    setQuestion(questionCard);
    setTxStatus(null);
  }, [roundId, systemCalls]);

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!systemCalls) {
        setError('System calls not initialized');
        return;
      }
      if (!roundId) {
        setIsLoading(false);
        return;
      }
      try {
        const id = BigInt(roundId);
        let roundData = await systemCalls.getRound(id);
        if (!roundData.is_started) {
          setTxStatus('Starting round…');
          await systemCalls.startRound(id);
          roundData = await systemCalls.getRound(id);
        }
        const cards = await systemCalls.getRoundCards(id);
        setRound(roundData);
        setTotalCards(cards.length);
        setAnsweredCount(roundData.next_card_index);
        setIsGameStarted(true);

        // Initialise and start the shared timer for this round.
        resetTimer(DEFAULT_ROUND_SECONDS);
        startTimer();

        if (roundData.next_card_index < cards.length) {
          await loadNextCard();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get round data');
      } finally {
        setTxStatus(null);
        setIsLoading(false);
      }
    };
    fetchRoundData();
  }, [roundId, systemCalls, loadNextCard]);

  // Round-level timer (5 min)
  useEffect(() => {
    if (isGameStarted && roundTimeLeft > 0) {
      const timer = setInterval(() => setRoundTimeLeft((p) => p - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [isGameStarted, roundTimeLeft]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, systemCalls]);

  // ── Milestone / badge check ───────────────────────────────────────────────
  const checkMilestoneAndShowBadge = useCallback(
    async (finalScore: number, total: number) => {
      if (!systemCalls || !account?.address) return;
      try {
        const stats = await systemCalls.getPlayerStat(account.address);
        let milestone: Milestone | null = null;
        if (stats.rounds_won === BigInt(1)) milestone = MILESTONES.FirstWin;
        else if (stats.current_streak === BigInt(5)) milestone = MILESTONES.Streak5;
        else if (stats.rounds_won === BigInt(10)) milestone = MILESTONES.TenWins;

        if (milestone !== null) {
          try {
            await systemCalls.claimReward(milestone);
          } catch {
            // Already claimed or contract error; still show the modal
          }
          setEarnedBadgeName(MILESTONE_NAMES[milestone]);
          setIsBadgeModalOpen(true);
        }
      } catch {
        // Non-critical
      }
    },
    [account?.address, systemCalls],
  );

  // ── Game options ──────────────────────────────────────────────────────────
  const options: SongOption[] = question
    ? [
        question.option_one,
        question.option_two,
        question.option_three,
        question.option_four,
      ].map((title) => ({ title, artist: '' }))
    : [];

  const isRoundFinished = totalCards > 0 && answeredCount >= totalCards;

  // ── Answer handler ────────────────────────────────────────────────────────
  const handleSongSelect = async (option: SongOption) => {
    if (!round || !card || !systemCalls || selectedOption) return;

    setSelectedOption(option);
    try {
      setTxStatus('Submitting answer…');
      const isCorrect = await systemCalls.submitAnswer(
        round.round_id,
        Answer.title(option.title),
      );
      const newScore = isCorrect ? score + 1 : score;
      setCorrectOption(isCorrect ? option : { title: card.title, artist: card.artist });

      if (isCorrect) {
        setScore(newScore);
        // Fire confetti (respects prefers-reduced-motion internally)
        fireConfetti().catch(() => {/* non-critical */});
      }

      const newAnswered = answeredCount + 1;
      setAnsweredCount(newAnswered);
      setIsCardFlipped(true);

      // Check for milestone NFTs when the last card is answered
      if (newAnswered >= totalCards) {
        await checkMilestoneAndShowBadge(newScore, totalCards);
      }
    } catch (err) {
      setSelectedOption(null);
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setTxStatus(null);
    }
  };

  const handleNextCard = async () => {
    try {
      await loadNextCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load next card');
      setTxStatus(null);
    }
  };

  const handleBack = () => router.push('/');

  // ── Render: loading ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main
        className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32"
        aria-label="Loading game"
      >
        <p aria-live="polite" aria-busy="true">
          {txStatus || 'Loading game...'}
        </p>
      </main>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────
  if (error || !round) {
    return (
      <main
        className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32"
        aria-label="Game error"
      >
        <p role="alert">{error || 'No round found'}</p>
        <button
          onClick={handleBack}
          className="mt-4 px-4 py-2 bg-purple-500 text-white rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-700"
        >
          Return to Home
        </button>
      </main>
    );
  }

  // ── Render: game ──────────────────────────────────────────────────────────
  return (
    <>
      <main
        className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32"
        aria-label="Single player game"
      >
        {/* Skip-to-content */}
        <a
          href="#game-options"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-purple-600 focus:text-white focus:rounded"
        >
          Skip to answer options
        </a>

        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 mb-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 rounded"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            Back
          </button>
          <h1 className="text-2xl font-bold">Wager (Single Player)</h1>
          <p className="text-gray-600 text-sm">
            {`${round.genre.toString()} Genre | Expert Difficulty`}
          </p>
        </div>

        {txStatus && (
          <p ref={statusRef} role="status" aria-live="polite" className="mt-2 text-sm text-gray-600">
            {txStatus}
          </p>
        )}

        {/* ── Per-card 15-second timer bar (Issue #472) ─────────────────────── */}
        <div
          className="w-full bg-gray-200 rounded-full h-2 mb-4"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={CARD_TIMEOUT_SECONDS}
          aria-valuenow={cardTimeLeft}
          aria-label={`Card timer: ${cardTimeLeft} seconds remaining`}
        >
          <div
            className={[
              'h-2 rounded-full transition-all',
              // Colour shifts to red in the final 5 seconds
              cardTimeLeft <= 5 ? 'bg-red-500' : 'bg-purple-500',
              // Don't animate width when reduced-motion is preferred
              'motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear',
            ].join(' ')}
            style={{ width: `${(cardTimeLeft / CARD_TIMEOUT_SECONDS) * 100}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mb-4" aria-live="polite" aria-atomic="true">
          {selectedOption || isCardFlipped
            ? ''
            : `${cardTimeLeft}s to answer`}
        </p>

        {/* Game grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-start-2 lg:col-span-1 order-1 lg:order-2">
            <LyricCard
              lyrics={[
                {
                  text: question?.lyric || 'Loading...',
                  title: card?.title || '',
                  artist: card?.artist || '',
                },
              ]}
              isFlipped={isCardFlipped}
            />
          </div>
          <div className="lg:col-start-3 lg:col-span-1 order-2 lg:order-3">
            <StatisticsPanel
              time={`${roundTimeLeft}`}
              potWin={`${round.wager_amount.toString()} STRK`}
              scores={`${score} / ${totalCards}`}
            />
          </div>
        </div>

        {/* Answer options */}
        <div id="game-options">
          <SongOptions
            options={options}
            onSelect={handleSongSelect}
            selectedOption={selectedOption}
            correctOption={correctOption}
          />
        </div>

        {/* Navigation after flip */}
        {isCardFlipped && (
          <div className="mt-6 flex justify-center" role="region" aria-label="Round navigation">
            {isRoundFinished ? (
              <p className="font-semibold" role="status">
                {`Round complete: ${score} / ${totalCards} correct`}
              </p>
            ) : (
              <button
                onClick={handleNextCard}
                disabled={!!txStatus}
                className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-700"
                aria-disabled={!!txStatus}
              >
                Next card
              </button>
            )}
          </div>
        )}
      </main>

      {/* Badge modal (Issue #476) */}
      <BadgeModal
        isOpen={isBadgeModalOpen}
        onClose={() => setIsBadgeModalOpen(false)}
        badgeName={earnedBadgeName}
      />
    </>
  );
}
