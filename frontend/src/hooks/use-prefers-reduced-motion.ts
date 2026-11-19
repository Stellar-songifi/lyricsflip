'use client';

import { useEffect, useState } from 'react';

/**
 * Reactive wrapper around the `prefers-reduced-motion: reduce` media query.
 * Returns `true` when the user has asked for less motion (LF-311), so callers
 * can swap animations for crossfades and skip purely decorative effects.
 *
 * Safe during SSR (returns `false`) and in jsdom (which stubs `matchMedia`).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    // `addEventListener` is the modern API; `addListener` covers old Safari.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  return reduced;
}
