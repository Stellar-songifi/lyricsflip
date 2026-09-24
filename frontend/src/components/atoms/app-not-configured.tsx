'use client';

import Link from 'next/link';
import { Button } from '@/components/atoms/button';

export default function AppNotConfigured({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0F0518] p-4">
      <div className="w-full max-w-md rounded-xl border border-[#2A1538] bg-[#1A0B24] p-8 text-center">
        <h1 className="text-2xl font-bold text-white">App is not configured</h1>
        <p className="mt-2 text-sm text-gray-400">
          LyricsFlip needs the following environment variables before it can
          talk to the chain:
        </p>
        <ul className="mt-4 space-y-2 rounded-lg bg-black/30 p-4 text-left">
          {missing.map((name) => (
            <li key={name} className="font-mono text-xs text-amber-300">
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500">
          Set them in <span className="font-mono">.env.local</span> (see{' '}
          <span className="font-mono">.env.example</span>) and restart the app.
        </p>
        <Button variant="purple" size="full" className="mt-6" asChild>
          <Link href="/">Retry</Link>
        </Button>
      </div>
    </main>
  );
}
