'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStellar } from '@/lib/stellar/hooks/use-stellar';
import { useProfileStore } from '@/store/use-profile-store';

interface RequireAccountProps {
  children: ReactNode;
  /** Set on `/set-username` itself, which is reached before a username exists. */
  allowMissingUsername?: boolean;
}

/**
 * LF-204: guards routes that need an account. Sends visitors without a
 * connected wallet, a backend session, or (unless allowed) a username to
 * `/sign-in?next=<path>`, which walks them through the missing steps.
 * See docs/architecture.md, "Sign-in flow".
 */
export function RequireAccount({ children, allowMissingUsername }: RequireAccountProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { account, isLoading, isAuthenticated, isSessionChecked } = useStellar();
  const getUsername = useProfileStore((state) => state.getUsername);

  const address = account?.address;
  const isReady = !isLoading && (isSessionChecked || isAuthenticated);
  const hasAccount =
    !!address && isAuthenticated && (allowMissingUsername || !!getUsername(address));

  useEffect(() => {
    if (isReady && !hasAccount) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [isReady, hasAccount, pathname, router]);

  return isReady && hasAccount ? <>{children}</> : null;
}
