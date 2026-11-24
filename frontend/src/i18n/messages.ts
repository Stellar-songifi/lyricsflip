import enMessages from '../../messages/en.json';
import frMessages from '../../messages/fr.json';
import type { Locale } from './config';

export type Messages = typeof enMessages;

/**
 * Messages for a locale. `messages/{en,fr}.json` live at the frontend root
 * (next-intl's default location) so the CI check can diff their keys.
 */
export function getMessagesForLocale(locale: Locale): Messages {
  return locale === 'fr' ? frMessages : enMessages;
}
