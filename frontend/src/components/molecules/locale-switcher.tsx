'use client';

import { locales, type Locale } from '@/i18n/config';
import { setLocaleCookie } from '@/i18n/cookie';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/atoms/select';

/**
 * Locale switcher (issue #896): a small select next to the navbar links that
 * persists the choice in the `NEXT_LOCALE` cookie and refreshes the app so
 * the new locale renders.
 */
export function LocaleSwitcher() {
  const t = useTranslations('nav');
  const router = useRouter();
  const locale = useLocale() as Locale;

  const handleChange = (value: string) => {
    const next: Locale = locales.includes(value as Locale) ? (value as Locale) : 'en';
    document.cookie = setLocaleCookie(next);
    router.refresh();
  };

  const localeLabel = (localeValue: Locale) =>
    t(`locales.${localeValue}`);

  return (
    <div className="flex items-center gap-2">
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger className="h-9 w-28 border-[#DBE2E8] bg-white text-[12px] font-normal">
          <SelectValue>{localeLabel(locale)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {locales.map((localeValue) => (
            <SelectItem key={localeValue} value={localeValue}>
              {localeLabel(localeValue)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
