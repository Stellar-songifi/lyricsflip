'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { createConfig } from '@/lib/stellar/stellar-config';
import { WAGER_ASSET_CODE, formatAmount } from '@/lib/utils';
import { toast } from 'sonner';
import { Trophy, Coins, CheckCircle2 } from 'lucide-react';
import { env } from '@/env';

export interface UnclaimedWinningItem {
  roundId: string;
  wagerAmount: string;
  potentialWinnings: string;
  asset?: string;
  status?: string;
}

const STORAGE_PREFIX = 'lyricsflip_unclaimed_rounds_';

/**
 * Utility to register an unclaimed round in local storage so it immediately
 * appears on the profile page even if the backend indexer is lagging or offline.
 */
export function recordUnclaimedRound(
  address: string,
  round: {
    roundId: string | number | bigint;
    wagerAmount: string | number | bigint;
    potentialWinnings?: string | number | bigint;
  },
) {
  if (typeof window === 'undefined' || !address) return;
  try {
    const key = `${STORAGE_PREFIX}${address}`;
    const raw = localStorage.getItem(key);
    const existing: UnclaimedWinningItem[] = raw ? JSON.parse(raw) : [];

    const idStr = round.roundId.toString();
    if (existing.some((r) => r.roundId === idStr)) return;

    const wagerStr =
      typeof round.wagerAmount === 'bigint'
        ? formatAmount(round.wagerAmount)
        : round.wagerAmount.toString();

    const winningsStr = round.potentialWinnings
      ? typeof round.potentialWinnings === 'bigint'
        ? formatAmount(round.potentialWinnings)
        : round.potentialWinnings.toString()
      : (parseFloat(wagerStr) * 2).toString();

    existing.push({
      roundId: idStr,
      wagerAmount: wagerStr,
      potentialWinnings: winningsStr,
      asset: WAGER_ASSET_CODE,
      status: 'won',
    });

    localStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    console.warn('Failed to record unclaimed round locally:', err);
  }
}

/**
 * Removes an unclaimed round from local storage after successful claim.
 */
export function removeUnclaimedRound(address: string, roundId: string | number | bigint) {
  if (typeof window === 'undefined' || !address) return;
  try {
    const key = `${STORAGE_PREFIX}${address}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const existing: UnclaimedWinningItem[] = JSON.parse(raw);
    const idStr = roundId.toString();
    const updated = existing.filter((r) => r.roundId !== idStr);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to remove claimed round from storage:', err);
  }
}

interface UnclaimedWinningsProps {
  address?: string;
  className?: string;
  initialItems?: UnclaimedWinningItem[];
}

export const UnclaimedWinnings: React.FC<UnclaimedWinningsProps> = ({
  address,
  className = '',
  initialItems,
}) => {
  const { systemCalls } = useStellar();
  const [items, setItems] = useState<UnclaimedWinningItem[]>(initialItems ?? []);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUnclaimedWinnings = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    const merged = new Map<string, UnclaimedWinningItem>();

    // 1. Fetch from localStorage first (local/offline cache)
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${address}`);
        if (raw) {
          const stored: UnclaimedWinningItem[] = JSON.parse(raw);
          for (const item of stored) {
            merged.set(item.roundId, item);
          }
        }
      } catch (err) {
        console.warn('Error reading stored unclaimed rounds:', err);
      }
    }

    // 2. Query indexer / backend API if available
    try {
      const apiBase = env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiBase}/wagers/player/${encodeURIComponent(address)}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        const wagers = Array.isArray(data) ? data : data?.data ?? [];
        for (const w of wagers) {
          // Look for won wagers that haven't been claimed yet
          if (w.status === 'won' || (w.status === 'escrowed' && w.isWinner)) {
            const wagerAmt = typeof w.amount === 'string' ? w.amount : formatAmount(w.amount);
            merged.set(w.roundId.toString(), {
              roundId: w.roundId.toString(),
              wagerAmount: wagerAmt,
              potentialWinnings: (parseFloat(wagerAmt) * 2).toString(),
              asset: w.asset === 'native' ? WAGER_ASSET_CODE : w.asset ?? WAGER_ASSET_CODE,
              status: w.status,
            });
          }
        }
      }
    } catch {
      // Backend indexer offline / unreachable: continue with contract views / local data
    }

    setItems(Array.from(merged.values()));
    setIsLoading(false);
  }, [address]);

  useEffect(() => {
    if (initialItems !== undefined) {
      setItems(initialItems);
      return;
    }
    fetchUnclaimedWinnings();
  }, [address, fetchUnclaimedWinnings, initialItems]);

  const handleClaim = async (roundId: string) => {
    if (!systemCalls) {
      toast.error('System calls not initialized. Please connect your wallet.');
      return;
    }

    setClaimingId(roundId);
    const toastId = toast.loading(`Claiming winnings for Round #${roundId}…`);

    try {
      const payout = await systemCalls.claimWinnings(BigInt(roundId));
      // Add to claimed set so the button immediately disappears
      setClaimedIds((prev) => new Set(prev).add(roundId));

      if (address) {
        removeUnclaimedRound(address, roundId);
      }

      const payoutStr =
        payout !== undefined && payout !== null
          ? `${typeof payout === 'bigint' ? formatAmount(payout) : payout} ${WAGER_ASSET_CODE}`
          : '';

      toast.success(
        `Winnings claimed for Round #${roundId}! ${payoutStr}`.trim(),
        { id: toastId },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to claim winnings';
      toast.error(msg, { id: toastId });
    } finally {
      setClaimingId(null);
    }
  };

  // LF-303: no claim UI until escrow wagering is enabled.
  if (!address || !createConfig().wageringEnabled) return null;

  return (
    <section
      aria-label="Unclaimed winnings"
      className={`mb-8 ${className}`}
      data-testid="unclaimed-winnings-section"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#9747FF]" />
          Unclaimed Winnings
        </h2>
        {items.length > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full">
            {items.length} Claimable
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-gray-100 rounded-xl h-20 w-full"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-red-600 text-sm mb-4">
          {error}
        </p>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
          <Coins className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">No unclaimed winnings</p>
          <p className="text-xs text-gray-500 mt-1">
            Win wagered games to earn and claim crypto prizes.
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => {
            const isClaimed = claimedIds.has(item.roundId);
            const isCurrentlyClaiming = claimingId === item.roundId;

            return (
              <div
                key={item.roundId}
                data-testid={`unclaimed-round-${item.roundId}`}
                className="flex items-center justify-between p-4 bg-white border border-purple-100 rounded-xl shadow-sm hover:border-purple-200 transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-900">
                    Round #{item.roundId}
                  </span>
                  <span className="text-xs text-gray-500">
                    Wager: {item.wagerAmount} {item.asset || WAGER_ASSET_CODE}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-xs text-gray-500 block">Prize</span>
                    <span className="text-sm font-bold text-[#9747FF]">
                      +{item.potentialWinnings} {item.asset || WAGER_ASSET_CODE}
                    </span>
                  </div>

                  {/* Acceptance criteria: button disappears once the claim succeeds */}
                  {!isClaimed ? (
                    <button
                      onClick={() => handleClaim(item.roundId)}
                      disabled={isCurrentlyClaiming}
                      data-testid={`claim-button-${item.roundId}`}
                      className="cursor-pointer px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-purple-600"
                    >
                      {isCurrentlyClaiming ? 'Claiming…' : 'Claim'}
                    </button>
                  ) : (
                    <div
                      data-testid={`claimed-status-${item.roundId}`}
                      className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Claimed
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default UnclaimedWinnings;
