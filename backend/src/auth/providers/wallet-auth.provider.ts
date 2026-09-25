import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { RedisService } from '../../redis/redis.service';
import { UserService } from '../../user/providers/user.service';
import { GenerateTokensProvider } from './generate-tokens-provider';
import {
  WALLET_CHALLENGE_KEY_PREFIX,
  WALLET_CHALLENGE_TTL_SECONDS,
} from '../constant/wallet-auth.constant';

@Injectable()
export class WalletAuthProvider {
  constructor(
    private readonly redisService: RedisService,

    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,

    private readonly generateTokensProvider: GenerateTokensProvider,
  ) {}

  /**
   * Issues a single-use nonce challenge for `address` to sign with its
   * Stellar wallet (e.g. via `StellarWalletsKit.signMessage`), and stores it
   * in Redis with a short TTL so `verify` can look it up - and only accept
   * it once.
   */
  public async createChallenge(address: string) {
    this.assertValidAddress(address);

    const nonce = randomBytes(32).toString('hex');
    const challenge = `LyricsFlip auth: sign in as ${address} (nonce: ${nonce})`;

    await this.redisService.set(
      this.challengeKey(address),
      challenge,
      WALLET_CHALLENGE_TTL_SECONDS,
    );

    return { challenge, expiresIn: WALLET_CHALLENGE_TTL_SECONDS };
  }

  /**
   * Verifies a signed challenge and issues access/refresh tokens for the
   * (upserted) user tied to that Stellar address.
   */
  public async verify(address: string, signedChallenge: string) {
    this.assertValidAddress(address);

    const key = this.challengeKey(address);
    const challenge = await this.redisService.get(key);
    if (!challenge) {
      throw new UnauthorizedException(
        'Challenge expired or not found; request a new one',
      );
    }

    // Single-use: consume the nonce *before* verifying, so a captured
    // request (even one carrying a valid signature) can never be replayed.
    await this.redisService.del(key);

    if (!this.verifySignature(address, challenge, signedChallenge)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const user = await this.userService.findOrCreateByStellarAddress(address);
    return this.generateTokensProvider.generateTokens(user);
  }

  private verifySignature(
    address: string,
    challenge: string,
    signedChallenge: string,
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(address);
      return keypair.verify(
        Buffer.from(challenge, 'utf8'),
        Buffer.from(signedChallenge, 'base64'),
      );
    } catch {
      // Malformed base64/signature - treat like any other invalid signature.
      return false;
    }
  }

  private assertValidAddress(address: string): void {
    if (!StrKey.isValidEd25519PublicKey(address)) {
      throw new UnauthorizedException(
        'address is not a valid Stellar public key',
      );
    }
  }

  private challengeKey(address: string): string {
    return `${WALLET_CHALLENGE_KEY_PREFIX}${address}`;
  }
}
