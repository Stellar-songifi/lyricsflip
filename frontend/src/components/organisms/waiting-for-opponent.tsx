import { Copy, Lightbulb, X } from 'lucide-react';
// import LoadingSpinner from '../atoms/loading-spiner';
import { useState, useEffect } from 'react';

export default function WaitingForOpponent() {
  const [timeLeft, setTimeLeft] = useState(120);
  const [playersJoined, setPlayersJoined] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(2);
  const [isCopied, setIsCopied] = useState(false);
  const inviteCode = 'LF34567QW';

  // Handle closing the waiting screen
  const handleClose = () => {
  };

  // Handle copying the invite code
  const handleCopyCode = () => {
    navigator.clipboard
      .writeText(inviteCode)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
      });
  };

  // Countdown timer effect
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timerId = setInterval(() => {
      setTimeLeft(timeLeft - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft]);

  // Simulate player joining (in a real app, this would come from WebSocket or polling)
  useEffect(() => {
    const joinInterval = setInterval(() => {
      if (playersJoined < totalPlayers) {
        setPlayersJoined((prev) => prev + 1);
      } else {
        clearInterval(joinInterval);
      }
    }, 15000);

    return () => clearInterval(joinInterval);
  }, [playersJoined, totalPlayers]);

  // Format time for display (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="w-full h-auto bg-black/10 flex justify-end p-10">
      <div className="w-full max-w-[580px] min-h-[960px] h-full bg-white rounded-[16px] border-[1.5px] border-[#DBE2E8] p-[32px]">
        <div className="flex justify-end">
          <p
            className="hover:cursor-pointer p-1 w-fit border border-[#DBE1E7] rounded-full"
            onClick={handleClose}
          >
            <X size={16} color="#090909" />
          </p>
        </div>

        <div className="w-full flex flex-col gap-[4px]">
          <h1 className="text-[24px] font-[600]">
            Your wager challenge has been created
          </h1>
          <p className="text-[14px] font-[400] text-[#120029]">
            Waiting for others to join
          </p>
        </div>

        {/* Invite Code Section */}
        <div className="flex justify-center items-center space-x-3 my-5">
          <h1 className="sm:text-[48px] text-[30px] font-[800]">{inviteCode}</h1>
          <span
            className="hover:cursor-pointer w-fit relative"
            onClick={handleCopyCode}
            title={isCopied ? 'Copied!' : 'Copy to clipboard'}
          >
            <Copy color="#9747FF" />
            {isCopied && (
              <span className="absolute -top-6 -right-2 bg-[#9747FF] text-white text-xs px-2 py-1 rounded">
                Copied!
              </span>
            )}
          </span>
        </div>

        {/* Challenge Info Section */}
        <div className="flex flex-col gap-[12px] mt-4">
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">Time Remaining</span>
            <span className="font-[500]">{formatTime(timeLeft)}</span>
          </div>
          <div className="flex w-full border-b border-black/30 justify-between text-[16px] font-[400]">
            <span className="p-[12px] text-[#636363]">Players Joined</span>
            <span className="font-[500]">
              {playersJoined}/{totalPlayers}
            </span>
          </div>
        </div>

        {/* Instructions Section */}
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

        {/* Loading and Status Section */}
        <div className="w-full flex flex-col justify-center items-center gap-[8px] mt-20">
          {/* <LoadingSpinner /> */}
          <div className="flex flex-col gap-[8px] justify-center w-full items-center">
            <span className="text-[20px] font-[500] text-[#000000]">
              {playersJoined === totalPlayers
                ? 'All players joined!'
                : 'Waiting for opponents...'}
            </span>
            <span className="text-[16px] font-[400] text-[#666666]">
              {playersJoined} joined, {totalPlayers - playersJoined} left
            </span>
            {playersJoined === totalPlayers && (
              <button
                className="mt-4 text-[16px] font-[500] w-full max-w-[200px] hover:bg-transparent hover:border border-[#9747FF] hover:text-[#9747FF] transition-colors duration-200 rounded-full bg-[#9747FF] text-white py-[12px]"
                onClick={() => {}}
              >
                Start Game
              </button>
            )}
          </div>
        </div>

        {/* Share Button */}
        <div className="w-full mt-8">
          <button
            type="button"
            onClick={handleCopyCode}
            className="w-full rounded-full bg-transparent border border-[#9747FF] hover:bg-[#9747FF] text-[#9747FF] py-[16px] hover:text-white text-[16px] font-[600] transition-all duration-200"
          >
            Share Invite Code
          </button>
        </div>
      </div>
    </div>
  );
}
