import { redact, REDACTED, redactString, redactUrl } from './redact';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123';

describe('redact', () => {
  it('masks sensitive keys at any depth', () => {
    expect(
      redact({ email: 'a@b.c', password: 'x', nested: { refreshToken: 'y', ok: 1 } }),
    ).toEqual({ email: 'a@b.c', password: REDACTED, nested: { refreshToken: REDACTED, ok: 1 } });
  });

  it('masks JWTs and bearer tokens inside free text', () => {
    expect(redactString(`token is ${jwt}`)).toBe(`token is ${REDACTED}`);
    expect(redactString('Authorization: Bearer abc.def')).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it('masks sensitive query params', () => {
    expect(redactUrl('/reset?token=secret&x=1')).toBe(`/reset?token=${REDACTED}&x=1`);
  });
});
