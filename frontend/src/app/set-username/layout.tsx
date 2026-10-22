import { Suspense, type ReactNode } from 'react';
import { RequireAccount } from '@/components/providers/require-account';

export default function SetUsernameLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <RequireAccount allowMissingUsername>{children}</RequireAccount>
    </Suspense>
  );
}
