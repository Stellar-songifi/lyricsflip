import { RequestLoggerMiddleware, REQUEST_ID_HEADER } from './request-logger.middleware';
import { AppLogger } from './app-logger.service';

// ---------------------------------------------------------------------------
// Minimal Express fakes
// ---------------------------------------------------------------------------

function makeReqRes(overrides: { headers?: Record<string, string>; url?: string } = {}) {
  const headers: Record<string, string> = overrides.headers ?? {};
  const req: any = {
    method: 'GET',
    originalUrl: overrides.url ?? '/api/v1/rounds',
    ip: '127.0.0.1',
    get: (h: string) => headers[h.toLowerCase()],
    headers,
  };
  const responseHeaders: Record<string, string> = {};
  const callbacks: Record<string, (() => void)[]> = {};
  const res: any = {
    statusCode: 200,
    writableFinished: true,
    get: (h: string) => responseHeaders[h.toLowerCase()],
    setHeader: (h: string, v: string) => { responseHeaders[h.toLowerCase()] = v; },
    getHeader: (h: string) => responseHeaders[h.toLowerCase()],
    once: (event: string, cb: () => void) => {
      (callbacks[event] ??= []).push(cb);
    },
    _emit: (event: string) => callbacks[event]?.forEach((cb) => cb()),
  };
  return { req, res };
}

function makeLogger() {
  const infoSpy = jest.fn();
  const logger = new AppLogger({ json: false }); // suppress real writes in tests
  logger.info = infoSpy;
  return { logger, infoSpy };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequestLoggerMiddleware', () => {
  it('generates an x-request-id if none is provided', () => {
    const { logger } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes();
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(res.getHeader(REQUEST_ID_HEADER)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('reuses a valid incoming x-request-id', () => {
    const { logger } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes({ headers: { 'x-request-id': 'my-custom-id' } });

    middleware.use(req, res, jest.fn());
    expect(res.getHeader(REQUEST_ID_HEADER)).toBe('my-custom-id');
  });

  it('rejects an invalid x-request-id and generates a fresh one', () => {
    const { logger } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes({ headers: { 'x-request-id': '<script>alert(1)</script>' } });

    middleware.use(req, res, jest.fn());
    expect(res.getHeader(REQUEST_ID_HEADER)).not.toBe('<script>alert(1)</script>');
    expect(res.getHeader(REQUEST_ID_HEADER)).toMatch(/^[\w.:-]{1,128}$/);
  });

  it('calls next() within the AsyncLocalStorage context', () => {
    const { logger } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes();
    let capturedId: string | undefined;
    const { currentRequestId } = require('./request-context');
    const next = jest.fn(() => {
      capturedId = currentRequestId();
    });

    middleware.use(req, res, next);
    expect(capturedId).toBeTruthy();
    expect(capturedId).toBe(res.getHeader(REQUEST_ID_HEADER));
  });

  it('writes an access-log entry on the finish event with status and duration', () => {
    const { logger, infoSpy } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes();

    middleware.use(req, res, jest.fn());
    res._emit('finish');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [msg, fields] = infoSpy.mock.calls[0];
    expect(msg).toBe('request completed');
    expect(fields).toMatchObject({ method: 'GET', status: 200 });
    expect(typeof fields.durationMs).toBe('number');
  });

  it('writes the access-log entry only once even if both finish and close fire', () => {
    const { logger, infoSpy } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes();

    middleware.use(req, res, jest.fn());
    res._emit('finish');
    res._emit('close');

    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('scrubs sensitive query params from the logged URL', () => {
    const { logger, infoSpy } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger);
    const { req, res } = makeReqRes({ url: '/api/v1/auth/reset?token=secret&x=1' });

    middleware.use(req, res, jest.fn());
    res._emit('finish');

    const fields = infoSpy.mock.calls[0][1];
    expect(fields.url).not.toContain('secret');
    expect(fields.url).toContain('[REDACTED]');
    expect(fields.url).toContain('x=1');
  });
});
