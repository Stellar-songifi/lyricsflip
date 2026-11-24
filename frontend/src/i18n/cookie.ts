import { cookies } from 'next/headers';
import { localeCookieName, defaultLocale, isLocale, type Locale } from './config';

/**
 * Reads the visitor's locale: the `NEXT_LOCALE` cookie set by the locale
 * switcher, falling back to the default locale when absent or unknown.
 */
export async function getCurrentLocale(): Promise<Locale> {
  let value: string | undefined;
  try {
    value = (await cookies().get(localeCookieName))?.value;
  } catch {
    // Outside a request context (e.g. static prerendering); use the default.
    value = undefined;
  }
  return isLocale(value) ? value : defaultLocale;
}

/**
 * Sets the `NEXT_LOCALE` cookie. Persists the locale choice made through the
 * locale switcher; the page reloads so the new locale takes effect.
 */
export function setLocaleCookie(locale: Locale): string {
  return `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=${
    60 * 60 * 24 * 365
  }; SameSite=Lax`;
}
