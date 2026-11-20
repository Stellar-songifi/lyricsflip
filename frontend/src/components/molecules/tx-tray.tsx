'use client';

/**
 * LF-314 · Transaction tray
 *
 * A compact dropdown anchored to the navbar that lists recent transactions
 * tracked by the tx-store (Zustand).  Each row shows:
 *   - A status badge (pending spinner / green tick / orange retry / red ✕)
 *   - The transaction label
 *   - A "View" link to stellar.expert when a hash is available
 *   - A relative timestamp
 *
 * The tray is opened/closed by clicking the bell-like button added to the
 * desktop navbar.  On mobile it renders inside the bottom-nav area.
 */

import { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';
import { useTxStore, type TxRecord, type TxStatus } from '@/store/tx-store';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer';
const NETWORK =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ===
  'Public Global Stellar Network ; September 2015'
    ? 'public'
    : 'testnet';

function explorerUrl(hash: string): string {
  return `${STELLAR_EXPERT_BASE}/${NETWORK}/tx/${hash}`;
}

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: TxStatus }) {
  switch (status) {
    case 'pending':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />;
    case 'retrying':
      return <RefreshCw className="h-4 w-4 animate-spin text-amber-500 flex-shrink-0" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} m ago`;
  return `${Math.floor(diff / 3_600_000)} h ago`;
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------

function TxRow({ tx }: { tx: TxRecord }) {
  return (
    <li className="flex items-start gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-lg">
      <div className="mt-0.5">
        <StatusIcon status={tx.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{tx.label}</p>
        {tx.error && tx.status === 'failed' && (
          <p className="text-xs text-red-500 mt-0.5 truncate">{tx.error}</p>
        )}
        {tx.status === 'retrying' && tx.error && (
          <p className="text-xs text-amber-500 mt-0.5 truncate">{tx.error}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {relativeTime(tx.submittedAt)}
          {tx.attempts > 1 && (
            <span className="ml-1 text-amber-500">
              attempt {tx.attempts}
            </span>
          )}
        </p>
      </div>
      {tx.hash && (
        <a
          href={explorerUrl(tx.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-600 hover:underline flex-shrink-0 mt-0.5"
          aria-label="View on Stellar Explorer"
        >
          View
        </a>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tray panel
// ---------------------------------------------------------------------------

function TxTrayPanel({ onClose }: { onClose: () => void }) {
  const { transactions, clearFinished } = useTxStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const pending = transactions.filter(
    (tx) => tx.status === 'pending' || tx.status === 'retrying',
  );
  const finished = transactions.filter(
    (tx) => tx.status === 'success' || tx.status === 'failed',
  );

  return (
    <div
      ref={panelRef}
      className="
        absolute right-0 top-full mt-2 z-50
        w-80 max-w-[calc(100vw-1rem)]
        bg-white border border-gray-200 rounded-xl shadow-lg
        overflow-hidden
      "
      role="dialog"
      aria-label="Transaction history"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Transactions</h2>
        {finished.length > 0 && (
          <button
            onClick={clearFinished}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear finished
          </button>
        )}
      </div>

      {transactions.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          No transactions yet
        </p>
      ) : (
        <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50 py-1">
          {pending.length > 0 && (
            <>
              <li className="px-3 pt-2 pb-1">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  In progress
                </span>
              </li>
              {pending.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </>
          )}
          {finished.length > 0 && (
            <>
              <li className="px-3 pt-2 pb-1">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Recent
                </span>
              </li>
              {finished.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger button
// ---------------------------------------------------------------------------

/**
 * The trigger button that shows how many transactions are currently in-flight
 * and opens the tray panel.
 */
export function TxTrayTrigger() {
  const [open, setOpen] = useState(false);
  const { transactions } = useTxStore();

  const inFlight = transactions.filter(
    (tx) => tx.status === 'pending' || tx.status === 'retrying',
  ).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open transaction history"
        aria-expanded={open}
        className="
          relative flex h-10 w-10 items-center justify-center rounded
          border border-[#DBE2E8] bg-white
          hover:bg-gray-50 transition-colors min-h-[44px] min-w-[44px]
        "
      >
        {/* Stack icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7h18M3 12h18M3 17h18"
          />
        </svg>
        {inFlight > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
            {inFlight > 9 ? '9+' : inFlight}
          </span>
        )}
      </button>

      {open && <TxTrayPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
