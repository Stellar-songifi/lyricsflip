import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { AppLogger } from '../logger/app-logger.service';

/**
 * Global HTTP pipeline shared by main.ts and the e2e tests, so tests
 * exercise exactly the same validation and error format as production.
 *
 * All REST routes are served under the `/api/v1` prefix (URI versioning),
 * while `/health` remains at the root for probes and reverse proxies.
 *
 * LF-349: LoggingInterceptor is applied globally here so every handler emits
 * structured `request received` / `request handled` entries that carry
 * round_id, address, and tx_hash alongside the request id.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Security headers for the API surface. CSP is disabled because this is a
  // JSON API (Swagger is served separately in non-production) and the default
  // CSP would block legitimate API consumers without providing value here.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Structured per-route logging: stamps round_id / address / tx_hash on
  // every handler entry and exit, within the AsyncLocalStorage request
  // context set by RequestLoggerMiddleware (applied in AppModule).
  const appLogger = app.get(AppLogger);
  app.useGlobalInterceptors(new LoggingInterceptor(appLogger));

  return app;
}
