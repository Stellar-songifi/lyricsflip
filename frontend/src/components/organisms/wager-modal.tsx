'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/atoms/select';
import { useModalStore } from '@/store/modal-store';
import { useState } from 'react';
import { Input } from '../atoms/input';
import { Modal } from './modal';
import { WagerSummaryContent } from './wager-summary-modal';
import { WagerDetails, useStore } from '@/store';
import { useRouter } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { GENRE_OPTIONS } from '@/lib/stellar/genres';
import type { Genre } from '@/lib/stellar/types';
import { useXlmBalance, MIN_FEE_STROOPS } from '@/lib/stellar/hooks/use-xlm-balance';
import {
  WAGER_ASSET_CODE,
  MIN_WAGER_STROOPS,
  MAX_WAGER_STROOPS,
  formatAmount,
  parseAmountToStroops,
} from '@/lib/utils';

// Map form genre values to contract Genre enum variants and labels
export const GENRE_MAPPING: Record<string, { variant: Genre; display: string }> =
  Object.fromEntries(
    GENRE_OPTIONS.map(({ value, label }) => [
      value,
      { variant: value, display: label },
    ]),
  );

export type GenreKey = keyof typeof GENRE_MAPPING;

export function WagerModal() {
  const router = useRouter();
  const { isOpen, closeModal, modalType } = useModalStore();
  const [stage, setStage] = useState<'form' | 'summary'>('form');
  const [wagerDetails, setWagerDetails] = useState<WagerDetails>({
    genre: '',
    difficulty: 'medium',
    wagerAmount: '5',
    potentialWin: `5 ${WAGER_ASSET_CODE}`,
    stakeStroops: parseAmountToStroops(5).toString(),
  });
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startGame = useStore((state) => state.game.startGame);
  const isModalOpen = isOpen && modalType === 'wager';

  const { setup, account } = useStellar();
  const {
    balance: walletBalanceStroops,
    formatted: walletBalanceFormatted,
    isBelowRequired,
  } = useXlmBalance();

  const handleWagerChange = (amountStr: string) => {
    const stakeStroops = parseAmountToStroops(amountStr);
    setWagerDetails((prev) => ({
      ...prev,
      wagerAmount: amountStr,
      stakeStroops: stakeStroops.toString(),
      potentialWin: `${amountStr || '0'} ${WAGER_ASSET_CODE}`,
    }));
  };

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!wagerDetails.genre) {
      errors.genre = 'Genre is required';
    } else if (!GENRE_MAPPING[wagerDetails.genre as GenreKey]) {
      errors.genre = 'Invalid genre selected';
    }

    if (!wagerDetails.difficulty) {
      errors.difficulty = 'Difficulty is required';
    }

    const stakeStroops = parseAmountToStroops(wagerDetails.wagerAmount);
    if (!wagerDetails.wagerAmount || stakeStroops <= BigInt(0)) {
      errors.wagerAmount = 'A positive wager amount is required';
    } else if (stakeStroops < MIN_WAGER_STROOPS) {
      errors.wagerAmount = `Minimum wager is ${formatAmount(MIN_WAGER_STROOPS)} ${WAGER_ASSET_CODE}`;
    } else if (stakeStroops > MAX_WAGER_STROOPS) {
      errors.wagerAmount = `Maximum wager is ${formatAmount(MAX_WAGER_STROOPS)} ${WAGER_ASSET_CODE}`;
    } else if (isBelowRequired(stakeStroops + MIN_FEE_STROOPS)) {
      errors.wagerAmount = `Insufficient balance: you need at least ${formatAmount(stakeStroops + MIN_FEE_STROOPS)} ${WAGER_ASSET_CODE} including transaction fees.`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProceedToSummary = () => {
    if (validateForm()) {
      setStage('summary');
      setFormErrors({});
      setSubmissionError(null);
    }
  };

  const handleStartGame = async () => {
    setSubmissionError(null);
    setIsSubmitting(true);

    try {
      if (!account) {
        setSubmissionError('No account connected. Please connect your wallet.');
        setIsSubmitting(false);
        return;
      }

      if (!setup?.systemCalls) {
        setSubmissionError('Game system not initialized. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const genreKey = wagerDetails.genre as GenreKey;
      const genreInfo = GENRE_MAPPING[genreKey];

      if (!genreInfo) {
        setSubmissionError('Invalid genre selected.');
        setIsSubmitting(false);
        return;
      }

      const stakeStroops = parseAmountToStroops(wagerDetails.wagerAmount);
      if (stakeStroops < MIN_WAGER_STROOPS) {
        setSubmissionError(
          `Minimum wager is ${formatAmount(MIN_WAGER_STROOPS)} ${WAGER_ASSET_CODE}`,
        );
        setIsSubmitting(false);
        return;
      }

      if (isBelowRequired(stakeStroops + MIN_FEE_STROOPS)) {
        setSubmissionError(
          `Insufficient balance. You need at least ${formatAmount(stakeStroops + MIN_FEE_STROOPS)} ${WAGER_ASSET_CODE} for stake and network reserve.`,
        );
        setIsSubmitting(false);
        return;
      }

      // The solo round is created by the game page with `create_solo_round`
      // (one signature that also starts it and draws the first card, LF-297).
      // Start game in store with real wager amount
      startGame({
        genre: wagerDetails.genre,
        difficulty: wagerDetails.difficulty,
        duration: '75s',
        odds: 1,
        wagerAmount: parseFloat(wagerDetails.wagerAmount),
      });

      closeModal();
      router.push(`/single-player?genre=${genreInfo.variant}`);
      setWagerDetails({
        genre: '',
        difficulty: 'medium',
        wagerAmount: '5',
        potentialWin: `5 ${WAGER_ASSET_CODE}`,
        stakeStroops: parseAmountToStroops(5).toString(),
      });
      setStage('form');
    } catch (err) {
      console.error('Error creating round:', err);
      setSubmissionError(
        err instanceof Error ? err.message : 'Failed to create round. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStakeStroops = parseAmountToStroops(wagerDetails.wagerAmount);
  const isBalanceInsufficient = isBelowRequired(currentStakeStroops + MIN_FEE_STROOPS);

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
            <SelectItem value="easy">Easy (1x points)</SelectItem>
            <SelectItem value="medium">Medium (2x points)</SelectItem>
            <SelectItem value="hard">Hard (3x points)</SelectItem>
          </SelectContent>
        </Select>
        {formErrors.difficulty && (
          <p className="text-red-500 text-xs">{formErrors.difficulty}</p>
        )}
      </div>

      {/* Configured Round Parameters (Replaces unsupported duration and odds fields) */}
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
        <span className="font-semibold text-foreground">Configured Round Rules:</span>
        <div className="flex justify-between text-muted-foreground">
          <span>Cards per Round:</span>
          <span className="font-medium text-foreground">5 Questions</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Answer Window:</span>
          <span className="font-medium text-foreground">15s per Question (~75s total)</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Escrow Pot:</span>
          <span className="font-medium text-foreground">Winner takes all</span>
        </div>
      </div>

      {/* Escrow Deposit & Balance Section */}
      <div className="bg-muted/30 p-4 rounded-lg flex flex-col gap-3 border border-border">
        <div className="flex justify-between items-center text-xs">
          <span className="font-medium text-muted-foreground">Wallet Balance:</span>
          <span className="font-semibold text-primary">
            {walletBalanceFormatted ?? '0'} {WAGER_ASSET_CODE}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px] text-muted-foreground">
          <span>Min Wager: 1 {WAGER_ASSET_CODE}</span>
          <span>Max Wager: 1,000 {WAGER_ASSET_CODE}</span>
        </div>

        <div className="text-sm flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="your-wager">
            Your Wager Stake
          </label>
          <div className="flex bg-background border border-input focus-within:ring-1 focus-within:ring-ring p-2 rounded-[4px] items-center">
            <Input
              type="number"
              min="1"
              max="1000"
              step="0.1"
              name="your-wager"
              id="your-wager"
              value={wagerDetails.wagerAmount}
              onChange={(e) => handleWagerChange(e.target.value)}
              className={`border-none shadow-none focus-visible:ring-0 ${formErrors.wagerAmount ? 'border-red-500' : ''}`}
              placeholder="e.g. 5"
            />
            <span className="text-xs font-semibold px-2 text-muted-foreground">
              {WAGER_ASSET_CODE}
            </span>
          </div>
          {formErrors.wagerAmount && (
            <p className="text-red-500 text-xs">{formErrors.wagerAmount}</p>
          )}
          {isBalanceInsufficient && !formErrors.wagerAmount && (
            <p className="text-amber-500 text-xs">
              Warning: Insufficient balance to cover stake and transaction fee reserve.
            </p>
          )}
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
      title={stage === 'form' ? 'Wager (Single Player)' : 'Escrow Deposit Summary'}
      description={
        stage === 'form'
          ? 'Select your genre, specify your stake to escrow in the contract, and answer questions before time runs out.'
          : undefined
      }
      primaryActionLabel={
        stage === 'form'
          ? 'Proceed to Summary'
          : isSubmitting
            ? 'Transferring to Escrow...'
            : 'Confirm & Deposit Stake'
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