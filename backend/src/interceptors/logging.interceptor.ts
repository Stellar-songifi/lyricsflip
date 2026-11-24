import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';
import { currentRequestId, runWithRequestContext } from '../logger/request-context';
import { redactUrl } from '../logger/redact';

/**
 * LoggingInterceptor (LF-349)
 *
 * Runs on every HTTP handler after the request-id middleware has already set
 * the AsyncLocalStorage context.  Responsibilities:
 *
 *  - Emit a structured `request received` entry at the start of handling
 *    so slow handlers can be correlated with the final access-log line.
 *  - Attach `round_id`, `address`, and `tx_hash` from the route params /
 *    response body when present, so each log line carries the full chain
 *    of identifiers needed to follow a stuck round.
 *  - Re-wrap the context for async handlers that might escape the
 *    middleware's AsyncLocalStorage scope (e.g. deferred Observables).
 *  - Emit `request errored` on unhandled exceptions so the structured
 *    error entry is paired with the inbound request entry.
 *
 * The interceptor intentionally does NOT log request bodies or response
 * payloads — those are either too large or may contain secrets.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startNs = process.hrtime.bigint();

    // The request-id was assigned by RequestLoggerMiddleware; fall back to
    // the response header it set in case this interceptor runs before the
    // middleware (should not happen in production but keeps tests hermetic).
    const requestId =
      currentRequestId() ??
      (res.getHeader?.('x-request-id') as string | undefined);

    // Extract chain-correlation fields from route params and query string.
    const correlFields = extractCorrelFields(req);

    const logInContext = (fn: () => void) => {
      if (requestId) {
        runWithRequestContext({ requestId }, fn);
      } else {
        fn();
      }
    };

    logInContext(() =>
      this.logger.debug('request received', {
        method: req.method,
        url: redactUrl(req.originalUrl),
        ...correlFields,
      }, 'HTTP'),
    );

    return next.handle().pipe(
      tap((body) => {
        const durationMs = durationSince(startNs);
        const responseCorrel = extractBodyCorrelFields(body);
        logInContext(() =>
          this.logger.debug('request handled', {
            method: req.method,
            url: redactUrl(req.originalUrl),
            status: res.statusCode,
            durationMs,
            ...correlFields,
            ...responseCorrel,
          }, 'HTTP'),
        );
      }),
      catchError((err: unknown) => {
        const durationMs = durationSince(startNs);
        logInContext(() =>
          this.logger.error('request errored', {
            method: req.method,
            url: redactUrl(req.originalUrl),
            durationMs,
            ...correlFields,
            error: err instanceof Error ? err.message : String(err),
          }, 'HTTP'),
        );
        return throwError(() => err);
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function durationSince(startNs: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startNs) / 1e4) / 100;
}

/**
 * Pulls `round_id`, `address`, and `tx_hash` from route params and query
 * string.  These are the three chain-correlation identifiers called out in
 * LF-349.  Returns only the keys that are actually present so the log entry
 * stays compact.
 */
function extractCorrelFields(req: Request): Record<string, string> {
  const fields: Record<string, string> = {};
  const params = (req.params ?? {}) as Record<string, string>;
  const query = (req.query ?? {}) as Record<string, string>;

  const pick = (src: Record<string, string>, key: string, outKey: string) => {
    const v = src[key];
    if (v && typeof v === 'string') fields[outKey] = v;
  };

  // Route params: /rounds/:roundId, /rounds/:id, /game-session/:id ...
  pick(params, 'roundId', 'round_id');
  pick(params, 'round_id', 'round_id');
  pick(params, 'id', 'round_id'); // used for /game-session/:id — keep generic

  // Stellar address params
  pick(params, 'address', 'address');
  pick(query, 'address', 'address');

  // tx_hash occasionally appears as a query param (indexer webhooks, etc.)
  pick(query, 'tx_hash', 'tx_hash');
  pick(query, 'txHash', 'tx_hash');

  return fields;
}

/**
 * Pulls chain-correlation fields from the response body when it is a plain
 * object.  Called after the handler resolves so callers get the round_id the
 * handler assigned, not the one from the route params.
 */
function extractBodyCorrelFields(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const pick = (key: string, outKey: string) => {
    const v = b[key] ?? (b['data'] as Record<string, unknown> | undefined)?.[key];
    if (v && typeof v === 'string') fields[outKey] = v;
  };

  pick('roundId', 'round_id');
  pick('round_id', 'round_id');
  pick('address', 'address');
  pick('stellarAddress', 'address');
  pick('txHash', 'tx_hash');
  pick('tx_hash', 'tx_hash');

  return fields;
}
