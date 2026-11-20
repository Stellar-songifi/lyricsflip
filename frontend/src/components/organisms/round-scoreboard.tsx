'use client';

import { Trophy } from 'lucide-react';

export interface RoundScoreboardProps {
  /** Every player in the round, including the local one. */
  players: string[];
  /** Current points per address (from `AnswerSubmitted` / `get_round_scores`). */
  scores: Record<string, number>;
  /** How many cards each address has answered. */
  answered: Record<string, number>;
  /** The connected wallet, highlighted so the player can find their row. */
  currentAddress?: string | null;
  /** Set once `RoundCompleted` arrives; winners get a trophy. */
  winners?: string[] | null;
  /** Resolves an address to a display label (e.g. a username). */
  displayName?: (address: string) => string;
}

const shortAddress = (address: string) =>
  address.length > 12
    ? `${address.slice(0, 5)}…${address.slice(-4)}`
    : address;

/**
 * Live multiplayer scoreboard (LF-195).
 *
 * Presentational only: the game screen feeds it the player list and the
 * per-player score/progress totals it reduces from `AnswerSubmitted` events,
 * so this component can be reused by the final results view.
 */
export default function RoundScoreboard({
  players,
  scores,
  answered,
  currentAddress = null,
  winners = null,
  displayName = shortAddress,
}: RoundScoreboardProps) {
  const rows = [...players].sort((a, b) => {
    const byScore = (scores[b] ?? 0) - (scores[a] ?? 0);
    return byScore !== 0 ? byScore : a.localeCompare(b);
  });

  return (
    <section
      aria-labelledby="scoreboard-heading"
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 id="scoreboard-heading" className="mb-3 text-lg font-bold">
        Scoreboard
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No players yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="scoreboard">
          {rows.map((player) => {
            const isCurrent = player === currentAddress;
            const isWinner = winners?.includes(player) ?? false;
            return (
              <li
                key={player}
                className={[
                  'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm',
                  isCurrent
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-gray-100',
                ].join(' ')}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isWinner && (
                    <Trophy
                      className="h-4 w-4 shrink-0 text-amber-500"
                      aria-label="winner"
                    />
                  )}
                  <span className="truncate" title={player}>
                    {displayName(player)}
                    {isCurrent ? ' (you)' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4 text-gray-600">
                  <span data-testid={`answered-${player}`}>
                    {answered[player] ?? 0} cards
                  </span>
                  <span
                    className="min-w-[3rem] text-right font-bold text-gray-900"
                    data-testid={`score-${player}`}
                  >
                    {scores[player] ?? 0}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
