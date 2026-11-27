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
import { GenerateTokensProvider } from './generate-tokens-provider';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RefreshTokenStore } from './refresh-token.store';

// Re-exported for existing importers; definition lives in its own file so
// `GenerateTokensProvider` doesn't have to import this module back.
export { RefreshTokenStore };

@Injectable()
export class RefreshTokensProvider {
  constructor(
    /*
     * injecting userService repo
     */
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,

    /*
     * inject jwtService
     */
    private readonly jwtService: JwtService,

    /*
     * inject jwtService
     */
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,

    /*
     * inject generateTokenProvider
     */
    private readonly generateTokenProvider: GenerateTokensProvider,

    /*
     * inject refresh token store
     */
    private readonly refreshTokenStore: RefreshTokenStore,
  ) {}
  public async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    let decoded: { sub: string; family?: string; jti?: string };
    try {
      decoded = await this.jwtService.verifyAsync(
        refreshTokenDto.refreshToken,
        {
          secret: this.jwtConfiguration.secret,
          audience: this.jwtConfiguration.audience,
          issuer: this.jwtConfiguration.issuer,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { sub, family, jti } = decoded;
    if (!family || !jti || !(await this.isTokenUsable(family, jti))) {
      if (family) await this.revokeFamily(family);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userService.FindOneById(sub);
    if (!user) {
      await this.revokeFamily(family);
      throw new UnauthorizedException('Invalid refresh token');
    }

    try {
      return await this.generateTokenProvider.generateTokens(user, {
        family,
        previousJti: jti,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.revokeFamily(family);
        throw new UnauthorizedException('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Returns true if jti is current (not rotated) for the given family.
   */
  public async isTokenUsable(familyId: string, jti: string): Promise<boolean> {
    const isRotated = await this.refreshTokenStore.isRotated(jti);
    if (isRotated) return false;
    return this.refreshTokenStore.isCurrent(familyId, jti);
  }

  /**
   * Revokes the entire refresh-token family.
   */
  public async revokeFamily(familyId: string): Promise<void> {
    return this.refreshTokenStore.revokeFamily(familyId);
  }
}
