'use client';

interface StatisticsPanelProps {
  /** Pre-formatted remaining time (e.g. `04:12`). */
  time: string;
  potWin: string;
  scores: string;
}

/**
 * Presentational statistics panel.
 *
 * The remaining time is passed in by the parent screen, which owns the single
 * round timer (`useGameTimer`) so no component in the tree starts a competing
 * interval.
 */
export function StatisticsPanel({
  time,
  potWin,
  scores,
}: StatisticsPanelProps) {
  return (
    <div className="relative">
      <div className="bg-[#F5F5F5] dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <h3 className="text-purple-500 text-lg font-medium mb-3">STATISTICS</h3>

        <div className="bg-white dark:bg-gray-700 rounded-xl p-4">
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 dark:text-gray-400 text-base">
                Time Left:
              </span>
              <span
                className="text-lg font-medium text-green-500"
                data-testid="round-time-left"
              >
                {time}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 dark:text-gray-400 text-base">
                Pot. Win
              </span>
              <span className="text-black dark:text-white text-lg font-bold">
                {potWin}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-400 dark:text-gray-400 text-base">
                Scores
              </span>
              <span className="text-black dark:text-white text-lg font-bold">
                {scores}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
