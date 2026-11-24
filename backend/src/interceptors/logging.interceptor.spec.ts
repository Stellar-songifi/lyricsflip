import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { AppLogger } from '../logger/app-logger.service';
import { runWithRequestContext } from '../logger/request-context';

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

function makeContext(overrides: {
  method?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  statusCode?: number;
  responseHeader?: string | undefined;
} = {}): ExecutionContext {
  const req = {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.url ?? '/api/v1/rounds/123',
    params: overrides.params ?? { roundId: '123' },
    query: overrides.query ?? {},
    ip: '127.0.0.1',
  };
  const res = {
    statusCode: overrides.statusCode ?? 200,
    getHeader: jest.fn().mockReturnValue(overrides.responseHeader),
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function makeThrowingHandler(err: Error): CallHandler {
  return { handle: () => throwError(() => err) };
}

function makeLogger(): { logger: AppLogger; lines: string[] } {
  const lines: string[] = [];
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: any) => { lines.push(String(c)); return true; });
  const spyErr = jest.spyOn(process.stderr, 'write').mockImplementation((c: any) => { lines.push(String(c)); return true; });
  afterEach(() => { spy.mockRestore(); spyErr.mockRestore(); });
  const logger = new AppLogger({ json: true, level: 'debug' });
  return { logger, lines };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoggingInterceptor', () => {
  it('emits a request-received debug entry before the handler runs', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = makeContext();
    const handler = makeHandler({ roundId: '123' });

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const received = entries.find((e: any) => e.msg === 'request received');
        expect(received).toBeDefined();
        expect(received['method']).toBe('GET');
        expect(received['round_id']).toBe('123');
        done();
      },
    });
  });

  it('emits a request-handled entry after the handler resolves', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    interceptor.intercept(makeContext(), makeHandler({})).subscribe({
      complete: () => {
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        expect(entries.some((e: any) => e.msg === 'request handled')).toBe(true);
        done();
      },
    });
  });

  it('emits a request-errored entry when handler throws', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    interceptor.intercept(makeContext(), makeThrowingHandler(new Error('oops'))).subscribe({
      error: () => {
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        expect(entries.some((e: any) => e.msg === 'request errored')).toBe(true);
        done();
      },
    });
  });

  it('stamps requestId on log entries when context is active', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    runWithRequestContext({ requestId: 'intercept-rid' }, () => {
      interceptor.intercept(makeContext(), makeHandler({})).subscribe({
        complete: () => {
          const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          expect(entries.every((e: any) => e.requestId === 'intercept-rid')).toBe(true);
          done();
        },
      });
    });
  });

  it('extracts address from route params', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = makeContext({ params: { address: 'GABCDE' }, url: '/api/v1/players/GABCDE' });
    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const received = entries.find((e: any) => e.msg === 'request received');
        expect(received?.['address']).toBe('GABCDE');
        done();
      },
    });
  });

  it('extracts tx_hash from query string', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = makeContext({ query: { tx_hash: 'abc123' } });
    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const received = entries.find((e: any) => e.msg === 'request received');
        expect(received?.['tx_hash']).toBe('abc123');
        done();
      },
    });
  });

  it('is a no-op for non-HTTP contexts (WebSocket)', (done) => {
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    const wsCtx = { getType: () => 'ws' } as unknown as ExecutionContext;
    const handler = makeHandler('ws-data');
    interceptor.intercept(wsCtx, handler).subscribe({
      next: (v) => { expect(v).toBe('ws-data'); },
      complete: () => {
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        expect(entries.length).toBe(0);
        done();
      },
    });
  });

  it('never includes JWT tokens in log output', (done) => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123';
    const { logger, lines } = makeLogger();
    const interceptor = new LoggingInterceptor(logger);
    // Simulate a URL that accidentally includes a token query param
    const ctx = makeContext({ url: `/api/v1/auth/verify?token=${jwt}` });
    interceptor.intercept(ctx, makeHandler({})).subscribe({
      complete: () => {
        const raw = lines.join('');
        expect(raw).not.toContain(jwt);
        done();
      },
    });
  });
});
