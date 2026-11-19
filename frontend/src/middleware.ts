import { NextRequest } from 'next/server';
import { createMiddleware } from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

// next-intl middleware: resolves the locale from the `NEXT_LOCALE` cookie
// (the user's language switcher writes it) and syncs it into the response
// cookie so the choice persists across visits.
export default function middleware(request: NextRequest) {
  return createMiddleware(routing)(request);
}
