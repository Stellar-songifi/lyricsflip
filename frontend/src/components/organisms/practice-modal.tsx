'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalStore } from '@/store/modal-store';
import { Button } from '@/components/atoms/button';
import {
  fetchPracticeRound,
  FALLBACK_PRACTICE_CARDS,
  type PracticeCard,
} from '@/services/practice-service';

/** Seconds allowed per card (mirrors the on-chain 15 s window). */
const CARD_TIME = 15;

type Stage = 'loading' | 'error' | 'playing' | 'result';

interface CardState {
  selected: string | null;
  revealed: boolean;
}

/** Counts correct answers across all submitted cards. */
function countCorrect(cards: PracticeCard[], states: CardState[]): number {
  return cards.reduce((n, card, i) => {
    const s = states[i];
    return s?.selected === card.title ? n + 1 : n;
  }, 0);
}

/**
 * Practice mode modal (LF-326 / issue #912).
 *
 * Presents 5 cards from /api/v1/practice with local timing and scoring.
 * No wallet is needed. At the end, a CTA prompts the visitor to connect
 * a wallet to play for real. A notice makes clear that practice results
 * are not recorded on-chain.
 */
export function PracticeModal() {
  const { isOpen, modalType, closeModal } = useModalStore();
  const isModalOpen = isOpen && modalType === 'practice';

  const [stage, setStage] = useState<Stage>('loading');
  const [cards, setCards] = useState<PracticeCard[]>([]);
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<CardState[]>([]);
  const [timeLeft, setTimeLeft] = useState(CARD_TIME);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const announceRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ */
  /* Load cards when the modal opens                                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isModalOpen) return;

    setStage('loading');
    setIndex(0);
    setStates([]);
    setTimeLeft(CARD_TIME);

    fetchPracticeRound()
      .then(({ cards: fetched }) => {
        setCards(fetched);
        setStates(fetched.map(() => ({ selected: null, revealed: false })));
        setStage('playing');
      })
      .catch(() => {
        // Fallback to static demo cards so visitors can still try the game
        // when the backend is not running.
        setCards(FALLBACK_PRACTICE_CARDS);
        setStates(FALLBACK_PRACTICE_CARDS.map(() => ({ selected: null, revealed: false })));
        setStage('playing');
      });
  }, [isModalOpen]);

  /* ------------------------------------------------------------------ */
  /* Per-card countdown                                                    */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (stage !== 'playing') return;

    const current = states[index];
    if (current?.revealed) return; // already revealed — pause timer

    setTimeLeft(CARD_TIME);

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          revealCard(index);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index]);

  /* ------------------------------------------------------------------ */
  /* Helpers                                                               */
  /* ------------------------------------------------------------------ */
  const revealCard = useCallback(
    (cardIndex: number) => {
      clearInterval(timerRef.current!);
      setStates((prev) =>
        prev.map((s, i) => (i === cardIndex ? { ...s, revealed: true } : s)),
      );
      if (announceRef.current) {
        announceRef.current.textContent = `Card revealed. The answer is ${cards[cardIndex]?.title}.`;
      }
    },
    [cards],
  );

  const handleSelect = (option: string) => {
    if (states[index]?.revealed) return;
    clearInterval(timerRef.current!);
    setStates((prev) =>
      prev.map((s, i) =>
        i === index ? { selected: option, revealed: true } : s,
      ),
    );
    if (announceRef.current) {
      const correct = option === cards[index]?.title;
      announceRef.current.textContent = correct
        ? 'Correct!'
        : `Wrong. The answer was ${cards[index]?.title}.`;
    }
  };

  const handleNext = () => {
    const next = index + 1;
    if (next >= cards.length) {
      setStage('result');
    } else {
      setIndex(next);
    }
  };

  const handleClose = () => {
    clearInterval(timerRef.current!);
    closeModal();
  };

  /* ------------------------------------------------------------------ */
  /* Render helpers                                                         */
  /* ------------------------------------------------------------------ */
  const renderLoading = () => (
    <div className="flex items-center justify-center h-48">
      <p className="text-lg text-gray-500 animate-pulse">Loading practice cards…</p>
    </div>
  );

  const renderPlaying = () => {
    const card = cards[index];
    const state = states[index];
    if (!card || !state) return null;

    return (
      <div className="flex flex-col gap-4">
        {/* Progress + timer row */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Card {index + 1} of {cards.length}
          </span>
          <span
            aria-live="polite"
            aria-atomic="true"
            className={`font-semibold tabular-nums ${timeLeft <= 5 ? 'text-red-500' : 'text-gray-700'}`}
          >
            {state.revealed ? '—' : `${timeLeft}s`}
          </span>
        </div>

        {/* Timer bar */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              timeLeft <= 5 ? 'bg-red-500' : 'bg-purple-500'
            }`}
            style={{ width: state.revealed ? '0%' : `${(timeLeft / CARD_TIME) * 100}%` }}
          />
        </div>

        {/* Lyric card */}
        <div className="bg-purple-50 rounded-2xl p-6 min-h-[120px] flex items-center justify-center">
          <p className="text-purple-900 text-center whitespace-pre-line leading-relaxed">
            {card.lyrics}
          </p>
        </div>

        {/* Options */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {card.options.map((opt) => {
            const isSelected = state.selected === opt;
            const isCorrect = opt === card.title;
            let cls =
              'w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ';
            if (!state.revealed) {
              cls +=
                'border-gray-200 hover:border-purple-400 hover:bg-purple-50 cursor-pointer';
            } else if (isCorrect) {
              cls += 'border-green-400 bg-green-50 text-green-800';
            } else if (isSelected) {
              cls += 'border-red-400 bg-red-50 text-red-700';
            } else {
              cls += 'border-gray-100 bg-gray-50 text-gray-400 cursor-default';
            }
            return (
              <li key={opt}>
                <button
                  className={cls}
                  onClick={() => handleSelect(opt)}
                  disabled={state.revealed}
                  aria-pressed={isSelected || undefined}
                >
                  {opt}
                  {state.revealed && isCorrect && (
                    <span className="ml-2 text-green-600" aria-label="correct answer">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Revealed answer details + Next button */}
        {state.revealed && (
          <div className="flex flex-col gap-3">
            <div className="text-center text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{card.title}</span>
              {' · '}
              {card.artist}
              {' · '}
              {card.year}
            </div>
            <Button
              variant="purple"
              size="full"
              onClick={handleNext}
            >
              {index + 1 < cards.length ? 'Next Card →' : 'See Results'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderResult = () => {
    const correct = countCorrect(cards, states);
    const total = cards.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="text-center">
          <p className="text-5xl font-bold text-purple-700">{correct}/{total}</p>
          <p className="mt-1 text-gray-500 text-sm">{pct}% correct</p>
        </div>

        {/* Breakdown */}
        <ul className="w-full space-y-2">
          {cards.map((card, i) => {
            const s = states[i];
            const wasCorrect = s?.selected === card.title;
            return (
              <li
                key={card.id}
                className={`flex justify-between items-center text-sm px-3 py-2 rounded-lg ${
                  wasCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
                }`}
              >
                <span className="truncate max-w-[70%]">
                  {card.title} — {card.artist}
                </span>
                <span>{wasCorrect ? '✓' : '✗'}</span>
              </li>
            );
          })}
        </ul>

        {/* Practice results are not recorded notice */}
        <p className="text-xs text-gray-400 text-center">
          Practice results are not recorded — scores only count on-chain.
        </p>

        {/* Wallet CTA */}
        <div className="w-full bg-purple-50 border border-purple-200 rounded-2xl p-5 flex flex-col items-center gap-3">
          <p className="text-purple-900 font-semibold text-center">
            Ready to play for real? 🎶
          </p>
          <p className="text-purple-700 text-sm text-center">
            Connect a wallet to wager tokens, earn NFT badges, and record your
            score on the Stellar blockchain.
          </p>
          <Button
            variant="purple"
            onClick={handleClose}
            className="w-full sm:w-auto"
          >
            Connect Wallet &amp; Play
          </Button>
        </div>

        <Button
          variant="outline"
          size="full"
          onClick={handleClose}
        >
          Back to Home
        </Button>
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /* Shell                                                                 */
  /* ------------------------------------------------------------------ */
  if (!isModalOpen) return null;

  return (
    <>
      {/* Screen-reader announcer */}
      <div
        ref={announceRef}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden="true"
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Practice round"
        className="fixed inset-x-4 top-8 bottom-8 sm:inset-x-auto sm:right-8 sm:w-[520px] z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-bold text-lg">Practice Round</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              No wallet needed · Results not recorded
            </p>
          </div>
          <button
            aria-label="Close practice round"
            onClick={handleClose}
            className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {stage === 'loading' && renderLoading()}
          {stage === 'playing' && renderPlaying()}
          {stage === 'result' && renderResult()}
        </div>
      </div>
    </>
  );
}
