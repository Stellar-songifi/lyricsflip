'use client';

import { useModalStore } from '@/store/modal-store';
import { Modal } from './modal';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { useXlmBalance } from '@/lib/stellar/hooks/use-xlm-balance';
import { useEffect, useState } from 'react';
import { GENRE_MAPPING, GenreKey } from './wager-modal';
import { WagerDetails } from '@/store';
import { WAGER_ASSET_CODE, formatAmount, parseAmountToStroops } from '@/lib/utils';

export interface WagerSummaryContentProps extends WagerDetails {
  walletBalance?: string | null;
  balanceStroops?: bigint;
}

export function WagerSummaryContent({
  genre,
  difficulty,
  wagerAmount,
  potentialWin,
  stakeStroops: customStakeStroops,
}: WagerSummaryContentProps) {
  const { balance, formatted: walletBalance } = useXlmBalance();
  const displayGenre = genre
    ? GENRE_MAPPING[genre as GenreKey]?.display || genre
    : 'Unknown';

  const stakeStroops = customStakeStroops
    ? BigInt(customStakeStroops)
    : parseAmountToStroops(wagerAmount);

  const remainingBalance =
    balance !== undefined
      ? balance >= stakeStroops
        ? formatAmount(balance - stakeStroops)
        : '0'
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Round Setup
        </h4>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Genre:</span>
          <span className="font-medium">{displayGenre}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Difficulty:</span>
          <span className="font-medium capitalize">{difficulty || 'Normal'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Round Rules:</span>
          <span className="font-medium">5 Questions · 15s per Question</span>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
          Escrow Deposit
        </h4>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Wager Stake:</span>
          <span className="font-bold text-foreground">
            {wagerAmount} {WAGER_ASSET_CODE}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({formatAmount(stakeStroops)} stroops)
            </span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current Wallet Balance:</span>
          <span className="font-medium">
            {walletBalance ?? '—'} {WAGER_ASSET_CODE}
          </span>
        </div>
        {remainingBalance !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Balance After Escrow:</span>
            <span className="font-medium text-muted-foreground">
              ~{remainingBalance} {WAGER_ASSET_CODE}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm pt-1 border-t border-border/50">
          <span className="text-muted-foreground">Potential Prize:</span>
          <span className="font-bold text-green-600 dark:text-green-400">
            {potentialWin || `${wagerAmount} ${WAGER_ASSET_CODE}`}
          </span>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 p-4 text-xs space-y-2 text-muted-foreground">
        <p className="font-medium text-foreground">Escrow Transfer Notice:</p>
        <p>
          Confirming this transaction deposits{' '}
          <strong className="text-foreground">{wagerAmount} {WAGER_ASSET_CODE}</strong>{' '}
          into the game contract escrow.
        </p>
        <p>
          If the round is cancelled before starting, your wager is 100% refunded
          to your wallet on-chain.
        </p>
      </div>
    </div>
  );
}

export function WagerSummaryModal() {
  const { isOpen, closeModal, modalType } = useModalStore();
  const { setup } = useStellar();
  const [wagerDetails, setWagerDetails] = useState<WagerDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoundDetails = async () => {
    if (!setup) {
      setError('Stellar setup not initialized');
      return;
    }

    try {
      setIsLoading(true);
      const round = {
        genre: 'Pop',
        difficulty: 'medium',
        wagerAmount: '5',
        potentialWin: `5 ${WAGER_ASSET_CODE}`,
        stakeStroops: parseAmountToStroops(5).toString(),
      };
      setWagerDetails(round);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to get round details',
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && modalType === 'wager-summary') {
      fetchRoundDetails();
    }
  }, [isOpen, modalType, setup]);

  if (!isOpen || modalType !== 'wager-summary') return null;

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Wager Escrow Summary">
      {isLoading ? (
        <div className="text-center py-4">Loading escrow details...</div>
      ) : error ? (
        <div className="text-red-500 text-center py-4">{error}</div>
      ) : wagerDetails ? (
        <WagerSummaryContent {...wagerDetails} />
      ) : (
        <div className="text-center py-4">No round details available</div>
      )}
    </Modal>
  );
}