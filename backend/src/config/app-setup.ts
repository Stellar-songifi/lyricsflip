import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

/**
 * Global HTTP pipeline shared by main.ts and the e2e tests, so tests
 * exercise exactly the same validation and error format as production.
 */
export function configureApp(app: INestApplication): INestApplication {
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
