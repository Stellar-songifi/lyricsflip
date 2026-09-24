import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Single HTTP logging/timing interceptor. Replaces the former
 * `http-logging` and `performance` interceptors, which duplicated this.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const start = process.hrtime.bigint();
    const elapsed = () =>
      (Number(process.hrtime.bigint() - start) / 1e6).toFixed(2);

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          this.logger.log(
            `${method} ${url} ${response.statusCode} ${elapsed()}ms`,
          );
        },
        error: (error) => {
          this.logger.error(
            `${method} ${url} ${error?.status ?? 500} ${elapsed()}ms`,
            error?.stack,
          );
        },
      }),
    );
  }
}
