import { getRequestConfig } from 'next-intl/server';

// Server-side request config for next-intl (app router). The locale comes
// from the middleware (pathname prefix or the `NEXT_LOCALE` cookie); we fall
// back to the default locale so the app always renders in a valid locale.
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) || 'en';
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
