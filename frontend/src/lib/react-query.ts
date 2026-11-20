import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

/**
 * Query key factories for chain reads.
 *
 * Every key includes the contract ID so that data from different contract
 * deployments is cached independently and invalidated correctly.
 */
export const queryKeys = {
  all: ['chain'] as const,

  rounds: (contractId: string) => [...queryKeys.all, contractId, 'rounds'] as const,
  round: (contractId: string, id: string | number | bigint) =>
    [...queryKeys.rounds(contractId), String(id)] as const,

  openRounds: (contractId: string) => [...queryKeys.all, contractId, 'openRounds'] as const,

  playerStats: (contractId: string, addr: string) =>
    [...queryKeys.all, contractId, 'playerStats', addr] as const,

  cardsCount: (contractId: string) => [...queryKeys.all, contractId, 'cardsCount'] as const,
};

export type QueryKeys = typeof queryKeys;