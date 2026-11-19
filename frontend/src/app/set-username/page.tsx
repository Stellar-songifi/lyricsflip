'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function SetUsername() {
  const t = useTranslations('auth');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'available' | 'taken' | 'invalid'
  >('idle');

  useEffect(() => {
    if (username.length < 1) {
      setStatus('idle');
      return;
    }

    // Check for invalid characters or short length
    const isValid = /^[a-zA-Z0-9_]{4,15}$/.test(username);
    if (!isValid) {
      setStatus('invalid');
      return;
    }

    const handler = setTimeout(() => {
      if (username.toLowerCase() === 'thevaxxo') {
        setStatus('taken');
      } else {
        setStatus('available');
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [username]);

  return (
    <main className="grid grid-rows-1 grid-cols-1 md:grid-rows-1 md:grid-cols-2 min-h-screen">
      <div className="w-full col-span-1 p-6 md:p-12 flex flex-col flex-1">
        <div className="mb-8 absolute">
          <Link
            href="/sign-up"
            className="flex gap-x-1 items-center text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            {t('back')}
          </Link>
        </div>
        <div className="flex justify-center items-center flex-1">
          <div className="justify-between flex flex-col md:min-w-[300px] lg:min-w-[400px] gap-y-12 md:gap-y-24 lg:gap-y-32">
            <div className="flex flex-col justify-center mx-auto w-full">
              <h1 className="text-2xl font-bold mb-2">{t('createUsername')}</h1>
              <p className="text-gray-600 mb-6 text-sm">
                {t('chooseUsername')}
              </p>

              <div className="space-y-2 mb-4">
                <label htmlFor="username" className="block text-sm font-medium">
                  {t('enterUsername')}
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johnabrazzi99"
                  className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 ${
                    status === 'invalid' || status === 'taken'
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:ring-purplePrimary5'
                  }`}
                />

                <div className="relative h-10">
                  <div className="absolute">
                    {status === 'available' && username.length > 0 && (
                      <div className="flex items-center text-green-600 mt-2 gap-x-1">
                        <CircleCheck className="w-5 h-5" />

                        <span>{t('usernameAvailable', { username })}</span>
                      </div>
                    )}
                    {status === 'taken' && username.length > 0 && (
                      <div className="flex items-center text-red-600 mt-2 gap-x-2">
                        <CircleX className="w-5 h-5" />
                        <span>
                          {t('usernameTaken', { username })}
                        </span>
                      </div>
                    )}
                    {status === 'invalid' && (
                      <div className="flex items-center text-red-600 mt-2 gap-x-2">
                        <CircleX className="w-5 h-5" />
                        <span>
                          {t('usernameInvalid')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-auto mx-auto w-full">
              <button
                disabled={status !== 'available'}
                className={`w-full py-4 px-4 rounded-full transition-colors ${
                  status === 'available'
                    ? 'bg-purplePrimary5 hover:bg-purplePrimary5/90 text-white'
                    : 'bg-gray-400 text-gray-700 cursor-not-allowed'
                }`}
              >
                {t('createUsername')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full col-span-1 relative hidden md:flex">
        <div className="absolute inset-0 bg-purplePrimary5/[.98] z-10 flex items-center justify-center">
          <div className="text-white text-5xl md:text-6xl font-bold">
            <span className="text-white">{t('brandLyric')}</span>
            <span className="text-tealPrimary1">{t('brandFlip')}</span>
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
