'use client';
import { useEffect, useState } from 'react';

import { useGameTimer } from '@/features/game/hooks/useGameTimer';
import GameResultPopup from '../organisms/GameResultPopup';
import { formatTime } from '@/lib/utils';

interface StatisticsPanelProps {
  time: string;
  potWin: string;
  scores: string;
  multiplayer?: boolean;
}

export function StatisticsPanel({
  time,
  potWin,
  scores,
  multiplayer = false,
}: StatisticsPanelProps) {
  const [remainingTime, setRemainingTime] = useState<string>(time);
  const [showGameResult, setShowGameResult] = useState<boolean>(false);

  const { timeLeft, startTimer, resetTimer, endGame, isPlaying } =
    useGameTimer();

  useEffect(() => {
    const numericTimeLeft = parseInt(time, 10);
    resetTimer(numericTimeLeft);
    startTimer();
  }, []);

  useEffect(() => {
    if (timeLeft > 0) {
      setRemainingTime(formatTime(parseInt(timeLeft.toString(), 10)));
    } else {
      endGame();
      setShowGameResult(true);
    }
  }, [timeLeft]);

  return (
    <div className="relative">
      <div className="bg-[#F5F5F5] dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-purple-500 text-lg font-medium mb-3">STATISTICS</h3>

        <div className="bg-white dark:bg-gray-700 rounded-xl p-4">
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 dark:text-gray-400 text-base">Time Left:</span>
              <span
                className={`text-lg font-medium ${
                  isPlaying ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {remainingTime}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 dark:text-gray-400 text-base">Pot. Win</span>
              <span className="text-black dark:text-white text-lg font-bold">{potWin}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 dark:text-gray-400 text-base">Scores</span>
              <span className="text-black dark:text-white text-lg font-bold">{scores}</span>
            </div>
          </div>
        </div>
      </div>

      {showGameResult && (
        <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center">
          <GameResultPopup isWin={false} isMultiplayer={multiplayer} />
        </div>
      )}
    </div>
  );
}
