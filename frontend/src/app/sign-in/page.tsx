"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import { useProfileStore } from '@/store/useProfileStore';

export default function SignInPage() {
  const router = useRouter();
  const { account, connect, error } = useStellar();
  const getUsername = useProfileStore((state) => state.getUsername);

  // Once a wallet is connected, send first-time users to pick a username.
  useEffect(() => {
    if (!account?.address) return;
    router.replace(getUsername(account.address) ? '/' : '/set-username');
  }, [account?.address, getUsername, router]);

  return (
    <div className="flex h-screen">
      {/* Left Column - Sign In */}
      <div className=" bg-white flex w-full flex-col justify-center px-8 md:w-1/2 md:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-[#090909] text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            Have fun guessing the lyrics to your favourite song
          </h1>
          <p className="text-[#121212] mt-4 text-sm text-muted-foreground md:text-base">
            You could have fun, wager against yourself or wager against friends
            and earn while you are at it.
          </p>

        <div className="mt-8 w-full mx-auto">
          <button
            onClick={() => connect()}
            className="mt-8 w-full cursor-pointer rounded-full bg-purple-600 py-6 text-white hover:bg-purple-700"
          >
            Connect Stellar Wallet
          </button>
          {error && (
            <p className="mt-4 text-center text-sm text-red-500">{error.message}</p>
          )}
        </div>
        </div>
      </div>

      {/* Right Column - Brand */}
      <div className="hidden bg-purple-600 md:flex md:w-1/2 md:flex-col md:items-center md:justify-center">
        <div className="text-4xl font-bold md:text-5xl lg:text-6xl">
          <span className="text-white">Lyric</span>
          <span className="text-cyan-300">Flip</span>
        </div>
      </div>
    </div>
  );
}
