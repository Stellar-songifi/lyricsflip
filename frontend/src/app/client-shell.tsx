'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import Navbar, { MobileNav } from '@/components/molecules/navbar';
import { WalletStatusBanner } from '@/components/molecules/wallet-status-banner';
import { queryClient } from '@/lib/react-query';

const EngineLoading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <h2 className="text-xl font-semibold mb-2">Loading Game Engine...</h2>
      <p className="text-gray-500">Please wait while we initialize the game</p>
    </div>
  </div>
);

const DynamicStellarProvider = dynamic(
  () =>
    import('@/lib/stellar/stellar-provider').then((mod) => mod.StellarProvider),
  { ssr: false, loading: EngineLoading },
);

/**
 * Defers mounting the wallet/SDK provider until after the first client render so
 * the Stellar SDK and Wallets Kit are never part of the initial route bundle.
 */
function DeferredStellarProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <EngineLoading />;

  return <DynamicStellarProvider>{children}</DynamicStellarProvider>;
}

/**
 * Client-side app chrome: React Query, the Stellar wallet provider, and the
 * navigation shell. Kept out of the root layout so that layout can stay a
 * server component (it loads translations via next-intl).
 */
export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <DeferredStellarProvider>
        <Navbar />
        {/* WalletStatusBanner sits below the navbar so it is visible on every route */}
        <WalletStatusBanner />
        {/* pb-20 on mobile so the fixed MobileNav bar never overlaps content; md:pb-0 restores normal flow on desktop */}
        <main className="pb-20 md:pb-0">{children}</main>
        <MobileNav />
      </DeferredStellarProvider>
    </QueryClientProvider>
  );
}
