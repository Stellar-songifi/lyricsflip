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

  configureApp(app);

  const corsOrigin = config.get<string>('cors.origin') ?? '*';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useWebSocketAdapter(new SocketIOAdapter(app, config));

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);
  }

  const port = config.get<number>('port') ?? process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}

bootstrap();
