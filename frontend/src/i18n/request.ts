import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import en from '../../messages/en.json';

export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** Cookie a future language switcher can set to pick the UI locale. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

type Messages = { [key: string]: string | Messages };

/** Fill keys missing from a partial translation with the English strings. */
function withFallback(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    out[key] =
      typeof value === 'object' && typeof baseValue === 'object'
        ? withFallback(baseValue, value)
        : value;
  }
  return out;
}

export default getRequestConfig(async () => {
  const requested = cookies().get(LOCALE_COOKIE)?.value;
  const locale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : defaultLocale;

  const messages =
    locale === defaultLocale
      ? en
      : withFallback(
          en,
          (await import(`../../messages/${locale}.json`)).default,
        );

  return { locale, messages };
});
