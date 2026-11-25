import { AppLogger } from './app-logger.service';
import { runWithRequestContext } from './request-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(opts: { json?: boolean; level?: string } = {}) {
  return new AppLogger({ json: true, ...opts });
}

function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: any) => {
      lines.push(String(chunk));
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

function captureStderr(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: any) => {
      lines.push(String(chunk));
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

function parseLastLine(lines: string[]): Record<string, unknown> {
  const last = lines[lines.length - 1].trim();
  return JSON.parse(last);
}

// ---------------------------------------------------------------------------
// JSON structure
// ---------------------------------------------------------------------------

describe('AppLogger — JSON output', () => {
  it('writes exactly one JSON line per log call', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.log('hello'));
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it('every line includes time, level, and msg', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.log('structured'));
    const entry = parseLastLine(lines);
    expect(entry).toMatchObject({ level: 'info', msg: 'structured' });
    expect(typeof entry['time']).toBe('string');
  });

  it('includes context when supplied as the second Nest-style param', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.log('ctx test', 'MyService'));
    expect(parseLastLine(lines)).toMatchObject({ context: 'MyService', msg: 'ctx test' });
  });

  it('error entries carry a stack field', () => {
    const logger = makeLogger();
    const err = new Error('boom');
    const lines = captureStderr(() => logger.error(err.message, err.stack, 'SomeService'));
    const entry = parseLastLine(lines);
    expect(entry).toMatchObject({ level: 'error', msg: 'boom' });
    expect(typeof entry['stack']).toBe('string');
  });

  it('error entries go to stderr, info/debug go to stdout', () => {
    const logger = makeLogger({ level: 'debug' });
    const errLines: string[] = [];
    const outLines: string[] = [];
    const spyErr = jest.spyOn(process.stderr, 'write').mockImplementation((c: any) => { errLines.push(c); return true; });
    const spyOut = jest.spyOn(process.stdout, 'write').mockImplementation((c: any) => { outLines.push(c); return true; });
    try {
      logger.error('bad');
      logger.debug('good');
    } finally {
      spyErr.mockRestore();
      spyOut.mockRestore();
    }
    expect(errLines).toHaveLength(1);
    expect(outLines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Request-id correlation
// ---------------------------------------------------------------------------

describe('AppLogger — requestId correlation', () => {
  it('stamps requestId on every line inside runWithRequestContext', () => {
    const logger = makeLogger();
    const lines = captureStdout(() =>
      runWithRequestContext({ requestId: 'req-abc-123' }, () => logger.log('inside ctx')),
    );
    expect(parseLastLine(lines)).toMatchObject({ requestId: 'req-abc-123' });
  });

  it('omits requestId when no context is active', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.log('no ctx'));
    expect(parseLastLine(lines)['requestId']).toBeUndefined();
  });

  it('propagates requestId through nested log calls', () => {
    const logger = makeLogger();
    const lines: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((c: any) => { lines.push(c); return true; });
    runWithRequestContext({ requestId: 'outer-id' }, () => {
      logger.log('level 1');
      runWithRequestContext({ requestId: 'inner-id' }, () => logger.log('level 2'));
      logger.log('back to outer');
    });
    spy.mockRestore();
    const entries = lines.map((l) => JSON.parse(l));
    expect(entries[0].requestId).toBe('outer-id');
    expect(entries[1].requestId).toBe('inner-id');
    expect(entries[2].requestId).toBe('outer-id');
  });
});

// ---------------------------------------------------------------------------
// Secret / JWT redaction  (acceptance criterion: no token in logs)
// ---------------------------------------------------------------------------

describe('AppLogger — secret and JWT redaction', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('redacts the `password` field in structured metadata', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.info('login', { email: 'user@test.com', password: 'hunter2' }));
    const entry = parseLastLine(lines);
    expect(entry['password']).toBe('[REDACTED]');
    expect(entry['email']).toBe('user@test.com');
  });

  it('redacts JWT tokens appearing inside free-text messages', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.log(`token: ${jwt}`));
    expect(parseLastLine(lines)['msg']).not.toContain(jwt);
    expect(parseLastLine(lines)['msg']).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens in messages', () => {
    const logger = makeLogger();
    const lines = captureStdout(() => logger.log('Authorization: Bearer abc.def.ghi'));
    expect(parseLastLine(lines)['msg']).not.toContain('abc.def.ghi');
  });

  it('redacts token/secret/apiKey fields at any nesting depth', () => {
    const logger = makeLogger();
    const lines = captureStdout(() =>
      logger.info('event', {
        user: { id: 'u1', secret: 'shh', apiKey: 'k1' },
        accessToken: jwt,
      }),
    );
    const entry = parseLastLine(lines);
    // top-level token field
    expect(entry['accessToken']).toBe('[REDACTED]');
    // nested fields
    const user = entry['user'] as Record<string, unknown>;
    expect(user['secret']).toBe('[REDACTED]');
    expect(user['apiKey']).toBe('[REDACTED]');
    // non-secret fields must pass through
    expect(user['id']).toBe('u1');
  });

  it('never logs a JWT even when passed as the Error message', () => {
    const logger = makeLogger();
    const lines = captureStderr(() => logger.error(`token=${jwt}`, 'stack', 'Guard'));
    const entry = parseLastLine(lines);
    expect(JSON.stringify(entry)).not.toContain(jwt);
  });

  it('redacts sensitive query params via redactUrl', () => {
    // Verify integration: the access-log URL path is scrubbed.
    const logger = makeLogger();
    const lines = captureStdout(() =>
      logger.info('request completed', {
        method: 'GET',
        url: '/api/v1/auth/reset?token=supersecret&x=1',
        status: 200,
      }),
    );
    const url = (parseLastLine(lines) as any)['url'] as string;
    expect(url).not.toContain('supersecret');
    expect(url).toContain('[REDACTED]');
    expect(url).toContain('x=1');
  });
});

