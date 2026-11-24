'use client';

import { Eye, Trophy, Clock } from 'lucide-react';
import { useSpectatorRoom } from '@/hooks/use-spectator-room';
import type { Player } from '@/types/realtime';

interface SpectatorViewProps {
  roundId: string;
}

function ScoreRow({
  player,
  rank,
  highlight,
}: {
  player: Player;
  rank: number;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`border-b last:border-0 ${highlight ? 'bg-yellow-50' : 'hover:bg-gray-50'} transition-colors`}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-500 w-8">
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
      </td>
      <td className="px-4 py-3 text-sm font-medium truncate max-w-[180px]">
        {player.name}
      </td>
      <td className="px-4 py-3 text-sm font-bold text-right">
        {player.score}
      </td>
    </tr>
  );
}

/**
 * Read-only spectator view for a live multiplayer round.
 * Shows the live scoreboard, cards-answered counter, and the final reveal
 * once the round ends. Never exposes answers or song options.
 */
export function SpectatorView({ roundId }: SpectatorViewProps) {
  const {
    scores,
    cardsAnswered,
    isFinalized,
    finalScores,
    timeLeft,
    isConnected,
    error,
  } = useSpectatorRoom(roundId);

  const sorted = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Spectator badge */}
      <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded-full px-4 py-2 w-fit">
        <Eye className="h-4 w-4" aria-hidden="true" />
        <span>Watching as spectator</span>
        <span
          className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-400'}`}
          title={isConnected ? 'Connected' : 'Reconnecting…'}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-purple-500" aria-hidden="true" />
          <div>
            <p className="text-xs text-gray-500">Time Left</p>
            <p className="text-lg font-bold">{timeLeft}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-yellow-500" aria-hidden="true" />
          <div>
            <p className="text-xs text-gray-500">Cards Answered</p>
            <p className="text-lg font-bold">{cardsAnswered}</p>
          </div>
        </div>
      </div>

      {/* Live scoreboard */}
      {!isFinalized && sorted.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-2">Live Scoreboard</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((player, idx) => (
                  <ScoreRow
                    key={player.id}
                    player={player}
                    rank={idx + 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Final reveal – only shown after round_ended */}
      {isFinalized && finalScores && (
        <section>
          <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" aria-hidden="true" />
            Final Results
          </h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {finalScores.map((player, idx) => (
                  <ScoreRow
                    key={player.id}
                    player={player}
                    rank={idx + 1}
                    highlight={idx === 0}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!isConnected && !error && (
        <p className="text-xs text-gray-400 text-center">Reconnecting to game server…</p>
      )}
    </div>
  );
}
