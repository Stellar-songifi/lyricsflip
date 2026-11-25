import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export const DEFAULT_DEV_CORS_ORIGIN = 'http://localhost:3000';

interface CorsPolicyOptions {
  credentials: boolean;
  nodeEnv?: string;
}

/**
 * Normalizes configured CORS origins and enforces credential-safe rules.
 *
 * LF-359: `credentials: true` is incompatible with a wildcard origin — browsers
 * refuse the response and it would expose cookie-authenticated endpoints to
 * every site. Production always requires an explicit allowlist.
 */
export function resolveCorsOrigins(
  configured: string | string[] | undefined,
  options: CorsPolicyOptions,
): string[] {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const raw = Array.isArray(configured)
    ? configured
    : typeof configured === 'string'
      ? configured.split(',')
      : [];

  const origins = [
    ...new Set(raw.map((origin) => origin.trim()).filter(Boolean)),
  ];

  if (origins.length === 0) {
    if (nodeEnv === 'production') {
      throw new Error(
        'CORS_ORIGINS must list explicit allowed origins in production',
      );
    }
    return [DEFAULT_DEV_CORS_ORIGIN];
  }

  if (origins.includes('*')) {
    if (options.credentials || nodeEnv === 'production') {
      throw new Error(
        'CORS_ORIGINS must not be "*" when credentials are enabled; list explicit allowed origins',
      );
    }
    return ['*'];
  }

  return origins;
}

export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
): boolean {
  if (!origin) return true; // non-browser/server-to-server requests
  return allowed.includes(origin);
}

/**
 * Applies the shared CORS policy to the HTTP app. An Origin that isn't on the
 * allowlist is refused before the handler runs, so a credentialed request from
 * an unlisted site can't reach any route.
 */
export function configureCors(
  app: INestApplication,
  config: Pick<ConfigService, 'get'>,
): string[] {
  const origins = resolveCorsOrigins(
    config.get<string | string[]>('cors.origin'),
    {
      credentials: true,
      nodeEnv: config.get<string>('nodeEnv') ?? process.env.NODE_ENV,
    },
  );

  app.use((req, res, next) => {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin, origins)) {
      res.status(403).json({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Origin not allowed',
      });
      return;
    }
    next();
  });

  app.enableCors({ origin: origins, credentials: true });

  return origins;
}
