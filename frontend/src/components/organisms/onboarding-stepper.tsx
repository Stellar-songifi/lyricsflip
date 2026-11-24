'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Circle, LoaderCircle } from 'lucide-react';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import {
  MIN_FEE_STROOPS,
  useXlmBalance,
} from '@/lib/stellar/hooks/use-xlm-balance';
import { useProfileStore } from '@/store/use-profile-store';
import { env } from '@/env';

const TUTORIAL_KEY_PREFIX = 'lyricsflip:onboarding:tutorial:';
const FUNNEL_COUNTS_KEY = 'lyricsflip:onboarding:funnel';

type FunnelStep =
  | 'wallet_connected'
  | 'funded'
  | 'funding_skipped'
  | 'username_set'
  | 'tutorial_started';

function trackFunnelStep(step: FunnelStep) {
  if (typeof window === 'undefined') return;

  const sessionKey = `lyricsflip:onboarding:tracked:${step}`;
  try {
    if (window.sessionStorage.getItem(sessionKey)) return;
    window.sessionStorage.setItem(sessionKey, '1');

    const raw = window.localStorage.getItem(FUNNEL_COUNTS_KEY);
    const counts = raw ? (JSON.parse(raw) as Partial<Record<FunnelStep, number>>) : {};
    counts[step] = (counts[step] ?? 0) + 1;
    window.localStorage.setItem(FUNNEL_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // Local counting is optional and must not block onboarding if storage is unavailable.
  }

  void fetch(`${env.NEXT_PUBLIC_API_URL}/analytics/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
    credentials: 'omit',
    keepalive: true,
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`Onboarding analytics returned ${response.status}.`);
      }
    })
    .catch((error: unknown) => {
      console.warn('Could not record onboarding analytics.', error);
    });
}

export function OnboardingStepper({
  onPlayTutorial,
}: {
  onPlayTutorial: () => void;
}) {
  const router = useRouter();
  const { account, isAuthenticated } = useStellar();
  const balance = useXlmBalance();
  const username = useProfileStore((state) =>
    account?.address ? state.getUsername(account.address) : undefined,
  );
  const [tutorialCompleted, setTutorialCompleted] = useState(false);

  useEffect(() => {
    if (!account?.address) {
      setTutorialCompleted(false);
      return;
    }

    try {
      setTutorialCompleted(
        window.localStorage.getItem(
          `${TUTORIAL_KEY_PREFIX}${account.address}`,
        ) === '1',
      );
    } catch {
      setTutorialCompleted(false);
    }
  }, [account?.address]);

  const funded = !balance.isTestnet ||
    (balance.balance !== undefined && balance.balance >= MIN_FEE_STROOPS);
  const steps = useMemo(
    () => [
      { id: 'connect', title: 'Connect your wallet', done: !!account?.address },
      { id: 'fund', title: 'Fund your testnet wallet', done: funded },
      { id: 'username', title: 'Choose a username', done: !!username },
      { id: 'tutorial', title: 'Play your first round', done: tutorialCompleted },
    ],
    [account?.address, funded, tutorialCompleted, username],
  );
  const completedCount = steps.filter((step) => step.done).length;
  const canFund = steps[0].done;
  const canSetUsername = canFund && steps[1].done;
  const canStartTutorial = canSetUsername && steps[2].done;
  const activeStep = steps.find((step) => !step.done)?.id;

  useEffect(() => {
    if (account?.address) trackFunnelStep('wallet_connected');
    if (funded && account?.address && balance.isTestnet) {
      trackFunnelStep('funded');
    } else if (account?.address && !balance.isTestnet) {
      trackFunnelStep('funding_skipped');
    }
    if (username) trackFunnelStep('username_set');
    if (tutorialCompleted) trackFunnelStep('tutorial_started');
  }, [account?.address, balance.isTestnet, funded, tutorialCompleted, username]);

  if (completedCount === steps.length) return null;

  const startUsername = () => {
    if (!account?.address) {
      void router.push('/sign-in?next=%2F');
    } else if (isAuthenticated) {
      void router.push('/set-username?next=%2F');
    } else {
      void router.push('/sign-in?next=%2F');
    }
  };

  const startTutorial = () => {
    onPlayTutorial();
    setTutorialCompleted(true);
    if (account?.address) {
      try {
        window.localStorage.setItem(
          `${TUTORIAL_KEY_PREFIX}${account.address}`,
          '1',
        );
      } catch {
        // The game can still start when local storage is unavailable.
      }
    }
  };

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="mb-8 rounded-2xl border border-purple-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">
            Your first game
          </p>
          <h2 id="onboarding-heading" className="mt-1 text-xl font-bold">
            Get started with LyricsFlip
          </h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {completedCount} of {steps.length} steps complete
        </p>
      </div>

      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={step.id === activeStep ? 'step' : undefined}
            className={`rounded-xl border p-4 ${
              step.done
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-600" aria-hidden="true">
                {step.done ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">
                  {index + 1}. {step.title}
                </h3>
                {step.id === 'connect' && !step.done && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Connect a Stellar wallet to play on-chain.
                  </p>
                )}
                {step.id === 'fund' && !step.done && (
                  <>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Testnet XLM covers transaction fees. No real funds are used.
                    </p>
                    {balance.fundingError && (
                      <p role="alert" className="mt-2 text-sm text-red-600">
                        {balance.fundingError}
                      </p>
                    )}
                    {balance.error && (
                      <p role="alert" className="mt-2 text-sm text-red-600">
                        Could not load the wallet balance: {balance.error.message}
                      </p>
                    )}
                  </>
                )}
                {step.id === 'fund' && step.done && !balance.isTestnet && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Friendbot is testnet-only, so this step is skipped on your network.
                  </p>
                )}
                {step.id === 'username' && !step.done && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Sign in with your wallet, then choose your player name.
                  </p>
                )}
                {step.id === 'tutorial' && !step.done && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Read the lyric clue, choose the matching title, artist, or
                    year before the timer ends, then check your score.
                  </p>
                )}

                {!step.done && step.id === 'connect' && (
                  <Link
                    href="/sign-in?next=%2F"
                    className="mt-3 inline-flex rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    Connect wallet
                  </Link>
                )}
                {!step.done && step.id === 'fund' && canFund && account?.address && (
                  <button
                    type="button"
                    onClick={() => void balance.fundWithFriendbot()}
                    disabled={balance.isFunding || balance.isLoading || !balance.isTestnet}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {balance.isFunding && (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    )}
                    {balance.isFunding ? 'Funding…' : 'Fund with Friendbot'}
                  </button>
                )}
                {!step.done && step.id === 'username' && canSetUsername && (
                  <button
                    type="button"
                    onClick={startUsername}
                    className="mt-3 inline-flex rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    {account?.address && isAuthenticated
                      ? 'Choose username'
                      : 'Sign in with wallet'}
                  </button>
                )}
                {!step.done && step.id === 'tutorial' && canStartTutorial && (
                  <button
                    type="button"
                    onClick={startTutorial}
                    className="mt-3 inline-flex rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    Start your first round
                  </button>
                )}
                {step.done && (
                  <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                    Complete
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
