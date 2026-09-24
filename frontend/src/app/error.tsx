'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0F0518] p-4">
      <div className="w-full max-w-md rounded-xl border border-[#2A1538] bg-[#1A0B24] p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#9747FF]">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">
          This round hit a bad note
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          {error.message || 'An unexpected error stopped this page from rendering.'}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="purple" size="full" onClick={reset}>
            Try again
          </Button>
          <Button variant="outline" size="full" asChild>
            <Link href="/">Back to game</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
