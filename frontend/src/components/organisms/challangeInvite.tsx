import { Copy, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Round } from '@/lib/stellar/types';
import { formatAmount, WAGER_ASSET_CODE } from '@/lib/utils';

interface ChallengeInviteProps {
  round: Round;
  players: string[];
  isReady: boolean;
  isBusy: boolean;
  onReady: () => void;
}

export default function ChallengeInvite({
  round,
  players,
  isReady,
  isBusy,
  onReady,
}: ChallengeInviteProps) {
  const router = useRouter();
  const [isCopied, setIsCopied] = useState(false);

  const inviteCode = round.round_id.toString();
  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/multiplayer/${inviteCode}`
      : '';

  const handleCopyCode = () => {
    navigator.clipboard
      .writeText(inviteLink)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
      });
  };

  const handleClose = () => {
    router.back();
  };

  const handleShareInvite = () => {
    if (navigator.share) {
      navigator
        .share({
          title: 'Join my challenge!',
          text: `Join my LyricsFlip challenge (round ${inviteCode})`,
          url: inviteLink,
        })
        .catch((err) => console.warn('Error sharing:', err));
    } else {
      handleCopyCode();
      alert('Invite link copied to clipboard!');
    }
  };

  const challengeData = {
    gameMode: `Wager (Multi Player) · ${round.genre}`,
    participants: players.length,
    wagerAmount: `${formatAmount(round.wager_amount)} ${WAGER_ASSET_CODE}`,
  };

  return (
    <div className="w-full h-auto bg-black/10 flex justify-end p-10">
      <div className="w-full max-w-[580px] min-h-[960px] h-full bg-white rounded-[16px] border-[1.5px] border-[#DBE2E8] p-[32px]">
        <div className="flex justify-end">
          <p
            className="hover:cursor-pointer w-fit p-1 border border-[#DBE1E7] rounded-full"
            onClick={handleClose}
          >
            <X size={16} color="#090909" />
          </p>
        </div>
        <div className="w-full flex flex-col gap-[4px]">
          <h1
            aria-label="Your wager challenge has been created "
            className="text-[24px] font-[600]"
          >
            Your wager challenge has been created
          </h1>
          <p className="text-[14px] font-[400] text-[#120029]">
            Share the invite code below for others to join in
          </p>
        </div>

        <div className="flex justify-center items-center space-x-3 my-5">
          <h1
            aria-label="invite Code"
            className="sm:text-[48px] text-[30px] font-[800]"
          >
            {inviteCode}
          </h1>
          <span
            className="hover:cursor-pointer w-fit"
            onClick={handleCopyCode}
            title={isCopied ? 'Copied!' : 'Copy to clipboard'}
          >
            <Copy color="#9747FF" />
            {isCopied && <span className="sr-only">Copied!</span>}
          </span>
        </div>

        <div className="flex flex-col gap-[12px]">
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">Game Mode</span>
            <span className="font-[500]">{challengeData.gameMode}</span>
          </div>
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">
              Number of Participants
            </span>
            <span className="font-[500]">{challengeData.participants}</span>
          </div>
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">Wager Amount</span>
            <span className="font-[500]">{challengeData.wagerAmount}</span>
          </div>
        </div>

        <div className="border-[0.5px] p-[16px] rounded-[12px] gap-[17px] bg-[#F0F0F0] flex flex-col mt-5">
          <div className="flex space-x-1 items-center text-[#9747FF]">
            <Lightbulb size={16} />
            <span className="text-[12px] font-[500]">INSTRUCTION</span>
          </div>
          <p className="text-[16px] bg-white font-[400] text-[#08090A] border p-[16px] rounded-[8px] border-[#DBE1E7]">
            A card displaying a lyric from a song will appear along with a list
            of possible answers. Your goal is to score the highest point amongst
            your challengers.
          </p>
        </div>

        <div className="w-full flex gap-[32px] mb-10 mt-20">
          <button
            type="button"
            onClick={handleShareInvite}
            className="w-full rounded-full bg-transparent border border-[#9747FF] hover:bg-[#9747FF] text-[#9747FF] py-[24px] hover:text-white text-[16px] font-[600] transition-all duration-200"
          >
            Share Invite Link
          </button>
          <button
            type="button"
            onClick={onReady}
            disabled={isReady || isBusy}
            className="w-full rounded-full bg-[#9747FF] border border-[#9747FF] hover:bg-transparent text-white py-[24px] hover:text-[#9747FF] text-[16px] font-[600] transition-all duration-200"
          >
            {isReady
              ? 'Waiting for players…'
              : isBusy
                ? 'Submitting…'
                : 'Ready'}
          </button>
        </div>
      </div>
    </div>
  );
}
