'use client';

import { Button } from '@/components/atoms/button';
import { GENRE_VALUES, type Genre } from '@/lib/stellar/types';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { generateInviteCode } from '@/lib/stellar/client';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getGenreDisplayName } from '@/lib/stellar/genres';
import {
  formatAmount,
  LOBBY_PAGE_SIZE,
  WAGER_ASSET_CODE,
} from '@/lib/utils';
import { useOpenRounds, type OpenRound } from '@/hooks/use-open-rounds';
import { useProfileStore } from '@/store/use-profile-store';

const relativeAge = (createdAtSeconds: number | null, nowSeconds: number) => {
  if (createdAtSeconds === null) return 'just now';
  const elapsed = Math.max(0, nowSeconds - createdAtSeconds);
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3600)}h ago`;
};

export default function MultiplayerLobbyPage() {
  const router = useRouter();
  const { systemCalls, account, connect } = useStellar();
  const [genre, setGenre] = useState<Genre>(GENRE_VALUES[0]);
  const [roundId, setRoundId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setError] = useState<string | null>(null);
  const [busyRoundId, setBusyRoundId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const openRounds = useOpenRounds({ systemCalls });
  const profiles = useProfileStore((state) => state.profiles);
  const fetchProfiles = useProfileStore((state) => state.fetchProfiles);

  const displayName = (address: string) =>
    profiles[address]?.username ?? `${address.slice(0, 6)}…`;

  const playerAddresses = useMemo(
    () => openRounds.rounds.flatMap((entry) => entry.players),
    [openRounds.rounds],
  );

  useEffect(() => {
    if (playerAddresses.length > 0) {
      void fetchProfiles(playerAddresses);
    }
  }, [playerAddresses, fetchProfiles]);

  const totalPages = Math.max(
    1,
    Math.ceil(openRounds.rounds.length / LOBBY_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRounds = useMemo(
    () =>
      openRounds.rounds.slice(
        currentPage * LOBBY_PAGE_SIZE,
        currentPage * LOBBY_PAGE_SIZE + LOBBY_PAGE_SIZE,
      ),
    [currentPage, openRounds.rounds],
  );
  const nowSeconds = Math.floor(Date.now() / 1000);

  const handleCreateRound = async () => {
    if (!account) {
      await connect();
      return;
    }

    if (!systemCalls) {
      setError('System calls not initialized');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // LF-305: private rounds carry their invite code in the URL fragment.
      const code = isPrivate ? generateInviteCode() : undefined;
      const id = await systemCalls.createRound(genre, undefined, undefined, code);
      await openRounds.refresh();
      router.push(code ? `/multiplayer/${id}#invite=${code}` : `/multiplayer/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create round');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRound = () => {
    if (!/^\d+$/.test(roundId.trim())) {
      setError('Round ID must be a number');
      return;
    }

    const code = inviteCode.trim();
    router.push(
      code
        ? `/multiplayer/${roundId.trim()}#invite=${encodeURIComponent(code)}`
        : `/multiplayer/${roundId.trim()}`,
    );
  };

  const handleJoinFromList = async (entry: OpenRound) => {
    const id = entry.round.round_id;
    if (!account) {
      await connect();
      return;
    }
    if (!systemCalls) return;

    setBusyRoundId(id.toString());
    setError(null);
    try {
      if (!entry.players.includes(account.address)) {
        await systemCalls.joinRound(id);
      }
      await openRounds.refresh();
      router.push(`/multiplayer/${id.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join round');
    } finally {
      setBusyRoundId(null);
    }
  };

  const handleCancelFromList = async (entry: OpenRound) => {
    if (!systemCalls) return;
    const id = entry.round.round_id;
    setBusyRoundId(id.toString());
    setError(null);
    try {
      await systemCalls.cancelRound(id);
      await openRounds.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel round');
    } finally {
      setBusyRoundId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 mt-16 md:mt-24">
      <button
        onClick={() => router.push('/')}
        className="flex items-center text-gray-600 mb-4 min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </button>

      <h1 className="text-2xl sm:text-3xl font-bold mb-8">Multiplayer Game</h1>

      <div className="max-w-md mx-auto space-y-8">
        {/* Create a new round */}
        <div>
          <h2 className="text-xl font-bold mb-4">Create a round</h2>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value as Genre)}
            className="w-full px-4 py-3 border rounded mb-4 min-h-[44px] text-sm"
          >
            {GENRE_VALUES.map((g) => (
              <option key={g} value={g}>
                {getGenreDisplayName(g)}
              </option>
            ))}
          </select>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            Private (invite link only)
          </label>
          <Button
            onClick={handleCreateRound}
            disabled={isLoading}
            className="w-full min-h-[44px]"
          >
            {isLoading
              ? 'Creating…'
              : account
                ? 'Create Round'
                : 'Connect wallet to create'}
          </Button>
        </div>

        {/* Join an existing round */}
        <div>
          <h2 className="text-xl font-bold mb-4">Join with a round ID</h2>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Round ID"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="Enter Round ID"
            className="w-full px-4 py-3 border rounded mb-4 min-h-[44px] text-sm"
          />
          <input
            type="text"
            aria-label="Invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Invite code (private rounds)"
            className="w-full px-4 py-3 border rounded mb-4 min-h-[44px] text-sm"
          />
          <Button
            onClick={handleJoinRound}
            disabled={!roundId}
            className="w-full min-h-[44px]"
          >
            Join Round
          </Button>
        </div>
      </div>

      {/* Open rounds */}
      <section className="mx-auto mt-12 max-w-3xl" aria-labelledby="open-rounds-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="open-rounds-heading" className="text-xl font-bold">
            Open rounds
          </h2>
          <button
            onClick={() => void openRounds.refresh()}
            className="text-sm text-purple-600 underline"
          >
            Refresh
          </button>
        </div>

        {openRounds.isLoading && (
          <p className="text-gray-500">Loading open rounds…</p>
        )}

        {!openRounds.isLoading && openRounds.rounds.length === 0 && (
          <p className="text-gray-500">
            No open rounds right now. Create one to get started.
          </p>
        )}

        {openRounds.rounds.length > 0 && (
          <>
            <ul className="space-y-3" data-testid="open-rounds-list">
              {visibleRounds.map((entry) => {
                const id = entry.round.round_id.toString();
                const isOwner = entry.round.admin === account?.address;
                const isPlayer = !!account && entry.players.includes(account.address);
                const isBusy = busyRoundId === id;

                return (
                  <li
                    key={id}
                    className="flex flex-col gap-2 rounded border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm">
                      <p className="font-semibold">
                        Round {id} ·{' '}
                        {getGenreDisplayName(entry.round.genre)}
                      </p>
                      <p className="text-gray-500">
                        {entry.playerCount}/{entry.maxPlayers} players ·{' '}
                        {formatAmount(entry.round.wager_amount)}{' '}
                        {WAGER_ASSET_CODE} ·{' '}
                        {relativeAge(entry.createdAtSeconds, nowSeconds)}
                      </p>
                      {entry.players.length > 0 && (
                        <p className="text-gray-500">
                          {entry.players.map(displayName).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isOwner && (
                        <Button
                          onClick={() => void handleCancelFromList(entry)}
                          disabled={isBusy}
                          className="min-h-[44px]"
                        >
                          {isBusy ? 'Cancelling…' : 'Cancel'}
                        </Button>
                      )}
                      <Button
                        onClick={() => void handleJoinFromList(entry)}
                        disabled={isBusy}
                        className="min-h-[44px]"
                      >
                        {isBusy
                          ? 'Joining…'
                          : isPlayer
                            ? 'Open'
                            : 'Join'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                <button
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  disabled={currentPage === 0}
                  className="disabled:opacity-40"
                >
                  Previous
                </button>
                <span aria-live="polite">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages - 1, prev + 1))
                  }
                  disabled={currentPage >= totalPages - 1}
                  className="disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {openRounds.error && (
          <p className="mt-4 text-sm text-red-500">{openRounds.error}</p>
        )}
      </section>

      {errorState && <p className="text-red-500 mt-4 text-center">{errorState}</p>}
    </div>
  );
}
