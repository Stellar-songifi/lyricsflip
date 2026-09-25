import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service';
import { RequestLoggerMiddleware } from './request-logger.middleware';

@Global()
@Module({
  providers: [{ provide: AppLogger, useValue: new AppLogger() }, RequestLoggerMiddleware],
  exports: [AppLogger, RequestLoggerMiddleware],
})
export class LoggerModule {}
