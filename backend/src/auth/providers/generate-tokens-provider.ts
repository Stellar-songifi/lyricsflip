import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './../../user/providers/user.service';
import jwtConfig from '../authConfig/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from './../../user/user.entity';
import { randomUUID } from 'crypto';
import { RefreshTokenStore } from './refresh-tokens';
// import { User } from "./../../user/user.entity";

export interface GenerateTokensOptions {
  /**
   * Token family id. Reuse this when rotating an existing refresh token;
   * omit it on login/sign-up to start a new family.
   */
  family?: string;
}

@Injectable()
export class GenerateTokensProvider {
  constructor(
    /*
     * injecting userService repo
     */
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,

    /*
     *injecting jwtService
     */
    private readonly jwtService: JwtService,

    /*
     * injecting jwtConfig
     */
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,

    /*
     * injecting refresh token store (Redis-backed)
     */
    private readonly refreshTokenStore: RefreshTokenStore,
  ) {}

  public async signToken<T>(userId: string, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub: userId,
        ...payload,
      },
      {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        expiresIn,
      },
    );
  }

  public async generateTokens(user: User, options: GenerateTokensOptions = {}) {
    // Reuse the family on rotation, otherwise start a new family.
    const family = options.family ?? randomUUID();
    const jti = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      // generate access token — include stellarAddress so WsAuthenticator
      // can surface it as `identity.address` on WebSocket connections (LF-339).
      this.signToken(user.id, this.jwtConfiguration.ttl, {
        email: user.email,
        // stellarAddress is null for email/password accounts; omit the key
        // rather than including an explicit null to keep the token compact.
        ...(user.stellarAddress ? { address: user.stellarAddress } : {}),
      }),

      // generate refresh token
      this.signToken(user.id, this.jwtConfiguration.refreshttl, {
        family,
        jti,
      }),
    ]);

    // Register the new jti so it can be validated and revoked later.
    await this.refreshTokenStore.storeToken(family, jti);

    return {
      accessToken,
      refreshToken,
      user,
      refreshTokenFamily: family,
      refreshTokenJti: jti,
    };
  }
}
