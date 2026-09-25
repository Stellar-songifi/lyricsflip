import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AppLogger } from './app-logger.service';
import { runWithRequestContext } from './request-context';
import { redactUrl } from './redact';

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Assigns each request an id (reusing a well-formed incoming `x-request-id`),
 * echoes it on the response, and writes exactly one access log line when the
 * response finishes. Bodies and headers are never logged.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.get(REQUEST_ID_HEADER);
    const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const start = process.hrtime.bigint();

    res.setHeader(REQUEST_ID_HEADER, requestId);

    let logged = false;
    const logOnce = () => {
      if (logged) return;
      logged = true;
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      runWithRequestContext({ requestId }, () =>
        this.logger.info(
          'request completed',
          {
            method: req.method,
            url: redactUrl(req.originalUrl),
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            contentLength: res.get('content-length'),
            ip: req.ip,
            userAgent: req.get('user-agent'),
            aborted: !res.writableFinished,
          },
          'HTTP',
        ),
      );
    };
    res.once('finish', logOnce);
    res.once('close', logOnce);

    runWithRequestContext({ requestId }, next);
  }
}
