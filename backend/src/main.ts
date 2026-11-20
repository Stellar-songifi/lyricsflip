import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { swaggerConfig, swaggerCustomOptions } from './utility/Swagger';
import { SocketIOAdapter } from './config/socket-io.config';
import { Logger } from '@nestjs/common';
import { AppLogger } from './logger/app-logger.service';
import { configureApp } from './config/app-setup';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLogger));

  const config = app.get(ConfigService);
  const logger = new Logger('Main');

  // configureApp applies the global prefix ('api') with URI versioning
  // (routes resolve to /api/v1/...), excluding /health. Do not set the
  // prefix elsewhere to avoid duplicate/conflicting configuration.
  configureApp(app);

  const corsOrigin =
    config.get<string | string[]>('cors.origin') ?? 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // WebSocket adapter is unaffected by the HTTP global prefix.
  app.useWebSocketAdapter(new SocketIOAdapter(app, config));

  if (process.env.NODE_ENV !== 'production') {
    // Swagger is served outside the versioned API surface at /api/docs.
    // The generated document reflects the versioned routes (/api/v1/...).
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);
  }

  const port = config.get<number>('port') ?? process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}

bootstrap();