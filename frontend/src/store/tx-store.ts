/**
 * LF-314 · Transaction store (Zustand)
 *
 * Tracks every submitted Stellar/Soroban transaction from the moment it is
 * signed through to a final success or permanent failure.  The navbar tray
 * reads from this store to list recent transactions with explorer links.
 *
 * Shape of a tracked transaction:
 *   hash        – transaction hash on-chain (may be absent before submission)
 *   label       – short human-readable description ("Join round #42")
 *   status      – 'pending' | 'success' | 'failed' | 'retrying'
 *   submittedAt – Unix timestamp (ms)
 *   error       – last error message, if any
 *   attempts    – how many times we have tried to submit
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TxStatus = 'pending' | 'success' | 'failed' | 'retrying';

export interface TxRecord {
  /** Unique id — the transaction hash once known, otherwise a client-side UUID. */
  id: string;
  /** On-chain transaction hash (may be undefined while pending). */
  hash?: string;
  /** Short label shown in the tray ("Join round #42"). */
  label: string;
  status: TxStatus;
  submittedAt: number;
  updatedAt: number;
  error?: string;
  attempts: number;
}

interface TxState {
  transactions: TxRecord[];
}

interface TxActions {
  /** Register a new transaction. Returns the generated id. */
  addTx: (label: string, hash?: string) => string;
  /** Update an existing transaction by id. */
  updateTx: (id: string, patch: Partial<Omit<TxRecord, 'id'>>) => void;
  /** Remove a single transaction from the tray. */
  removeTx: (id: string) => void;
  /** Remove all terminal (success / failed) transactions. */
  clearFinished: () => void;
}

export type TxStore = TxState & TxActions;

function generateId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useTxStore = create<TxStore>()(
  persist(
    (set) => ({
      transactions: [],

      addTx: (label, hash) => {
        const id = hash ?? generateId();
        const record: TxRecord = {
          id,
          hash,
          label,
          status: 'pending',
          submittedAt: Date.now(),
          updatedAt: Date.now(),
          attempts: 1,
        };
        set((state) => ({
          transactions: [record, ...state.transactions].slice(0, 50),
        }));
        return id;
      },

      updateTx: (id, patch) =>
        set((state) => ({
          transactions: state.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...patch, updatedAt: Date.now() } : tx,
          ),
        })),

      removeTx: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((tx) => tx.id !== id),
        })),

      clearFinished: () =>
        set((state) => ({
          transactions: state.transactions.filter(
            (tx) => tx.status === 'pending' || tx.status === 'retrying',
          ),
        })),
    }),
    {
      name: 'lyricsflip-tx-store',
      // Keep at most the last 20 transactions between page loads.
      partialize: (state) => ({
        transactions: state.transactions.slice(0, 20),
      }),
    },
  ),
);
