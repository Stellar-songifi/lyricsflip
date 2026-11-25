/**
 * Unit tests for GenerateTokensProvider (LF-351).
 *
 * Uses real JwtService with in-memory key to verify token structure without
 * needing a running server or database.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { GenerateTokensProvider } from './generate-tokens-provider';
import { RefreshTokenStore } from './refresh-tokens';
import jwtConfig from '../authConfig/jwt.config';

process.env.JWT_SECRET = 'test-secret-lf351';
process.env.JWT_TOKEN_AUDIENCE = 'lyricsflip-test';
process.env.JWT_TOKEN_ISSUER = 'lyricsflip-test';
process.env.JWT_ACCESS_TOKEN_TTL = '3600';
process.env.JWT_REFRESH_TOKEN_TTL = '7776000';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    stellarAddress: null as string | null,
    username: 'testuser',
    ...overrides,
  } as any;
}

describe('GenerateTokensProvider', () => {
  let provider: GenerateTokensProvider;
  let jwtService: JwtService;
  let refreshTokenStore: jest.Mocked<RefreshTokenStore>;

  beforeEach(async () => {
    refreshTokenStore = {
      storeToken: jest.fn().mockResolvedValue(undefined),
      validateToken: jest.fn().mockResolvedValue(true),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RefreshTokenStore>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forFeature(jwtConfig),
        JwtModule.registerAsync(jwtConfig.asProvider()),
      ],
      providers: [
        GenerateTokensProvider,
        {
          // UserService is forwardRef'd — provide a stub so DI resolves.
          provide: 'UserService',
          useValue: {},
        },
        { provide: RefreshTokenStore, useValue: refreshTokenStore },
      ],
    }).compile();

    provider = module.get<GenerateTokensProvider>(GenerateTokensProvider);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('generateTokens', () => {
    it('returns a non-empty accessToken and refreshToken', async () => {
      const { accessToken, refreshToken } = await provider.generateTokens(
        makeUser(),
      );

      expect(typeof accessToken).toBe('string');
      expect(accessToken.split('.').length).toBe(3); // JWTs have 3 parts.
      expect(typeof refreshToken).toBe('string');
      expect(refreshToken.split('.').length).toBe(3);
    });

    it('embeds sub (user id) and email in the access token', async () => {
      const user = makeUser({ email: 'alice@example.com' });
      const { accessToken } = await provider.generateTokens(user);

      const payload = jwtService.decode(accessToken) as Record<string, unknown>;
      expect(payload.sub).toBe('user-1');
      expect(payload.email).toBe('alice@example.com');
    });

    it('does NOT embed address in the access token for email-only accounts', async () => {
      const user = makeUser({ stellarAddress: null });
      const { accessToken } = await provider.generateTokens(user);

      const payload = jwtService.decode(accessToken) as Record<string, unknown>;
      expect(payload.address).toBeUndefined();
    });

    it('embeds the wallet address in the access token when stellarAddress is set', async () => {
      const kpAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const user = makeUser({ stellarAddress: kpAddress });
      const { accessToken } = await provider.generateTokens(user);

      const payload = jwtService.decode(accessToken) as Record<string, unknown>;
      expect(payload.address).toBe(kpAddress);
    });

    it('stores the refresh token jti in RefreshTokenStore', async () => {
      const { refreshTokenFamily, refreshTokenJti } =
        await provider.generateTokens(makeUser());

      expect(refreshTokenStore.storeToken).toHaveBeenCalledWith(
        refreshTokenFamily,
        refreshTokenJti,
      );
    });

    it('reuses the provided family on token rotation', async () => {
      const fixedFamily = 'fixed-family-id';
      const { refreshTokenFamily } = await provider.generateTokens(makeUser(), {
        family: fixedFamily,
      });

      expect(refreshTokenFamily).toBe(fixedFamily);
    });

    it('generates a new family when none is provided', async () => {
      const { refreshTokenFamily: fam1 } = await provider.generateTokens(makeUser());
      const { refreshTokenFamily: fam2 } = await provider.generateTokens(makeUser());

      // Two independent logins must produce different families.
      expect(fam1).not.toBe(fam2);
    });

    it('returns the user object in the response', async () => {
      const user = makeUser();
      const result = await provider.generateTokens(user);

      expect(result.user).toBe(user);
    });
  });

  describe('signToken', () => {
    it('produces a JWT that can be re-verified with the same key', async () => {
      const token = await provider.signToken('u-test', 3600, {
        custom: 'value',
      });

      const verified = await jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      expect(verified.sub).toBe('u-test');
      expect(verified.custom).toBe('value');
    });
  });
});
