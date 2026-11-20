import { UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../user/user.entity';
import jwtConfig from '../authConfig/jwt.config';
import { GenerateTokensProvider } from './generate-tokens-provider';
import { RefreshTokenStore } from './refresh-token-store.provider';

describe('GenerateTokensProvider', () => {
  const user = Object.assign(new User(), {
    id: 'user-id',
    email: 'user@example.com',
  });
  let provider: GenerateTokensProvider;
  let refreshTokenStore: {
    storeToken: jest.Mock;
    rotate: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    refreshTokenStore = {
      storeToken: jest.fn().mockResolvedValue(undefined),
      rotate: jest.fn().mockResolvedValue(true),
    };
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    };
    provider = new GenerateTokensProvider(
      {} as never,
      jwtService as unknown as JwtService,
      {
        secret: 'secret',
        audience: 'audience',
        issuer: 'issuer',
        ttl: 900,
        refreshttl: 3600,
      } as ConfigType<typeof jwtConfig>,
      refreshTokenStore as unknown as RefreshTokenStore,
    );
  });

  it('stores the initial refresh token', async () => {
    const tokens = await provider.generateTokens(user);

    expect(tokens.refreshToken).toBe('refresh-token');
    expect(refreshTokenStore.storeToken).toHaveBeenCalledWith(
      tokens.refreshTokenFamily,
      tokens.refreshTokenJti,
    );
    expect(refreshTokenStore.rotate).not.toHaveBeenCalled();
  });

  it('atomically rotates a refresh token within its existing family', async () => {
    await provider.generateTokens(user, {
      family: 'family-id',
      previousJti: 'previous-jti',
    });

    expect(refreshTokenStore.rotate).toHaveBeenCalledWith(
      'family-id',
      'previous-jti',
      expect.any(String),
    );
    expect(refreshTokenStore.storeToken).not.toHaveBeenCalled();
  });

  it('rejects a token when its refresh family was already rotated', async () => {
    refreshTokenStore.rotate.mockResolvedValue(false);

    await expect(
      provider.generateTokens(user, {
        family: 'family-id',
        previousJti: 'previous-jti',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenStore.storeToken).not.toHaveBeenCalled();
  });
});
