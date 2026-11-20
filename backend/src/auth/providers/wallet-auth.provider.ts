import {
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Keypair, Networks, StrKey } from '@stellar/stellar-sdk';
import { RedisService } from '../../redis/redis.service';
import { UserService } from '../../user/providers/user.service';
import { GenerateTokensProvider } from './generate-tokens-provider';
import {
  WALLET_CHALLENGE_KEY_PREFIX,
  WALLET_CHALLENGE_TTL_SECONDS,
} from '../constant/wallet-auth.constant';

/** SEP-53 signed-message prefix, hashed together with the message. */
const SEP53_PREFIX = 'Stellar Signed Message:\n';

@Injectable()
export class WalletAuthProvider {
  constructor(
    private readonly redisService: RedisService,

    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,

    private readonly generateTokensProvider: GenerateTokensProvider,

    private readonly configService: ConfigService,
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
    const expiresAt = Date.now() + WALLET_CHALLENGE_TTL_SECONDS * 1000;
    const challenge = this.buildChallenge(address, nonce, expiresAt);

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

    this.assertChallengeBinding(challenge);

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
      const signature = Buffer.from(signedChallenge, 'base64');

      // Wallets implementing SEP-53 `signMessage` (Freighter, Wallets Kit)
      // sign SHA-256("Stellar Signed Message:\n" + message), not the raw
      // message bytes.
      const messageHash = createHash('sha256')
        .update(SEP53_PREFIX, 'utf8')
        .update(challenge, 'utf8')
        .digest();

      if (keypair.verify(messageHash, signature)) {
        return true;
      }

      // Raw-byte signatures are only accepted behind a feature flag, for
      // tests and legacy clients.
      if (this.allowRawSignatures()) {
        return keypair.verify(Buffer.from(challenge, 'utf8'), signature);
      }

      return false;
    } catch {
      // Malformed base64/signature - treat like any other invalid signature.
      return false;
    }
  }

  private buildChallenge(
    address: string,
    nonce: string,
    expiresAt: number,
  ): string {
    return [
      'LyricsFlip auth: sign in',
      `address: ${address}`,
      `domain: ${this.appUrl()}`,
      `network: ${this.networkPassphrase()}`,
      `nonce: ${nonce}`,
      `expiresAt: ${expiresAt}`,
    ].join('\n');
  }

  /**
   * Rejects challenges whose embedded domain/network/expiry no longer match
   * the current configuration (e.g. a challenge signed for another domain).
   */
  private assertChallengeBinding(challenge: string): void {
    const fields = this.parseChallenge(challenge);
    if (!fields) {
      throw new UnauthorizedException('Malformed challenge');
    }

    if (fields.domain !== this.appUrl()) {
      throw new UnauthorizedException('Challenge domain mismatch');
    }

    if (fields.network !== this.networkPassphrase()) {
      throw new UnauthorizedException('Challenge network mismatch');
    }

    const expiresAt = Number(fields.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      throw new UnauthorizedException('Challenge expired');
    }
  }

  private parseChallenge(challenge: string): Record<string, string> | null {
    const fields: Record<string, string> = {};
    for (const line of challenge.split('\n')) {
      const separator = line.indexOf(': ');
      if (separator === -1) {
        continue;
      }
      fields[line.slice(0, separator)] = line.slice(separator + 2);
    }

    if (
      !fields.address ||
      !fields.domain ||
      !fields.network ||
      !fields.nonce ||
      !fields.expiresAt
    ) {
      return null;
    }

    return fields;
  }

  private appUrl(): string {
    return this.configService.get<string>('APP_URL') ?? '';
  }

  private networkPassphrase(): string {
    const network = (
      this.configService.get<string>('STELLAR_NETWORK') ?? 'testnet'
    ).toLowerCase();

    switch (network) {
      case 'mainnet':
      case 'public':
        return Networks.PUBLIC;
      case 'futurenet':
        return Networks.FUTURENET;
      case 'testnet':
      default:
        return Networks.TESTNET;
    }
  }

  private allowRawSignatures(): boolean {
    const value = this.configService.get<string | boolean>(
      'WALLET_AUTH_ALLOW_RAW_SIGNATURES',
    );
    return value === true || value === 'true';
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
