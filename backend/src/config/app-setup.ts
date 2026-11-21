import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

/**
 * Global HTTP pipeline shared by main.ts and the e2e tests, so tests
 * exercise exactly the same validation and error format as production.
 *
 * All REST routes are served under the `/api/v1` prefix (URI versioning),
 * while `/health` remains at the root for probes and reverse proxies.
 */
export function configureApp(app: INestApplication): INestApplication {
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
  return app;
}