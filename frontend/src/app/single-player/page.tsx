"use client";
import { SongOptions } from '@/components/molecules/song-options';
import { StatisticsPanel } from '@/components/molecules/statistics-panel';
import GameResultPopup from '@/components/organisms/GameResultPopup';
import { LyricCard } from '@/components/organisms/LyricCard';
import BadgeModal from '@/components/organisms/newbadgemodal';
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

interface SongOption {
  title: string;
  artist: string;
}

/** Map a `Milestone` discriminant to a human-readable badge name. */
const MILESTONE_NAMES: Record<Milestone, string> = {
  [MILESTONES.FirstWin]: 'First Win',
  [MILESTONES.Streak5]: 'Streak Master',
  [MILESTONES.TenWins]: 'Music Connoisseur',
};

export default function SinglePlayerGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundId = searchParams.get('roundId');
  const { account, systemCalls } = useStellar();
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
  const [timeLeft, setTimeLeft] = useState(300); // 5-minute round timer

  // Badge modal state (Issue #476)
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [earnedBadgeName, setEarnedBadgeName] = useState<string>('');
  const statusRef = useRef<HTMLParagraphElement>(null);

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

  // Round-level countdown timer (separate from the per-card 15 s timer)
  useEffect(() => {
    if (isGameStarted && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isGameStarted, timeLeft]);

  // ── Check for milestone NFT after round completes ────────────────────────

  const checkMilestoneAndShowBadge = useCallback(
    async (finalScore: number, total: number) => {
      if (!systemCalls || !account?.address) return;

      try {
        // Fetch the player's on-chain stats to detect milestone crossings.
        const stats = await systemCalls.getPlayerStat(account.address);

        let milestone: Milestone | null = null;

        // FirstWin: rounds_won just reached 1
        if (stats.rounds_won === BigInt(1)) {
          milestone = MILESTONES.FirstWin;
        }
        // Streak5: current_streak just hit 5
        else if (stats.current_streak === BigInt(5)) {
          milestone = MILESTONES.Streak5;
        }
        // TenWins: rounds_won just crossed 10
        else if (stats.rounds_won === BigInt(10)) {
          milestone = MILESTONES.TenWins;
        }

        if (milestone !== null) {
          // Attempt to claim the reward NFT; ignore if already claimed.
          try {
            await systemCalls.claimReward(milestone);
          } catch {
            // May already be claimed; badge modal still shows
          }
          setEarnedBadgeName(MILESTONE_NAMES[milestone]);
          setIsBadgeModalOpen(true);
        }
      } catch {
        // Non-critical: badge check failure shouldn't break the game flow
      }
    },
    [account?.address, systemCalls],
  );

  const options: SongOption[] = question
    ? [
        question.option_one,
        question.option_two,
        question.option_three,
        question.option_four,
      ].map((title) => ({ title, artist: '' }))
    : [];

  const isRoundFinished = totalCards > 0 && answeredCount >= totalCards;

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
      if (isCorrect) setScore(newScore);
      const newAnswered = answeredCount + 1;
      setAnsweredCount(newAnswered);
      setIsCardFlipped(true);

      // When the last card is answered, check for milestone NFTs
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

  const handleBack = () => {
    router.push('/');
  };

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

  return (
    <>
      <main
        className="container mt-4 mx-auto h-fit w-full mb-20 lg:mb-12 p-4 lg:p-0 md:mt-24 lg:mt-32"
        aria-label="Single player game"
      >
        {/* Skip-to-content link */}
        <a
          href="#game-options"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-purple-600 focus:text-white focus:rounded"
        >
          Skip to answer options
        </a>

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
          <p
            ref={statusRef}
            role="status"
            aria-live="polite"
            className="mt-2 text-sm text-gray-600"
          >
            {txStatus}
          </p>
        )}

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
              time={`${timeLeft}`}
              potWin={`${round.wager_amount.toString()} STRK`}
              scores={`${score} / ${totalCards}`}
            />
          </div>
        </div>

        <div id="game-options">
          <SongOptions
            options={options}
            onSelect={handleSongSelect}
            selectedOption={selectedOption}
            correctOption={correctOption}
          />
        </div>

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

      {/* Badge modal – shown after a milestone is reached (Issue #476) */}
      <BadgeModal
        isOpen={isBadgeModalOpen}
        onClose={() => setIsBadgeModalOpen(false)}
        badgeName={earnedBadgeName}
      />
    </>
  );
}
