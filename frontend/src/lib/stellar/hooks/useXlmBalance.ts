'use client';

import { useQuery } from '@tanstack/react-query';
import { formatAmount } from '@/lib/utils';
import { useStellar } from './useStellar';

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

interface HorizonBalance {
  asset_type: string;
  balance: string;
}

/** Convert a Horizon decimal balance (e.g. "12.5000000") to stroops. */
const toStroops = (balance: string): bigint => {
  const [whole, fraction = ''] = balance.split('.');
  return BigInt(whole + fraction.padEnd(7, '0').slice(0, 7));
};

/**
 * Fetches the connected account's native XLM balance from Horizon.
 * Unfunded accounts (Horizon 404) report a zero balance.
 */
export function useXlmBalance() {
  const { account } = useStellar();
  const address = account?.address;

  const query = useQuery({
    queryKey: ['xlm-balance', address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<bigint> => {
      const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
      if (res.status === 404) return BigInt(0);
      if (!res.ok) throw new Error(`Horizon request failed (${res.status})`);
      const { balances } = (await res.json()) as { balances: HorizonBalance[] };
      const native = balances.find((b) => b.asset_type === 'native');
      return native ? toStroops(native.balance) : BigInt(0);
    },
  });

  return {
    ...query,
    formatted: query.data !== undefined ? formatAmount(query.data) : null,
  };
}
