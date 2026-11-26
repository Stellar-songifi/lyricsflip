import type { Response } from 'express';
import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie';

jest.mock('./authConfig/jwt.config', () => ({
  __esModule: true,
  default: () => ({ refreshttl: 3600 }),
}));

describe('refresh cookie flags (LF-359/LF-336 audit)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function mockRes() {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
  }

  it('sets HttpOnly, SameSite=Lax, scoped path, maxAge, secure in production', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    setRefreshCookie(res, 'rt');

    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'rt',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 3_600_000,
      }),
    );
  });

  it('clears cookie with matching flags', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    clearRefreshCookie(res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      }),
    );
  });

  it('uses non-secure cookie outside production for local HTTP dev', () => {
    process.env.NODE_ENV = 'test';
    const res = mockRes();
    setRefreshCookie(res, 'rt');

    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'rt',
      expect.objectContaining({ secure: false }),
    );
  });
});
