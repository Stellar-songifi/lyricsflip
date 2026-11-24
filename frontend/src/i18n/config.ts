/** Locales the app ships, in order. */
export const locales = ['en', 'fr'] as const;

export type Locale = (typeof locales)[number];

/** Locale used when the visitor has no `NEXT_LOCALE` cookie. */
export const defaultLocale: Locale = 'en';

/** Name of the cookie the locale switcher persists the choice to. */
export const localeCookieName = 'NEXT_LOCALE';

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}
