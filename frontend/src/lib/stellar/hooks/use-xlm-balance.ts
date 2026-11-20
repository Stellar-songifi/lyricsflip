'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { env } from '@/env';
import { formatAmount } from '@/lib/utils';
import { useStellar } from './use-stellar';

const HORIZON_URL = env.NEXT_PUBLIC_STELLAR_HORIZON_URL;

const FRIENDBOT_URL =
  process.env.NEXT_PUBLIC_STELLAR_FRIENDBOT_URL ||
  'https://friendbot.stellar.org';

/**
 * Minimum XLM balance required to submit a transaction, in stroops.
 * Stellar base reserve is 0.5 XLM per entry; a freshly-funded account
 * holds 1 XLM (2 base reserves). We reserve 0.1 XLM (1_000_000 stroops)
 * as a comfortable minimum for fees and the base reserve.
 */
export const MIN_FEE_STROOPS = BigInt(1_000_000); // 0.1 XLM

/**
 * Testnet passphrase — Friendbot is only available on testnet and futurenet.
 */
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const FUTURENET_PASSPHRASE = 'Test SDF Future Network ; October 2022';

const isTestnet = (passphrase: string): boolean =>
  passphrase === TESTNET_PASSPHRASE || passphrase === FUTURENET_PASSPHRASE;

interface HorizonBalance {
  asset_type: string;
  balance: string;
}

/** Convert a Horizon decimal balance (e.g. "12.5000000") to stroops. */
const toStroops = (balance: string): bigint => {
  const [whole, fraction = ''] = balance.split('.');
  return BigInt(whole + fraction.padEnd(7, '0').slice(0, 7));
};

export interface XlmBalanceResult {
  /** Native XLM balance in stroops, or undefined while loading. */
  balance: bigint | undefined;
  /** True when the account does not exist on-chain (Horizon 404). */
  isUnfunded: boolean;
  /** True when the balance is below MIN_FEE_STROOPS. */
  isBelowMinFee: boolean;
  /** True when balance < required (fee + stake). */
  isBelowRequired: (required: bigint) => boolean;
  /** Human-readable formatted balance string (e.g. "1.5"). */
  formatted: string | null;
  /** True while the balance is being fetched. */
  isLoading: boolean;
  /** Any fetch error. */
  error: Error | null;
  /** Whether the connected network supports Friendbot. */
  isTestnet: boolean;
  /** Call to fund the account via Friendbot (testnet only). */
  fundWithFriendbot: () => Promise<void>;
  /** True while Friendbot funding is in progress. */
  isFunding: boolean;
  /** Error from Friendbot call, if any. */
  fundingError: string | null;
  /** Force refetch the balance (e.g. after Friendbot funding). */
  refetch: () => void;
}

/**
 * Fetches the connected account's native XLM balance from Horizon.
 * Also detects unfunded accounts (Horizon 404) and exposes a Friendbot
 * funding helper for testnet wallets.
 */
export function useXlmBalance(): XlmBalanceResult {
  const { account } = useStellar();
  const address = account?.address;
  const [isFunding, setIsFunding] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);

  // Determine if we're on a testnet-like network
  const networkPassphrase = env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;
  const onTestnet = isTestnet(networkPassphrase);

  const query = useQuery({
    queryKey: ['xlm-balance', address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ balance: bigint; isUnfunded: boolean }> => {
      const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
      if (res.status === 404) {
        return { balance: BigInt(0), isUnfunded: true };
      }
      if (!res.ok) {
        throw new Error(`Horizon request failed (${res.status})`);
      }
      const { balances } = (await res.json()) as { balances: HorizonBalance[] };
      const native = balances.find((b) => b.asset_type === 'native');
      const balance = native ? toStroops(native.balance) : BigInt(0);
      return { balance, isUnfunded: false };
    },
  });

  const balance = query.data?.balance;
  const isUnfunded = query.data?.isUnfunded ?? false;
  const isBelowMinFee =
    balance !== undefined && !isUnfunded && balance < MIN_FEE_STROOPS;

  const isBelowRequired = useCallback(
    (required: bigint): boolean => {
      if (balance === undefined) return false;
      return balance < required;
    },
    [balance],
  );

  const fundWithFriendbot = useCallback(async () => {
    if (!address || !onTestnet) return;
    setIsFunding(true);
    setFundingError(null);
    try {
      const res = await fetch(
        `${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Friendbot failed (${res.status})${body ? `: ${body}` : ''}`,
        );
      }
      // Refetch balance after funding
      await query.refetch();
    } catch (err) {
      setFundingError(
        err instanceof Error ? err.message : 'Friendbot funding failed.',
      );
    } finally {
      setIsFunding(false);
    }
  }, [address, onTestnet, query]);

  return {
    balance,
    isUnfunded,
    isBelowMinFee,
    isBelowRequired,
    formatted: balance !== undefined ? formatAmount(balance) : null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    isTestnet: onTestnet,
    fundWithFriendbot,
    isFunding,
    fundingError,
    refetch: query.refetch,
  };
}
