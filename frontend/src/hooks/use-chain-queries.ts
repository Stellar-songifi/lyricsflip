import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import {
  queryKeys,
  type Round,
  type PlayerStats,
  type OpenRound,
  type CardsCount,
} from '@/lib/react-query';

/**
 * Player stats as surfaced to the UI.
 *
 * `rounds_won` only counts multiplayer wins (solo rounds are excluded on-chain),
 * while solo activity is reported separately via `solo_rounds_completed` and
 * `solo_best_score` so the stats panel can render them independently.
 */
export type PlayerStatsView = PlayerStats & {
  solo_rounds_completed: number;
  solo_best_score: number;
};

/**
 * Shape of the read/mutation functions exposed by `systemCalls`.
 * Kept intentionally loose so the hooks work with the existing client.
 */
export interface ChainSystemCalls {
  getRound: (id: number | string) => Promise<Round>;
  getPlayerStats: (address: string) => Promise<PlayerStats>;
  getOpenRounds: () => Promise<OpenRound[]>;
  getCardsCount: () => Promise<CardsCount>;
  joinRound: (id: number | string) => Promise<unknown>;
  createRound: (params?: unknown) => Promise<unknown>;
}

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, Error, TData, readonly unknown[]>,
  'queryKey' | 'queryFn'
>;

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>;

/**
 * Resolve the contract ID and system calls from the Stellar context.
 */
function useChainContext() {
  const stellar = useStellar() as {
    systemCalls: ChainSystemCalls;
    contractId?: string;
  };
  const systemCalls = stellar.systemCalls;
  const contractId = stellar.contractId ?? '';
  return { systemCalls, contractId };
}

/* -------------------------------------------------------------------------- */
/*                                  Queries                                   */
/* -------------------------------------------------------------------------- */

export function useRound(
  id: number | string,
  options?: QueryOpts<Round>,
) {
  const { systemCalls, contractId } = useChainContext();

  return useQuery<Round, Error, Round, readonly unknown[]>({
    queryKey: queryKeys.round(contractId, id),
    queryFn: () => systemCalls.getRound(id),
    enabled: id !== undefined && id !== null && id !== '',
    ...options,
  });
}

export function usePlayerStats(
  address: string | undefined,
  options?: QueryOpts<PlayerStatsView>,
) {
  const { systemCalls, contractId } = useChainContext();

  return useQuery<PlayerStatsView, Error, PlayerStatsView, readonly unknown[]>({
    queryKey: queryKeys.playerStats(contractId, address ?? ''),
    queryFn: async () => {
      const stats = await systemCalls.getPlayerStats(address as string);
      return {
        ...stats,
        solo_rounds_completed: stats.solo_rounds_completed ?? 0,
        solo_best_score: stats.solo_best_score ?? 0,
      };
    },
    enabled: Boolean(address),
    ...options,
  });
}

export function useOpenRounds(options?: QueryOpts<OpenRound[]>) {
  const { systemCalls, contractId } = useChainContext();

  return useQuery<OpenRound[], Error, OpenRound[], readonly unknown[]>({
    queryKey: queryKeys.openRounds(contractId),
    queryFn: () => systemCalls.getOpenRounds(),
    ...options,
  });
}

export function useCardsCount(options?: QueryOpts<CardsCount>) {
  const { systemCalls, contractId } = useChainContext();

  return useQuery<CardsCount, Error, CardsCount, readonly unknown[]>({
    queryKey: queryKeys.cardsCount(contractId),
    queryFn: () => systemCalls.getCardsCount(),
    ...options,
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Mutations                                  */
/* -------------------------------------------------------------------------- */

export function useJoinRound(
  options?: MutationOpts<unknown, number | string>,
) {
  const { systemCalls, contractId } = useChainContext();
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, number | string>({
    mutationFn: (id) => systemCalls.joinRound(id),
    onSuccess: (data, id, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.round(contractId, id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.openRounds(contractId),
      });
      options?.onSuccess?.(data, id, context);
    },
    ...options,
  });
}

export function useCreateRound(
  options?: MutationOpts<unknown, unknown>,
) {
  const { systemCalls, contractId } = useChainContext();
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, unknown>({
    mutationFn: (params) => systemCalls.createRound(params),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.openRounds(contractId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.cardsCount(contractId),
      });
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
}