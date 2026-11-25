/**
 * Unit tests for SignInProvider (LF-351).
 */

import {
  RequestTimeoutException,
  UnauthorizedException,
} from '@nestjs/common';
import { SignInProvider } from './sign-in.provider';

function makeProvider(opts: {
  user?: object | null;
  passwordMatches?: boolean;
  compareThrows?: boolean;
}) {
  const user = opts.user ?? {
    id: 'u1',
    email: 'a@b.c',
    password: 'hashed',
  };
  const userService = {
    findUserByEmail: jest.fn().mockResolvedValue(
      opts.user === undefined ? user : opts.user,
    ),
  };
  const hashingProvider = {
    comparePasswords: opts.compareThrows
      ? jest.fn().mockRejectedValue(new Error('db timeout'))
      : jest.fn().mockResolvedValue(opts.passwordMatches ?? true),
  };
  const tokens = { accessToken: 'at', refreshToken: 'rt', user };
  const generateTokenProvider = {
    generateTokens: jest.fn().mockResolvedValue(tokens),
  };

  const provider = new SignInProvider(
    userService as any,
    hashingProvider as any,
    generateTokenProvider as any,
  );

  return { provider, userService, hashingProvider, generateTokenProvider, tokens };
}

describe('SignInProvider.SignIn', () => {
  it('returns tokens when email and password are correct', async () => {
    const { provider, tokens } = makeProvider({});

    const result = await provider.SignIn({
      email: 'a@b.c',
      password: 'correct',
    });

    expect(result).toEqual(tokens);
  });

  it('throws UnauthorizedException when the user is not found', async () => {
    const { provider } = makeProvider({ user: null });

    await expect(
      provider.SignIn({ email: 'unknown@b.c', password: 'pass' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the password does not match', async () => {
    const { provider } = makeProvider({ passwordMatches: false });

    await expect(
      provider.SignIn({ email: 'a@b.c', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws RequestTimeoutException when the hashing layer fails', async () => {
    const { provider } = makeProvider({ compareThrows: true });

    await expect(
      provider.SignIn({ email: 'a@b.c', password: 'pass' }),
    ).rejects.toThrow(RequestTimeoutException);
  });

  it('calls generateTokens with the found user on success', async () => {
    const { provider, generateTokenProvider } = makeProvider({});

    await provider.SignIn({ email: 'a@b.c', password: 'correct' });

    expect(generateTokenProvider.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.c' }),
    );
  });

  it('never calls generateTokens on authentication failure', async () => {
    const { provider, generateTokenProvider } = makeProvider({
      passwordMatches: false,
    });

    await provider.SignIn({ email: 'a@b.c', password: 'wrong' }).catch(() => {});

    expect(generateTokenProvider.generateTokens).not.toHaveBeenCalled();
  });
});
