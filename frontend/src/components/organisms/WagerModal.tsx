'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/atoms/select';
import { useModalStore } from '@/store/modal-store';
import { useEffect, useState } from 'react';
import { Input } from '../atoms/input';
import { Modal } from './modal';
import { WagerSummaryContent } from './WagerSummaryModal';
import { WagerDetails, useStore } from '@/store';
import { useRouter } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { GENRE_OPTIONS } from '@/lib/stellar/genres';
import type { Genre } from '@/lib/stellar/types';
import { useXlmBalance } from '@/lib/stellar/hooks/useXlmBalance';
import { WAGER_ASSET_CODE } from '@/lib/utils';

// Map form genre values (the Genre variant string itself) to contract Genre
// enum variants and their display names. Built from the shared GENRE_OPTIONS
// so it always covers all 13 on-chain genres.
export const GENRE_MAPPING: Record<string, { variant: Genre; display: string }> =
  Object.fromEntries(
    GENRE_OPTIONS.map(({ value, label }) => [
      value,
      { variant: value, display: label },
    ]),
  );

// Type for genre keys
export type GenreKey = keyof typeof GENRE_MAPPING;

export function WagerModal() {
  const router = useRouter();
  const { isOpen, closeModal, modalType } = useModalStore();
  const [stage, setStage] = useState<'form' | 'summary'>('form');
  const [wagerDetails, setWagerDetails] = useState<WagerDetails>({
    genre: '',
    difficulty: '',
    duration: '',
    odds: '',
    wagerAmount: '',
    potentialWin: '',
  });
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const startGame = useStore((state) => state.game.startGame);
  const isModalOpen = isOpen && modalType === 'wager';

  // Initialize Stellar setup
  const { setup, account, isLoading, error } = useStellar();
  const { formatted: walletBalance } = useXlmBalance();

  useEffect(() => {
    const oddsValue = parseFloat(wagerDetails.odds);
    const wagerValue = parseFloat(wagerDetails.wagerAmount);

    if (!isNaN(oddsValue) && !isNaN(wagerValue)) {
      const calculatedWin = wagerValue * oddsValue;
      setWagerDetails((prev) => ({
        ...prev,
        potentialWin: `${isNaN(calculatedWin) ? 0 : calculatedWin} ${WAGER_ASSET_CODE}`,
      }));
    }
  }, [wagerDetails.odds, wagerDetails.wagerAmount]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    if (!wagerDetails.genre) errors.genre = 'Genre is required';
    else if (!GENRE_MAPPING[wagerDetails.genre as keyof typeof GENRE_MAPPING]) {
      errors.genre = 'Invalid genre selected';
    }
    if (!wagerDetails.difficulty) errors.difficulty = 'Difficulty is required';
    if (!wagerDetails.duration) errors.duration = 'Duration is required';
    if (!wagerDetails.odds) errors.odds = 'Odds are required';
    if (!wagerDetails.wagerAmount)
      errors.wagerAmount = 'Wager amount is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProceedToSummary = () => {
    if (validateForm()) {
      setStage('summary');
      setFormErrors({});
    }
  };

  const handleStartGame = async () => {
    setSubmissionError(null);
    try {
      if (!account) {
        setSubmissionError('No account connected. Please connect your wallet.');
        return;
      }

      if (!setup?.systemCalls) {
        setSubmissionError('Game system not initialized. Please try again.');
        return;
      }

      // Map form genre key to the contract's Genre variant
      const genreKey = wagerDetails.genre as GenreKey;
      const genreInfo = GENRE_MAPPING[genreKey];

      if (!genreInfo) {
        setSubmissionError('Invalid genre selected.');
        return;
      }

      try {

        const result = await setup.systemCalls.createRound(genreInfo.variant);

        // Start game in store
        startGame({
          genre: wagerDetails.genre,
          difficulty: wagerDetails.difficulty,
          duration: wagerDetails.duration,
          odds: parseFloat(wagerDetails.odds),
          wagerAmount: parseFloat(wagerDetails.wagerAmount),
        });

        closeModal();
        router.push(`/single-player?roundId=${result}`);
        setWagerDetails({
          genre: '',
          difficulty: '',
          duration: '',
          odds: '',
          wagerAmount: '',
          potentialWin: '',
        });
        setStage('form');
      } catch (err) {
        console.error('Error creating round:', err);
        setSubmissionError('Failed to create round. Please try again.');
      }
    } catch (err) {
      console.error('Error creating round:', err);
      setSubmissionError('Failed to create round. Please try again.');
    }
  };

  const renderWagerForm = () => (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="genre" className="text-sm font-medium">
          Genre
        </label>
        <Select
          value={wagerDetails.genre}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, genre: value }))
          }
        >
          <SelectTrigger className={formErrors.genre ? 'border-red-500' : ''}>
            <SelectValue placeholder="Select genre" />
          </SelectTrigger>
          <SelectContent>
            {GENRE_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.genre && (
          <p className="text-red-500 text-xs">{formErrors.genre}</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="difficulty" className="text-sm font-medium">
          Difficulty Level
        </label>
        <Select
          value={wagerDetails.difficulty}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, difficulty: value }))
          }
        >
          <SelectTrigger
            className={formErrors.difficulty ? 'border-red-500' : ''}
          >
            <SelectValue placeholder="Select difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.difficulty && (
          <p className="text-red-500 text-xs">{formErrors.difficulty}</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="duration" className="text-sm font-medium">
          Duration
        </label>
        <Select
          value={wagerDetails.duration}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, duration: value }))
          }
        >
          <SelectTrigger
            className={formErrors.duration ? 'border-red-500' : ''}
          >
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5 mins">5 minutes</SelectItem>
            <SelectItem value="10 mins">10 minutes</SelectItem>
            <SelectItem value="15 mins">15 minutes</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.duration && (
          <p className="text-red-500 text-xs">{formErrors.duration}</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="odds" className="text-sm font-medium">
          Odds
        </label>
        <Select
          value={wagerDetails.odds}
          onValueChange={(value) =>
            setWagerDetails((prev) => ({ ...prev, odds: value }))
          }
        >
          <SelectTrigger className={formErrors.odds ? 'border-red-500' : ''}>
            <SelectValue placeholder="Select odds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 odds</SelectItem>
            <SelectItem value="10">10 odds</SelectItem>
            <SelectItem value="15">15 odds</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.odds && (
          <p className="text-red-500 text-xs">{formErrors.odds}</p>
        )}
      </div>

      <div className="bg-[#F0F0F0] p-4 rounded-lg flex flex-col gap-3">
        <p className="text-xs font-medium">
          Wallet Balance:{' '}
          <span className="text-[#9747FF]">
            {walletBalance ?? '—'} XLM
          </span>
        </p>
        <div className="text-sm flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="your-wager">
            Your Wager
          </label>
          <div className="flex bg-white focus-within:outline-none focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 p-3 rounded-[4px]">
            <Input
              type="number"
              name="your-wager"
              id="your-wager"
              value={wagerDetails.wagerAmount}
              onChange={(e) =>
                setWagerDetails((prev) => ({
                  ...prev,
                  wagerAmount: e.target.value,
                }))
              }
              className={`border-none shadow-none focus-visible:ring-0 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${formErrors.wagerAmount ? 'border-red-500' : ''}`}
              placeholder="Enter amount"
            />
            <Select value={WAGER_ASSET_CODE}>
              <SelectTrigger className="rounded-full w-full max-w-[66px] border-[#DBE2E8] text-[10px] font-light">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WAGER_ASSET_CODE}>{WAGER_ASSET_CODE}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formErrors.wagerAmount && (
            <p className="text-red-500 text-xs">{formErrors.wagerAmount}</p>
          )}
        </div>
        <div className="text-sm flex flex-col gap-2">
          <label className="text-sm font-medium">You Win</label>
          <Input
            disabled
            value={wagerDetails.potentialWin}
            className="p-4 shadow-none rounded-[4px] bg-[#F5F6F8] border-[#DBE2E8] h-auto"
          />
        </div>
      </div>
      {submissionError && (
        <p className="text-red-500 text-sm mt-2">{submissionError}</p>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeModal}
      title={stage === 'form' ? 'Wager (Single Player)' : 'Wager Summary'}
      description={
        stage === 'form'
          ? 'Pick your genre, set your wager amount, and play solo to rack up points before time runs out.'
          : undefined
      }
      primaryActionLabel={
        stage === 'form' ? 'Proceed to Summary' : 'Start Game'
      }
      onPrimaryAction={
        stage === 'form' ? handleProceedToSummary : handleStartGame
      }
    >
      {stage === 'form' ? (
        renderWagerForm()
      ) : (
        <WagerSummaryContent {...wagerDetails} />
      )}
    </Modal>
  );
}