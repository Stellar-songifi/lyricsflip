'use client';

import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Users } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { GENRE_VALUES, type Genre } from '@/lib/stellar/types';
import { Button } from '@/components/atoms/button';
import { useOpenRounds, type OpenRound } from '@/hooks/use-open-rounds';

const PAGE_SIZE = 10;

function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function RoundRow({
  item,
  onJoin,
}: {
  item: OpenRound;
  onJoin: (id: bigint) => void;
}) {
  const { round, secondsLeft, playerCount } = item;
  const isExpiringSoon = secondsLeft < 60;

  return (
    <tr className="border-b last:border-0 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-mono text-gray-700">
        {round.round_id.toString()}
      </td>
      <td className="px-4 py-3 text-sm">{round.genre}</td>
      <td className="px-4 py-3 text-sm">
        {round.wager_amount > 0n ? (
          <span className="font-medium">{round.wager_amount.toString()} XLM</span>
        ) : (
          <span className="text-gray-400">Free</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-gray-400" />
          {playerCount}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-mono truncate max-w-[120px] text-gray-500">
        {`${round.admin.slice(0, 6)}…${round.admin.slice(-4)}`}
      </td>
      <td
        className={`px-4 py-3 text-sm font-medium ${
          isExpiringSoon ? 'text-red-500' : 'text-gray-700'
        }`}
      >
        {formatTimeLeft(secondsLeft)}
      </td>
      <td className="px-4 py-3">
        <Button
          onClick={() => onJoin(round.round_id)}
          className="text-xs px-3 py-1 h-auto"
        >
          Join
        </Button>
      </td>
    </tr>
  );
}

export default function MultiplayerLobbyPage() {
  const router = useRouter();
  const { systemCalls, account, connect } = useStellar();

  // ── Create round ──────────────────────────────────────────────────────────
  const [genre, setGenre] = useState<Genre>(GENRE_VALUES[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateRound = async () => {
    if (!account) {
      await connect();
      return;
    }
    if (!systemCalls) {
      setCreateError('System calls not initialized');
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const id = await systemCalls.createRound(genre);
      router.push(`/multiplayer/${id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create round');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Join by ID ─────────────────────────────────────────────────────────────
  const [roundId, setRoundId] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoinById = () => {
    if (!/^\d+$/.test(roundId.trim())) {
      setJoinError('Round ID must be a number');
      return;
    }
    router.push(`/multiplayer/${roundId.trim()}`);
  };

  // ── Lobby browser ──────────────────────────────────────────────────────────
  const { rounds, isLoading, error: browseError, refresh } = useOpenRounds();
  const [filterGenre, setFilterGenre] = useState<Genre | 'All'>('All');
  const [filterWager, setFilterWager] = useState<'All' | 'Free' | 'Wager'>('All');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return rounds.filter((item) => {
      if (filterGenre !== 'All' && item.round.genre !== filterGenre) return false;
      if (filterWager === 'Free' && item.round.wager_amount !== 0n) return false;
      if (filterWager === 'Wager' && item.round.wager_amount === 0n) return false;
      return true;
    });
  }, [rounds, filterGenre, filterWager]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterGenreChange = (value: string) => {
    setFilterGenre(value as Genre | 'All');
    setPage(1);
  };

  const handleFilterWagerChange = (value: string) => {
    setFilterWager(value as 'All' | 'Free' | 'Wager');
    setPage(1);
  };

  const handleJoinFromBrowser = (id: bigint) => {
    router.push(`/multiplayer/${id.toString()}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <button
        onClick={() => router.push('/')}
        className="flex items-center text-gray-600 mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </button>
      <h1 className="text-3xl font-bold mb-8">Multiplayer Game</h1>

      <div className="max-w-2xl mx-auto space-y-10">
        {/* ── Create round ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold mb-4">Create multiplayer round</h2>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value as Genre)}
            className="w-full px-4 py-2 border rounded mb-4"
          >
            {GENRE_VALUES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <Button onClick={handleCreateRound} disabled={isCreating} className="w-full">
            {isCreating ? 'Creating…' : account ? 'Create Round' : 'Connect wallet to create'}
          </Button>
          {createError && (
            <p className="text-red-500 text-sm mt-2">{createError}</p>
          )}
        </section>

        {/* ── Join by ID ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold mb-4">Join with a round ID</h2>
          <input
            type="text"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="Enter Round ID"
            className="w-full px-4 py-2 border rounded mb-4"
          />
          <Button onClick={handleJoinById} disabled={!roundId} className="w-full">
            Join Round
          </Button>
          {joinError && (
            <p className="text-red-500 text-sm mt-2">{joinError}</p>
          )}
        </section>

        {/* ── Lobby browser ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Open Rounds</h2>
            <button
              onClick={refresh}
              title="Refresh"
              className="text-gray-500 hover:text-gray-800 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Genre</label>
              <select
                value={filterGenre}
                onChange={(e) => handleFilterGenreChange(e.target.value)}
                className="px-3 py-1.5 border rounded text-sm"
              >
                <option value="All">All genres</option>
                {GENRE_VALUES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Wager</label>
              <select
                value={filterWager}
                onChange={(e) => handleFilterWagerChange(e.target.value)}
                className="px-3 py-1.5 border rounded text-sm"
              >
                <option value="All">All</option>
                <option value="Free">Free</option>
                <option value="Wager">Wager</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : browseError ? (
            <p className="text-sm text-red-500">{browseError}</p>
          ) : paginated.length === 0 ? (
            <p className="text-sm text-gray-500">
              No open rounds match your filters right now.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2">Round ID</th>
                      <th className="px-4 py-2">Genre</th>
                      <th className="px-4 py-2">Wager</th>
                      <th className="px-4 py-2">Players</th>
                      <th className="px-4 py-2">Host</th>
                      <th className="px-4 py-2">Time Left</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((item) => (
                      <RoundRow
                        key={item.round.round_id.toString()}
                        item={item}
                        onJoin={handleJoinFromBrowser}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-3 text-sm">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded border disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 rounded border disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
