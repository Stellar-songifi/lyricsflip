import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './app-logger.service';
import { RequestLoggerMiddleware } from './request-logger.middleware';

@Global()
@Module({
  providers: [
    {
      provide: AppLogger,
      useFactory: (config: ConfigService) =>
        new AppLogger({
          json: config.get<string>('nodeEnv') === 'production',
          level: config.get<string>('LOG_LEVEL') ?? config.get<string>('log.level') ?? 'log',
        }),
      inject: [ConfigService],
    },
    RequestLoggerMiddleware,
  ],
  exports: [AppLogger, RequestLoggerMiddleware],
})
export class LoggerModule {}
