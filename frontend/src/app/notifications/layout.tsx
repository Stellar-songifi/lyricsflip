import type { ReactNode } from 'react';
import { RequireAccount } from '@/components/providers/require-account';

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return <RequireAccount>{children}</RequireAccount>;
}
