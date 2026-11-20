import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import jwtConfig from './authConfig/jwt.config';

/**
 * LF-202: the refresh token only ever travels in this HttpOnly cookie, so
 * page scripts (and any XSS) can't read it. Scoped to the auth routes, which
 * are the only ones that need it.
 */
export const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    // Matches the refresh token's own lifetime.
    maxAge: jwtConfig().refreshttl * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * CSRF guard for cookie-authenticated mutations. Browsers only send a custom
 * header from scripts, and a cross-origin script can't pass the CORS
 * preflight unless its origin is allowed, so a forged form post or link
 * can't use the cookie.
 */
export function assertCsrfHeader(req: Request) {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    throw new ForbiddenException('Missing X-Requested-With header');
  }
}
