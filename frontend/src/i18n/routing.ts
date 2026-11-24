// next-intl routing configuration for LyricsFlip (issue #896).
//
// - Two locales: `en` (default) and `fr`.
// - `localePrefix: 'never'` keeps the user-facing URLs unchanged
//   (`/`, `/single-player`, …); the locale is resolved from the
//   `NEXT_LOCALE` cookie by the middleware instead.

export const localeCookieName = 'NEXT_LOCALE';

export const routing = {
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  localePrefix: 'never',
  localeCookie: {
    name: localeCookieName,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
} as const;
