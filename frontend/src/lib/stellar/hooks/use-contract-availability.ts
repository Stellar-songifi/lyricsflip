'use client';

/**
 * LF-365: detect a Stellar testnet reset from the browser.
 *
 * A reset wipes every contract instance, so the IDs baked into a preview keep
 * producing an opaque "contract not found". Reading the instance entry with
 * `getLedgerEntries` tells us directly whether the deployed contract is gone.
 */

import { useCallback, useEffect, useState } from 'react';
import { Address, StrKey, rpc, xdr } from '@stellar/stellar-sdk';
import { createConfig } from '../stellar-config';

/** Only testnet is periodically wiped; local/mainnet IDs are stable. */
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/** How often to re-check while a preview stays open (LF-365). */
export const AVAILABILITY_POLL_MS = 5 * 60 * 1000;

export interface ContractAvailabilityResult {
  /** True when at least one recorded testnet instance no longer exists. */
  isTestnetReset: boolean;
  /** Recorded contract IDs whose instance entry is missing. */
  missingContracts: string[];
  isLoading: boolean;
  /** Re-run the check immediately (e.g. after a recovery deploy). */
  refresh: () => void;
}

/** Ledger key for a contract's `ContractInstance` entry. */
export function contractInstanceKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

/**
 * Batched instance lookup for the given IDs. An RPC error is propagated so
 * callers can keep quiet rather than reporting a reset they could not verify.
 */
export async function findMissingContracts(
  contractIds: string[],
  rpcUrl: string,
): Promise<string[]> {
  if (contractIds.length === 0) return [];

  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const keys = contractIds.map(contractInstanceKey);
  const { entries } = await server.getLedgerEntries(...keys);
  const presentKeys = new Set(entries.map((entry) => entry.key.toXDR('base64')));

  return contractIds.filter((_, index) => !presentKeys.has(keys[index].toXDR('base64')));
}

export function useContractAvailability(
  pollMs: number = AVAILABILITY_POLL_MS,
): ContractAvailabilityResult {
  const [missingContracts, setMissingContracts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => setRefreshNonce((nonce) => nonce + 1), []);

  useEffect(() => {
    const config = createConfig();

    // Only testnet gets reset; don't hit RPC for local/mainnet deployments or
    // for placeholder IDs (the config error screen handles those).
    const isTestnet = config.networkPassphrase === TESTNET_PASSPHRASE;
    const contractIds = isTestnet
      ? [config.lyricsflipContractId, config.lyricsflipNftContractId].filter(
          (id) => id && StrKey.isValidContract(id),
        )
      : [];

    if (contractIds.length === 0) {
      setMissingContracts([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const check = async () => {
      try {
        const missing = await findMissingContracts(contractIds, config.rpcUrl);
        if (!cancelled) setMissingContracts(missing);
      } catch {
        // RPC outage / malformed response: never claim a reset we can't prove.
        if (!cancelled) setMissingContracts([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs, refreshNonce]);

  return {
    isTestnetReset: missingContracts.length > 0,
    missingContracts,
    isLoading,
    refresh,
  };
}
