'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * ThemeProvider applies the stored theme class to `<html>` on mount and
 * whenever the theme changes. Mounting this inside the body (after SSR)
 * prevents a flash of the wrong theme: the inline script in `<head>` handles
 * the very first paint; this component keeps it in sync during client
 * navigation.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
