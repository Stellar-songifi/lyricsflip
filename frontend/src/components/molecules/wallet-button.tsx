'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, LogOut, Wallet } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useXlmBalance } from '@/lib/stellar/hooks/useXlmBalance';
import { cn } from '@/lib/utils';

/** `GABCDEFG…WXYZ` -> `GABC…XYZ` */
export const truncateAddress = (address: string) =>
  address.length > 10 ? `${address.slice(0, 4)}…${address.slice(-3)}` : address;

export function WalletButton({ className }: { className?: string }) {
  const { account, connect, disconnect, isLoading } = useStellar();
  const { formatted: balance } = useXlmBalance();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const buttonClass =
    'flex py-2 px-3 items-center gap-2 rounded border border-[#DBE2E8] dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-interv text-[12px] leading-[20px]';

  if (!account?.address) {
    return (
      <button
        onClick={() => connect()}
        disabled={isLoading}
        className={cn(buttonClass, 'text-purplePrimary5 disabled:opacity-50', className)}
      >
        <Wallet className="h-4 w-4" />
        Connect wallet
      </button>
    );
  }

  const address = account.address;
  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={menuRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(buttonClass, 'text-[#909090] dark:text-gray-400')}
      >
        <Wallet className="h-4 w-4" />
        <span title={address}>{truncateAddress(address)}</span>
        {balance !== null && (
          <span className="text-purplePrimary5 font-medium">{balance} XLM</span>
        )}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded border border-[#DBE2E8] dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-50 py-1 text-sm"
        >
          <button
            role="menuitem"
            onClick={copyAddress}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