// ---------------------------------------------------------------------------
// Level filtering
// ---------------------------------------------------------------------------

describe('AppLogger — level filtering', () => {
  it('suppresses debug entries when level=info', () => {
    const logger = makeLogger({ level: 'info' });
    const lines = captureStdout(() => {
      logger.log('info msg');
      logger.debug('debug msg');
    });
    expect(lines).toHaveLength(1);
    expect(parseLastLine(lines)).toMatchObject({ msg: 'info msg' });
  });

  it('allows verbose when level=verbose', () => {
    const logger = makeLogger({ level: 'verbose' });
    const lines = captureStdout(() => logger.verbose('verbose msg'));
    expect(lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pretty format (non-production)
// ---------------------------------------------------------------------------

describe('AppLogger — pretty format', () => {
  it('pretty output is a single non-JSON line containing the message', () => {
    const logger = new AppLogger({ json: false });
    const lines = captureStdout(() => logger.log('pretty message'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('pretty message');
    expect(() => JSON.parse(lines[0])).toThrow(); // not JSON
  });

  it('pretty output includes requestId in parentheses', () => {
    const logger = new AppLogger({ json: false });
    const lines = captureStdout(() =>
      runWithRequestContext({ requestId: 'rid-999' }, () => logger.log('x')),
    );
    expect(lines[0]).toContain('(rid-999)');
  });
});

// ---------------------------------------------------------------------------
// info() helper (used by RequestLoggerMiddleware)
// ---------------------------------------------------------------------------

describe('AppLogger — info() helper', () => {
  it('merges structured fields into the JSON entry', () => {
    const logger = makeLogger();
    const lines = captureStdout(() =>
      logger.info('request completed', { method: 'GET', status: 200, durationMs: 12 }, 'HTTP'),
    );
    const entry = parseLastLine(lines);
    expect(entry).toMatchObject({
      level: 'info',
      context: 'HTTP',
      msg: 'request completed',
      method: 'GET',
      status: 200,
      durationMs: 12,
    });
  });
});
