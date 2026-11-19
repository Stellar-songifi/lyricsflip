'use client';

import { useModalStore, type ModalType } from '@/store/modal-store';
import { Modal } from './modal';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { createConfig } from '@/lib/stellar/stellar-config';
import { useState, useEffect } from 'react';
import { formatAmount, WAGER_ASSET_CODE } from '@/lib/utils';
import { toast } from 'sonner';

export interface GameResultModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  modalType?: ModalType;
  roundId?: string | number | bigint | null;
  roundData?: {
    score?: number;
    maxRounds?: number;
    odds?: number;
    wagerAmount?: string | number | bigint;
    potentialWin?: string | number | bigint;
    refundAmount?: string | number | bigint;
    is_cancelled?: boolean;
  };
}

export const GameResultModal = (props: GameResultModalProps = {}) => {
  const store = useModalStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { systemCalls, account } = useStellar();
  const { wageringEnabled } = createConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedRoundData, setFetchedRoundData] = useState<any>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);

  const effectiveRoundId = props.roundId ?? searchParams?.get('roundId') ?? null;
  const currentModalType = props.modalType ?? store.modalType;
  const effectiveIsOpen = props.isOpen ?? store.isOpen;
  const handleClose = props.onClose ?? store.closeModal;

  const roundData = props.roundData ?? fetchedRoundData;

  useEffect(() => {
    // If roundData was explicitly passed via props, no need to fetch
    if (props.roundData || !effectiveRoundId) return;

    if (!systemCalls) {
      return;
    }

    let isMounted = true;
    const fetchRoundData = async () => {
      try {
        setIsLoading(true);
        const id = BigInt(effectiveRoundId);
        const [data, scores, cards] = await Promise.all([
          systemCalls.getRound(id),
          systemCalls.getRoundScores(id).catch((): Record<string, number> => ({})),
          systemCalls.getRoundCards(id).catch(() => []),
        ]);

        const playerScore =
          account?.address && scores[account.address] !== undefined
            ? scores[account.address]
            : (scores[data.admin] ?? 0);

        if (isMounted) {
          setFetchedRoundData({
            ...data,
            score: playerScore,
            maxRounds: cards.length || 1,
            wagerAmount: formatAmount(data.wager_amount),
            potentialWin: formatAmount(data.wager_amount),
            odds: '1.0',
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch round data');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchRoundData();
    return () => {
      isMounted = false;
    };
  }, [effectiveRoundId, systemCalls, account?.address, props.roundData]);

  const handleClaimWinnings = async () => {
    if (!effectiveRoundId) {
      toast.error('No round ID specified to claim winnings.');
      return;
    }
    if (!systemCalls) {
      toast.error('System calls not initialized. Please connect your wallet.');
      return;
    }

    setIsClaiming(true);
    const toastId = toast.loading('Claiming winnings…');
    try {
      const payout = await systemCalls.claimWinnings(BigInt(effectiveRoundId));
      setIsClaimed(true);
      const payoutStr =
        payout !== undefined && payout !== null
          ? `${typeof payout === 'bigint' ? formatAmount(payout) : payout} ${WAGER_ASSET_CODE}`
          : '';
      toast.success(
        `Winnings claimed successfully! ${payoutStr}`.trim(),
        { id: toastId },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim winnings';
      toast.error(message, { id: toastId });
    } finally {
      setIsClaiming(false);
    }
  };

  const renderResultContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64" data-testid="result-loading">
          <p className="text-[24px] font-[600]">Loading...</p>
        </div>
      );
    }

    if (error && !roundData) {
      return (
        <div className="flex justify-center items-center h-64" data-testid="result-error">
          <p className="text-[24px] font-[600] text-red-500">{error}</p>
        </div>
      );
    }

    if (!roundData && !currentModalType) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">No round data available</p>
        </div>
      );
    }

    const isWon = currentModalType === 'won';
    const isLost = currentModalType === 'lost';
    const isCancelled = currentModalType === 'cancelled' || roundData?.is_cancelled;

    const imageSrc = isWon ? '/success.png' : isCancelled ? '/warning.png' : '/failed.png';
    const title = isWon
      ? 'You are amazing🔥'
      : isCancelled
        ? 'Round Cancelled'
        : 'Better luck next time🍀';

    const score = roundData?.score ?? 0;
    const maxRounds = roundData?.maxRounds ?? 0;
    const percent = maxRounds > 0 ? (score / maxRounds) * 100 : 0;
    const wagerAmount = roundData?.wager_amount ?? roundData?.wagerAmount ?? '0';
    const formattedWager =
      typeof wagerAmount === 'bigint' ? formatAmount(wagerAmount) : wagerAmount.toString();

    const potentialWin = roundData?.potentialWin ?? roundData?.prize ?? (wagerAmount ? (BigInt(wagerAmount) * BigInt(2)).toString() : '0');
    const formattedWin =
      typeof potentialWin === 'bigint' ? formatAmount(potentialWin) : potentialWin.toString();

    const refundAmount = roundData?.refundAmount ?? wagerAmount;
    const formattedRefund =
      typeof refundAmount === 'bigint' ? formatAmount(refundAmount) : refundAmount.toString();

    return (
      <div className="space-y-4 mt-6">
        <div className="flex flex-col justify-center items-center gap-4 text-center">
          <Image width={160} height={160} src={imageSrc} alt={title} />
          <p className="font-bold text-[28px] sm:text-[32px]">
            {!isCancelled && <span className="text-[#70E3C7]">{score} Points - </span>}
            <span>{title}</span>
          </p>
          {isCancelled && (
            <p className="text-gray-500 text-sm max-w-sm">
              This round was cancelled before start. Your wager has been refunded to your wallet.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {!isCancelled && maxRounds > 0 && (
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Score</span>
              <span className="font-medium">
                {`${score} / ${maxRounds}`} ({percent.toFixed()}%)
              </span>
            </div>
          )}

          {roundData?.odds && (
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Odds</span>
              <span className="font-medium flex items-center gap-1.5">
                {roundData.odds} odds (Get everything right){' '}
                <span className="bg-[#0AC660] rounded-full w-5 h-5 flex items-center justify-center">
                  <Check className="text-white w-3 h-3" />
                </span>
              </span>
            </div>
          )}

          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">Wager Amount</span>
            <span className="font-medium">
              {formattedWager} {WAGER_ASSET_CODE}
            </span>
          </div>

          {/* Winner details */}
          {isWon && (
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">You Win</span>
              <span className="font-bold text-[#9747FF]">
                {formattedWin} {WAGER_ASSET_CODE}
              </span>
            </div>
          )}

          {/* Loser details: see what they lost */}
          {isLost && (
            <div className="flex justify-between items-center border-b py-[12px]" data-testid="wager-lost-row">
              <span className="text-gray-600">Wager Lost</span>
              <span className="font-bold text-red-500">
                -{formattedWager} {WAGER_ASSET_CODE}
              </span>
            </div>
          )}

          {/* Cancelled round: show refund */}
          {isCancelled && (
            <div className="flex justify-between items-center border-b py-[12px]" data-testid="refund-row">
              <span className="text-gray-600">Refund</span>
              <span className="font-bold text-green-600">
                +{formattedRefund} {WAGER_ASSET_CODE}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFooter = () => {
    const handleCloseModal = async () => {
      handleClose();
      router.push('/');
    };

    const handleShare = () => {
      if (typeof navigator !== 'undefined' && navigator.share) {
        navigator.share({
          title: 'Check out my game result!',
          text: `I scored ${roundData?.score || 0} points in LyricsFlip!`,
          url: typeof window !== 'undefined' ? window.location.href : '',
        }).catch((err) => console.warn('Error sharing:', err));
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href)
          .then(() => alert('Link copied to clipboard!'))
          .catch((err) => console.error('Failed to copy:', err));
      }
    };

    const isWon = currentModalType === 'won';

    return (
      <div className="flex flex-col gap-3 justify-center mt-6 w-full">
        {/* Claim Winnings button for winners - disappears once claimed */}
        {wageringEnabled && isWon && !isClaimed && (
          <button
            onClick={handleClaimWinnings}
            disabled={isClaiming}
            data-testid="claim-winnings-button"
            className="cursor-pointer w-full py-4 rounded-full font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-lg"
          >
            {isClaiming ? 'Claiming winnings…' : 'Claim Winnings'}
          </button>
        )}

        {/* Claimed status badge once successfully claimed */}
        {isWon && isClaimed && (
          <div
            data-testid="winnings-claimed-badge"
            className="w-full text-center py-3 text-sm font-semibold text-green-700 bg-green-50 rounded-full border border-green-200"
          >
            ✓ Winnings Claimed
          </div>
        )}

        <div className="flex gap-4 w-full">
          <button
            onClick={handleShare}
            className="cursor-pointer border hover:bg-purple-50 border-purple-600 text-purple-600 px-4 py-3.5 w-1/2 rounded-full font-medium"
          >
            Share
          </button>
          <button
            onClick={handleCloseModal}
            className="cursor-pointer hover:bg-purple-700 bg-purple-600 text-white px-6 py-3.5 rounded-full w-1/2 font-medium"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  };

  const isModalOpen =
    effectiveIsOpen &&
    (currentModalType === 'won' || currentModalType === 'lost' || currentModalType === 'cancelled');

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={handleClose}
      title=""
      footerContent={renderFooter()}
    >
      {renderResultContent()}
    </Modal>
  );
};
