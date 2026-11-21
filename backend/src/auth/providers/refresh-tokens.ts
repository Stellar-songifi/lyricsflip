import { forwardRef, Inject, Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { UserService } from "./../../user/providers/user.service"
import jwtConfig from "../authConfig/jwt.config"
import { ConfigType } from "@nestjs/config"
import { GenerateTokensProvider } from "./generate-tokens-provider"
import { RefreshTokenDto } from "../dtos/refresh-token.dto"
import { RedisService } from "./../../redis/redis.service"

/**
 * Redis-backed store for refresh-token rotation and revocation.
 *
 * Keys:
 *  - refresh:family:<familyId> -> current jti (string), TTL = refresh-token TTL
 *  - refresh:jti:<jti>         -> JSON { familyId, rotated: boolean }, TTL = refresh-token TTL
 */
@Injectable()
export class RefreshTokenStore {
  constructor(
    private readonly redisService: RedisService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>
  ) {}

  private get ttlSeconds(): number {
    return this.jwtConfiguration.refreshTokenTtl
  }

  private familyKey(familyId: string): string {
    return `refresh:family:${familyId}`
  }

  private jtiKey(jti: string): string {
    return `refresh:jti:${jti}`
  }

  /**
   * Register a freshly issued refresh token for a family, making it the
   * current (valid) jti for that family.
   */
  public async storeToken(familyId: string, jti: string): Promise<void> {
    const client = this.redisService.getClient()
    const ttl = this.ttlSeconds

    await client.set(this.familyKey(familyId), jti, "EX", ttl)
    await client.set(
      this.jtiKey(jti),
      JSON.stringify({ familyId, rotated: false }),
      "EX",
      ttl
    )
  }

  /**
   * Returns the family id associated with a jti, or null if unknown.
   */
  public async getFamilyIdForJti(jti: string): Promise<string | null> {
    const client = this.redisService.getClient()
    const raw = await client.get(this.jtiKey(jti))
    if (!raw) {
      return null
    }
    try {
      const parsed = JSON.parse(raw) as { familyId?: string }
      return parsed.familyId ?? null
    } catch {
      return null
    }
  }

  /**
   * Returns true if the jti has already been rotated (i.e. reused).
   */
  public async isRotated(jti: string): Promise<boolean> {
    const client = this.redisService.getClient()
    const raw = await client.get(this.jtiKey(jti))
    if (!raw) {
      return false
    }
    try {
      const parsed = JSON.parse(raw) as { rotated?: boolean }
      return parsed.rotated === true
    } catch {
      return false
    }
  }

  /**
   * Returns true if the jti is the current (valid) token for its family.
   */
  public async isCurrent(familyId: string, jti: string): Promise<boolean> {
    const client = this.redisService.getClient()
    const current = await client.get(this.familyKey(familyId))
    return current === jti
  }

  /**
   * Mark a jti as rotated and set the new jti as the current token for the
   * family. The old jti is retained (marked rotated) so reuse can be detected.
   */
  public async rotate(
    familyId: string,
    oldJti: string,
    newJti: string
  ): Promise<void> {
    const client = this.redisService.getClient()
    const ttl = this.ttlSeconds

    await client.set(
      this.jtiKey(oldJti),
      JSON.stringify({ familyId, rotated: true }),
      "EX",
      ttl
    )
    await client.set(this.familyKey(familyId), newJti, "EX", ttl)
    await client.set(
      this.jtiKey(newJti),
      JSON.stringify({ familyId, rotated: false }),
      "EX",
      ttl
    )
  }

  /**
   * Revoke an entire token family: removes the family pointer and marks all
   * known jtis for the family as rotated so they can never be used again.
   */
  public async revokeFamily(familyId: string): Promise<void> {
    const client = this.redisService.getClient()
    const currentJti = await client.get(this.familyKey(familyId))

    if (currentJti) {
      await client.set(
        this.jtiKey(currentJti),
        JSON.stringify({ familyId, rotated: true }),
        "EX",
        this.ttlSeconds
      )
    }

    await client.del(this.familyKey(familyId))
  }
}

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
    private readonly refreshTokenStore: RefreshTokenStore
  ) {}
  public async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    // validate the refresh token using jwt
   const { sub } = await this.jwtService.verifyAsync(
        refreshTokenDto.refreshToken, 
        {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
    })

    // grab the user from the database
    const user = await this.userService.FindOneById(sub)

    // generate the token
    return await this.generateTokenProvider.generateTokens(user)
  }
}