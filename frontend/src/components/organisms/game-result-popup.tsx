'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { FaCircleCheck } from 'react-icons/fa6';
import { MdCancel } from 'react-icons/md';
import { Button } from '@/components/atoms/button';
import { Modal } from './modal';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { createConfig } from '@/lib/stellar/stellar-config';
import { formatAmount, WAGER_ASSET_CODE } from '@/lib/utils';
import { toast } from 'sonner';

interface GameResultPopupProps {
  isWin: boolean;
  isMultiplayer: boolean;
  roundId?: string | number | bigint | null;
  roundData?: any;
  isCancelled?: boolean;
}

const GameResultPopup: React.FC<GameResultPopupProps> = ({
  isWin,
  isMultiplayer,
  roundId: propRoundId,
  roundData: propRoundData,
  isCancelled: propIsCancelled,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { systemCalls, account } = useStellar();
  const { wageringEnabled } = createConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedRoundData, setFetchedRoundData] = useState<any>(null);
  const [isClaimed, setIsClaimed] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const effectiveRoundId = propRoundId ?? searchParams?.get('roundId') ?? null;
  const roundData = propRoundData ?? fetchedRoundData;
  const isCancelled = propIsCancelled || roundData?.is_cancelled;

  useEffect(() => {
    if (propRoundData || !effectiveRoundId) return;

    const fetchRoundData = async () => {
      if (!systemCalls) {
        return;
      }

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

        setFetchedRoundData({
          ...data,
          score: playerScore,
          maxRounds: cards.length || 1,
          wagerAmount: formatAmount(data.wager_amount),
          potentialWin: formatAmount(data.wager_amount),
          odds: '1.0',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get round data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoundData();
  }, [effectiveRoundId, systemCalls, account?.address, propRoundData]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
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

  const handleClaimEarnings = async () => {
    if (!systemCalls) {
      const msg = 'System calls not initialized';
      setError(msg);
      toast.error(msg);
      return;
    }

    if (!effectiveRoundId) return;

    setIsClaiming(true);
    const toastId = toast.loading('Claiming earnings…');
    try {
      await systemCalls.claimEarnings(BigInt(effectiveRoundId));
      setIsClaimed(true);
      toast.success('Earnings claimed successfully!', { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to claim earnings';
      setError(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setIsClaiming(false);
    }
  };

  const renderResultContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">Loading...</p>
        </div>
      );
    }

    if (error && !roundData) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600] text-red-500">{error}</p>
        </div>
      );
    }

    if (!roundData && !isWin && !isCancelled) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">No round data available</p>
        </div>
      );
    }

    const score = roundData?.score || 0;
    const maxRounds = roundData?.maxRounds || 0;
    const percent = maxRounds > 0 ? (score / maxRounds) * 100 : 0;
    const wagerAmount = roundData?.wagerAmount ?? roundData?.wager_amount ?? '0';

    return (
      <div className="space-y-4 mt-10">
        <div className="flex flex-col justify-center items-center gap-6">
          <div className="size-[200px]">
            <Image
              src={isWin ? '/trophy.png' : isCancelled ? '/warning.png' : '/warning.png'}
              alt={isWin ? 'trophy' : isCancelled ? 'cancelled' : 'lost'}
              width={200}
              height={200}
              className="w-full h-full"
            />
          </div>
          <p className="font-bold text-[32px] text-center">
            {!isCancelled && <span className="text-[#70E3C7]">{score} Points - </span>}
            {isCancelled ? (
              <span>Round Cancelled</span>
            ) : isWin && isMultiplayer ? (
              <span>You won🥇</span>
            ) : isWin ? (
              <span>You are amazing🔥</span>
            ) : (
              <span>You lost😞</span>
            )}
          </p>
          {isCancelled && (
            <p className="text-gray-500 text-sm max-w-sm text-center">
              This round was cancelled. Your wager has been refunded to your wallet.
            </p>
          )}
        </div>

        {!isMultiplayer ? (
          <div className="space-y-3">
            {!isCancelled && (
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
                <span className="font-medium flex items-center gap-2">
                  {roundData.odds} odds (Get everything right){' '}
                  <span>
                    {isWin ? (
                      <FaCircleCheck className="text-green-600 size-5" />
                    ) : (
                      <MdCancel className="text-red-600 size-5" />
                    )}
                  </span>
                </span>
              </div>
            )}
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Wager Amount</span>
              <span className="font-medium">
                {wagerAmount} {WAGER_ASSET_CODE}
              </span>
            </div>
            {isWin && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">You Win</span>
                <span className="font-medium text-[#9747FF]">
                  {roundData?.potentialWin ?? (BigInt(wagerAmount || 0) * BigInt(2)).toString()} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
            {!isWin && !isCancelled && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Wager Lost</span>
                <span className="font-medium text-red-500">
                  -{wagerAmount} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
            {isCancelled && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Refund</span>
                <span className="font-medium text-green-600">
                  +{roundData?.refundAmount ?? wagerAmount} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Winner</span>
              <span className="font-medium">
                {isWin ? 'You' : roundData?.winner}
              </span>
            </div>
            {isWin && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Prize Won</span>
                <span className="font-medium text-[#9747FF]">
                  {roundData?.prize} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">Wager Amount</span>
              <span className="font-medium">{wagerAmount} {WAGER_ASSET_CODE}</span>
            </div>
            {!isWin && !isCancelled && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Wager Lost</span>
                <span className="font-medium text-red-500">
                  -{wagerAmount} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
            {isCancelled && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Refund</span>
                <span className="font-medium text-green-600">
                  +{roundData?.refundAmount ?? wagerAmount} {WAGER_ASSET_CODE}
                </span>
              </div>
            )}
            {roundData?.secondPlace && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Second Place</span>
                <span className="font-medium">
                  {isWin ? roundData.secondPlace : 'You'}
                </span>
              </div>
            )}
            {roundData?.thirdPlace && (
              <div className="flex justify-between items-center border-b py-[12px]">
                <span className="text-gray-600">Third Place</span>
                <span className="font-medium">{roundData.thirdPlace}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    return (
      <div className="flex flex-col gap-3 justify-center mt-10 w-full">
        {/* Claim Winnings button disappears once claim succeeds */}
        {wageringEnabled && isWin && !isClaimed && (
          <Button
            variant="purple"
            size="lg"
            className="w-full px-2 py-6 h-[64px] flex justify-center items-center rounded-full font-medium text-md text-white disabled:opacity-50"
            onClick={handleClaimEarnings}
            disabled={isClaiming || isLoading}
            data-testid="claim-earnings-button"
          >
            {isClaiming ? 'Claiming…' : 'Claim Earning'}
          </Button>
        )}

        {isWin && isClaimed && (
          <div
            data-testid="earnings-claimed-badge"
            className="w-full text-center py-3 text-sm font-semibold text-green-700 bg-green-50 rounded-full border border-green-200"
          >
            ✓ Earnings Claimed
          </div>
        )}

        <div className="flex gap-4 justify-center w-full">
          <Button
            variant="outline"
            size="lg"
            className="w-1/2 px-2 py-6 border-[#9747FF] h-[64px] flex justify-center items-center rounded-full font-medium text-md text-[#9747FF]"
            onClick={handleShare}
          >
            Share
          </Button>
          <Button
            variant="purple"
            size="lg"
            className="w-1/2 px-2 py-6 h-[64px] flex justify-center items-center rounded-full font-medium text-md text-white"
            onClick={handleCloseModal}
          >
            Play Again
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      title=""
      footerContent={renderFooter()}
    >
      {renderResultContent()}
    </Modal>
  );
};

export default GameResultPopup;
