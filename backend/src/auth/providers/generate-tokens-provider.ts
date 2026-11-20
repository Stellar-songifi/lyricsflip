import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './../../user/providers/user.service';
import jwtConfig from '../authConfig/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from './../../user/user.entity';
import { randomUUID } from 'crypto';
import { RefreshTokenStore } from './refresh-token-store.provider';
// import { User } from "./../../user/user.entity";

export interface GenerateTokensOptions {
  /**
   * Token family id. Reuse this when rotating an existing refresh token;
   * omit it on login/sign-up to start a new family.
   */
  family?: string;
  previousJti?: string;
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
      // generate access token
      this.signToken(user.id, this.jwtConfiguration.ttl, {
        email: user.email,
      }),

      // generate refresh token
      this.signToken(user.id, this.jwtConfiguration.refreshttl, {
        family,
        jti,
      }),
    ]);

    // Register the new jti so it can be validated and revoked later.
    if (options.previousJti) {
      const rotated = await this.refreshTokenStore.rotate(
        family,
        options.previousJti,
        jti,
      );
      if (!rotated) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } else {
      await this.refreshTokenStore.storeToken(family, jti);
    }

    return {
      accessToken,
      refreshToken,
      user,
      refreshTokenFamily: family,
      refreshTokenJti: jti,
    };
  }
}
