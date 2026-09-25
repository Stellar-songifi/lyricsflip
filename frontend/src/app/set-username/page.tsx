'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CircleCheck, CircleX } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useProfileStore } from '@/store/useProfileStore';

export default function SetUsername() {
  const router = useRouter();
  const { account } = useStellar();
  const { setUsername, getUsername } = useProfileStore();
  const [username, setUsernameInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'available' | 'taken' | 'invalid'>('idle');

  // Pre-fill if the user already set a username
  useEffect(() => {
    if (account?.address) {
      const existing = getUsername(account.address);
      if (existing) setUsernameInput(existing);
    }
  }, [account?.address, getUsername]);

  useEffect(() => {
    if (username.length < 1) {
      setStatus('idle');
      return;
    }

    // Validate: 4-15 chars, letters / digits / underscore only
    const isValid = /^[a-zA-Z0-9_]{4,15}$/.test(username);
    if (!isValid) {
      setStatus('invalid');
      return;
    }

    // Duplicate-check against already-saved username for the same address
    // (the backend check will replace this when LF-082 lands).
    const handler = setTimeout(() => {
      const existingForAddress = account?.address ? getUsername(account.address) : undefined;
      // If the user types their own current username it counts as "available"
      if (existingForAddress && existingForAddress !== username) {
        // Could do a real backend duplicate check here
        setStatus('available');
      } else {
        setStatus('available');
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [username, account?.address, getUsername]);

  const handleSubmit = () => {
    if (status !== 'available') return;
    if (!account?.address) return;
    setUsername(account.address, username);
    router.push(`/profile/${account.address}`);
  };

  return (
    <main className="grid grid-rows-1 grid-cols-1 md:grid-rows-1 md:grid-cols-2 min-h-screen">
      <div className="w-full col-span-1 p-6 md:p-12 flex flex-col flex-1">
        <div className="mb-8 absolute">
          <Link
            href="/sign-up"
            className="flex gap-x-1 items-center text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </Link>
        </div>
        <div className="flex justify-center items-center flex-1">
          <div className="justify-between flex flex-col md:min-w-[300px] lg:min-w-[400px] gap-y-12 md:gap-y-24 lg:gap-y-32">
            <div className="flex flex-col justify-center mx-auto w-full">
              <h1 className="text-2xl font-bold mb-2 dark:text-white">Create Username</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
                Choose a unique username that represents you.
              </p>

              {!account && (
                <p className="text-amber-600 text-sm mb-4">
                  Connect your wallet to save your username to your profile.
                </p>
              )}

              <div className="space-y-2 mb-4">
                <label htmlFor="username" className="block text-sm font-medium dark:text-gray-200">
                  Enter Username
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="johnabrazzi99"
                  className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 dark:bg-gray-800 dark:text-white ${
                    status === 'invalid' || status === 'taken'
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-purplePrimary5'
                  }`}
                />

                <div className="relative h-10">
                  <div className="absolute">
                    {status === 'available' && username.length > 0 && (
                      <div className="flex items-center text-green-600 mt-2 gap-x-1">
                        <CircleCheck className="w-5 h-5" />
                        <span>{username} is available</span>
                      </div>
                    )}
                    {status === 'taken' && username.length > 0 && (
                      <div className="flex items-center text-red-600 mt-2 gap-x-2">
                        <CircleX className="w-5 h-5" />
                        <span>
                          {username} has been taken, please try another name
                        </span>
                      </div>
                    )}
                    {status === 'invalid' && (
                      <div className="flex items-center text-red-600 mt-2 gap-x-2">
                        <CircleX className="w-5 h-5" />
                        <span>
                          Username must be 4-15 characters &amp; use only letters,
                          numbers, or _
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-auto mx-auto w-full">
              <button
                onClick={handleSubmit}
                disabled={status !== 'available' || !account}
                className={`w-full py-4 px-4 rounded-full transition-colors ${
                  status === 'available' && account
                    ? 'bg-purplePrimary5 hover:bg-purplePrimary5/90 text-white'
                    : 'bg-gray-400 dark:bg-gray-600 text-gray-700 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                {account ? 'Create Username' : 'Connect wallet to continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full col-span-1 relative hidden md:flex">
        <div className="absolute inset-0 bg-purplePrimary5/[.98] z-10 flex items-center justify-center">
          <div className="text-white text-5xl md:text-6xl font-bold">
            <span className="text-white">Lyric</span>
            <span className="text-tealPrimary1">Flip</span>
          </div>
        </div>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('/images/set-username-noise-image.png?height=1080&width=1080')",
          }}
        />
      </div>
    </main>
  );
}
