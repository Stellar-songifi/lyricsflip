import Link from 'next/link';
import { Button } from '@/components/atoms/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0F0518] p-4">
      <div className="w-full max-w-md rounded-xl border border-[#2A1538] bg-[#1A0B24] p-8 text-center">
        <p className="text-6xl font-black text-[#9747FF]">404</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Track not found</h1>
        <p className="mt-2 text-sm text-gray-400">
          This page doesn&apos;t exist or was moved. Let&apos;s get you back to
          the music.
        </p>
        <Button variant="purple" size="full" className="mt-6" asChild>
          <Link href="/">Back to game</Link>
        </Button>
      </div>
    </main>
  );
}
