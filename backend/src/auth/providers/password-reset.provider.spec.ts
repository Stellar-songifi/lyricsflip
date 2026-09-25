import { BadRequestException } from '@nestjs/common';

// Keep the unit test off the real user and mail stacks (bcrypt, SMTP).
jest.mock('../../user/providers/user.service', () => ({ UserService: class {} }));
jest.mock('../../mail/mail.service', () => ({ MailService: class {} }));

import { PasswordResetToken } from '../entities/password-reset-token.entity';
import {
  hashResetToken,
  PasswordResetProvider,
  RESET_REQUESTS_PER_WINDOW,
} from './password-reset.provider';

/** Minimal in-memory stand-in for the TypeORM repository calls we make. */
function tokenRepository() {
  const rows: PasswordResetToken[] = [];
  const matches = (row: PasswordResetToken, where: any) =>
    Object.entries(where).every(([key, value]: [string, any]) => {
      if (value && value._type === 'isNull') return row[key] === null;
      if (value && value._type === 'moreThan') return row[key] > value._value;
      return row[key] === value;
    });
  return {
    rows,
    create: (data: Partial<PasswordResetToken>) => data as PasswordResetToken,
    save: jest.fn(async (row: PasswordResetToken) => {
      rows.push({ id: `t${rows.length}`, createdAt: new Date(), ...row });
      return row;
    }),
    count: jest.fn(async ({ where }) => rows.filter((r) => matches(r, where)).length),
    findOne: jest.fn(async ({ where }) => rows.find((r) => matches(r, where)) ?? null),
    update: jest.fn(async (where, patch) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, patch));
      return { affected: hit.length };
    }),
  };
}

describe('PasswordResetProvider', () => {
  let repo: ReturnType<typeof tokenRepository>;
  let userService: { findUserByEmail: jest.Mock; updateUserPassword: jest.Mock };
  let mailService: { send: jest.Mock; appUrl: string };
  let provider: PasswordResetProvider;

  const sentToken = () => {
    const url: string = mailService.send.mock.calls.at(-1)[2].resetUrl;
    return decodeURIComponent(new URL(url).searchParams.get('token'));
  };

  beforeEach(() => {
    repo = tokenRepository();
    userService = {
      findUserByEmail: jest.fn(async (email) => (email === 'a@b.c' ? { id: 'u1', email } : null)),
      updateUserPassword: jest.fn(),
    };
    mailService = { send: jest.fn(), appUrl: 'http://app.test' };
    provider = new PasswordResetProvider(
      repo as any,
      userService as any,
      { hashPassword: async (p: string) => `hashed:${p}` } as any,
      mailService as any,
    );
  });

  it('emails a reset link and stores only the token hash', async () => {
    await provider.requestReset('a@b.c');

    expect(mailService.send).toHaveBeenCalledWith('a@b.c', 'passwordReset', expect.any(Object));
    const token = sentToken();
    expect(repo.rows[0].tokenHash).toBe(hashResetToken(token));
    expect(JSON.stringify(repo.rows)).not.toContain(token);
  });

  it('does nothing for unknown emails', async () => {
    await provider.requestReset('nobody@b.c');
    expect(mailService.send).not.toHaveBeenCalled();
  });

  it('resets the password once and rejects the reused token', async () => {
    await provider.requestReset('a@b.c');
    const token = sentToken();

    await provider.resetPassword(token, 'new-password');
    expect(userService.updateUserPassword).toHaveBeenCalledWith('u1', 'hashed:new-password');

    await expect(provider.resetPassword(token, 'again-password')).rejects.toThrow(BadRequestException);
    expect(userService.updateUserPassword).toHaveBeenCalledTimes(1);
  });

  it('rejects expired tokens', async () => {
    await provider.requestReset('a@b.c');
    repo.rows[0].expiresAt = new Date(Date.now() - 1);

    await expect(provider.resetPassword(sentToken(), 'new-password')).rejects.toThrow(BadRequestException);
  });

  it('rate-limits reset emails per account', async () => {
    for (let i = 0; i < RESET_REQUESTS_PER_WINDOW + 2; i++) await provider.requestReset('a@b.c');
    expect(mailService.send).toHaveBeenCalledTimes(RESET_REQUESTS_PER_WINDOW);
  });
});
