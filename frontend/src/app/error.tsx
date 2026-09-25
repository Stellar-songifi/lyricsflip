'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[LyricsFlip Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image
            src="/Logo.svg"
            alt="LyricsFlip"
            width={126}
            height={42}
            priority
            className="object-contain"
          />
        </div>

        {/* Error illustration */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-purple-100 flex items-center justify-center">
            <span className="text-5xl" role="img" aria-label="broken record">
              🎵
            </span>
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Something went wrong
          </h1>
          <p className="text-gray-500 text-sm">
            The game skipped a beat. An unexpected error occurred while loading
            this page.
          </p>
          {error?.digest && (
            <p className="text-xs text-gray-400 font-mono mt-1">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[#9747FF] text-white font-medium rounded-lg hover:bg-[#8030e0] transition-colors min-h-[44px]"
          >
            Try again
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 border border-[#DBE2E8] text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
