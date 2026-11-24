import { isOriginAllowed, resolveCorsOrigins } from './cors';

describe('cors config (LF-359)', () => {
  it('rejects wildcard when credentials are enabled', () => {
    expect(() =>
      resolveCorsOrigins('*', { credentials: true, nodeEnv: 'development' }),
    ).toThrow(/must not be "\*"/);
  });

  it('rejects a wildcard in a comma-separated list with credentials', () => {
    expect(() =>
      resolveCorsOrigins('https://app.example.com,*', {
        credentials: true,
        nodeEnv: 'production',
      }),
    ).toThrow(/must not be "\*"/);
  });

  it('rejects a wildcard in production even without credentials', () => {
    expect(() =>
      resolveCorsOrigins('*', { credentials: false, nodeEnv: 'production' }),
    ).toThrow(/must not be "\*"/);
  });

  it('allows a wildcard outside production when credentials are off', () => {
    expect(
      resolveCorsOrigins('*', { credentials: false, nodeEnv: 'development' }),
    ).toEqual(['*']);
  });

  it('returns normalized explicit origins', () => {
    expect(
      resolveCorsOrigins('https://a.example.com, https://b.example.com,', {
        credentials: true,
        nodeEnv: 'production',
      }),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('defaults to localhost outside production when unset', () => {
    expect(
      resolveCorsOrigins(undefined, { credentials: true, nodeEnv: 'test' }),
    ).toEqual(['http://localhost:3000']);
  });

  it('requires explicit origins in production when unset', () => {
    expect(() =>
      resolveCorsOrigins(undefined, {
        credentials: true,
        nodeEnv: 'production',
      }),
    ).toThrow(/explicit allowed origins/);
  });

  it('rejects empty origins in production', () => {
    expect(() =>
      resolveCorsOrigins(' , ', { credentials: true, nodeEnv: 'production' }),
    ).toThrow(/explicit allowed origins/);
  });

  it('allows matching origins and rejects others', () => {
    const allowed = ['https://app.example.com'];
    expect(isOriginAllowed('https://app.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);
  });

  it('allows requests with no Origin header', () => {
    expect(isOriginAllowed(undefined, ['https://app.example.com'])).toBe(true);
  });
});
