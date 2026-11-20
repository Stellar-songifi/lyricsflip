"use client";
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { useProfileStore } from '@/store/use-profile-store';

/** Only same-site paths are allowed as `next`, never an external URL. */
const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

/**
 * LF-204: the single auth entry point. Connect wallet -> sign the backend
 * challenge (LF-228, done by `connect()`) -> pick a username on first login
 * only -> continue to `next`. See docs/architecture.md, "Sign-in flow".
 */
function SignInFlow() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { account, connect, error, isAuthenticated, authError } = useStellar();
  const getUsername = useProfileStore((state) => state.getUsername);

  // Once signed in, send first-time users to pick a username; returning
  // users (or a session restored from the refresh cookie) skip that step.
  useEffect(() => {
    if (!account?.address || !isAuthenticated) return;
    router.replace(
      getUsername(account.address)
        ? next
        : `/set-username?next=${encodeURIComponent(next)}`,
    );
  }, [account?.address, isAuthenticated, getUsername, next, router]);

  const needsSignature = !!account?.address && !isAuthenticated;

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
            {needsSignature ? 'Sign in with your wallet' : 'Connect Stellar Wallet'}
          </button>
          {(authError ?? error) && (
            <p className="mt-4 text-center text-sm text-red-500">
              {(authError ?? error)?.message}
            </p>
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

export default function SignInPage() {
  return (
    <Suspense>
      <SignInFlow />
    </Suspense>
  );
}
