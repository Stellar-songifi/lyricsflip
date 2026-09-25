import { useModalStore } from '@/store/modal-store';
import { Modal } from './modal';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useState, useEffect } from 'react';
import { WAGER_ASSET_CODE } from '@/lib/utils';

export const GameResultModal = () => {
  const { isOpen, modalType, closeModal } = useModalStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { systemCalls } = useStellar();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundData, setRoundData] = useState<any>(null);

  const roundId = searchParams.get('roundId');

  useEffect(() => {
    const fetchRoundData = async () => {
      if (!roundId) return;
      
      if (!systemCalls) {
        setError('System calls not initialized');
        return;
      }

      try {
        setIsLoading(true);
        const data = await systemCalls.getRound(BigInt(roundId));
        setRoundData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch round data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId, systemCalls]);

  const renderResultContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">Loading...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600] text-red-500">{error}</p>
        </div>
      );
    }

    if (!roundData) {
      return (
        <div className="flex justify-center items-center h-64">
          <p className="text-[24px] font-[600]">No round data available</p>
        </div>
      );
    }

    const imageSrc = modalType === 'won' ? '/success.png' : '/failed.png';
    const title = modalType === 'won' ? 'You are amazing🔥' : 'Better luck next time🍀';
    const score = roundData.score || 0;
    const maxRounds = roundData.maxRounds || 0;
    const percent = (score / maxRounds) * 100;

    return (
      <div className="space-y-4 mt-10">
        <div className="flex flex-col justify-center items-center gap-6">
          <Image width={200} height={200} src={imageSrc} alt="" />
          <p className="font-bold text-[32px]">
            <span className="text-[#70E3C7]">{score} Points</span> - {title}
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">Score</span>
            <span className="font-medium">
              {`${score} / ${maxRounds}`} ({percent.toFixed()}%)
            </span>
          </div>

          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">Odds</span>
            <span className="font-medium flex items-center gap-1.5">
              {roundData.odds} odds (Get everything right){' '}
              <span className="bg-[#0AC660] rounded-full w-5 h-5 flex items-center justify-center">
                <Check className="text-white w-3 h-3" />
              </span>
            </span>
          </div>

          <div className="flex justify-between items-center border-b py-[12px]">
            <span className="text-gray-600">Wager Amount</span>
            <span className="font-medium">
              {roundData.wagerAmount} {WAGER_ASSET_CODE}
            </span>
          </div>
          {modalType === 'won' && (
            <div className="flex justify-between items-center border-b py-[12px]">
              <span className="text-gray-600">You Win</span>
              <span className="font-medium text-[#9747FF]">
                {roundData.potentialWin} {WAGER_ASSET_CODE}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFooter = () => {
    const handleCloseModal = async () => {
      closeModal();
      router.push('/');
    };

    const handleShare = () => {
      if (navigator.share) {
        navigator.share({
          title: 'Check out my game result!',
          text: `I scored ${roundData?.score || 0} points in LyricsFlip!`,
          url: window.location.href,
        }).catch((err) => console.warn('Error sharing:', err));
      } else {
        navigator.clipboard.writeText(window.location.href)
          .then(() => alert('Link copied to clipboard!'))
          .catch((err) => console.error('Failed to copy:', err));
      }
    };

    return (
      <div className="flex gap-4 justify-center mt-10 w-full">
        <button
          onClick={handleShare}
          className="cursor-pointer border hover:bg-purple-600 hover:text-[#fff] border-purple-600 text-purple-600 px-4 py-4 w-[50%] rounded-full"
        >
          Share
        </button>
        <button
          onClick={handleCloseModal}
          className="cursor-pointer hover:bg-white border border-purple-600 hover:text-purple-600 bg-purple-600 text-white px-6 py-4 rounded-full w-[50%]"
        >
          Play Again
        </button>
      </div>
    );
  };

  const isModalOpen = isOpen && (modalType === 'won' || modalType === 'lost');

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={closeModal}
      title=""
      footerContent={renderFooter()}
    >
      {renderResultContent()}
    </Modal>
  );
};
