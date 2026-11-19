'use client';
import { useEffect, useRef, useState } from 'react';

import { useGameTimer } from '@/features/game/hooks/useGameTimer';
import GameResultPopup from '../organisms/GameResultPopup';
import { formatTime } from '@/lib/utils';

interface StatisticsPanelProps {
  time: string;
  potWin: string;
  scores: string;
  multiplayer?: boolean;
}

/** Thresholds (in seconds) at which the remaining time is announced. */
const ANNOUNCE_AT = [10, 5];

export function StatisticsPanel({
  time,
  potWin,
  scores,
  multiplayer = false,
}: StatisticsPanelProps) {
  const [remainingTime, setRemainingTime] = useState<string>(time);
  const [showGameResult, setShowGameResult] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const announcedRef = useRef<Set<number>>(new Set());

  const { timeLeft, startTimer, resetTimer, endGame, isPlaying } =
    useGameTimer();

  useEffect(() => {
    const numericTimeLeft = parseInt(time, 10);
    resetTimer(numericTimeLeft);
    startTimer();
    announcedRef.current = new Set();
  }, []);

  useEffect(() => {
    const seconds = Math.ceil(Number(timeLeft));
    if (seconds > 0) {
      setRemainingTime(formatTime(seconds));
      if (ANNOUNCE_AT.includes(seconds) && !announcedRef.current.has(seconds)) {
        announcedRef.current.add(seconds);
        setAnnouncement(`${seconds} seconds left`);
      }
    } else {
      setAnnouncement("Time's up");
      endGame();
      setShowGameResult(true);
    }
  }, [timeLeft, endGame]);

  return (
    <div className="relative">
      <div className="bg-[#F5F5F5] rounded-2xl shadow-sm p-4">
        <h3 className="text-purple-500 text-lg font-medium mb-3">STATISTICS</h3>

        <div className="bg-white rounded-xl p-4">
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-base">Time Left:</span>
              <span
                aria-live="off"
                className={`text-lg font-medium ${
                  isPlaying ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {remainingTime}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-base">Pot. Win</span>
              <span className="text-black text-lg font-bold">{potWin}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-base">Scores</span>
              <span className="text-black text-lg font-bold">{scores}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live region: announces the time left at 10 s and 5 s and when time
          runs out (LF-311). */}
      <div aria-live="polite" role="status" className="sr-only" data-testid="timer-announcement">
        {announcement}
      </div>

      {showGameResult && (
        <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center">
          <GameResultPopup isWin={false} isMultiplayer={multiplayer} />
        </div>
      )}
    </div>
  );
}
