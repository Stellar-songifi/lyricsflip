/**
 * Unit tests for WalletAuthProvider (LF-351).
 *
 * Everything that touches Redis, the DB or the JWT stack is replaced with
 * lightweight in-memory stubs so the suite runs without any infrastructure.
 */

import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { WalletAuthProvider } from './wallet-auth.provider';
import { WALLET_CHALLENGE_KEY_PREFIX } from '../constant/wallet-auth.constant';

// ---------------------------------------------------------------------------
// Helpers / stubs
// ---------------------------------------------------------------------------

/** Signs a message the same way `WalletAuthProvider.verifySignature` expects. */
function signSEP53(keypair: Keypair, message: string): string {
  const hash = createHash('sha256')
    .update('Stellar Signed Message:\n', 'utf8')
    .update(message, 'utf8')
    .digest();
  return Buffer.from(keypair.sign(hash)).toString('base64');
}

/** Signs the raw message bytes (legacy flag path). */
function signRaw(keypair: Keypair, message: string): string {
  return Buffer.from(keypair.sign(Buffer.from(message, 'utf8'))).toString(
    'base64',
  );
}

class InMemoryRedis {
  private store = new Map<string, { value: string; exp: number | null }>();

  async get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.exp !== null && e.exp <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      exp: ttl ? Date.now() + ttl * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Test helper: check stored value directly. */
  raw(key: string) {
    return this.store.get(key);
  }
}

function makeProvider(opts: {
  redisService?: any;
  userService?: any;
  generateTokensProvider?: any;
  network?: string;
  appUrl?: string;
  allowRaw?: boolean;
}): WalletAuthProvider {
  const configMap: Record<string, unknown> = {
    STELLAR_NETWORK: opts.network ?? 'testnet',
    APP_URL: opts.appUrl ?? 'http://app.test',
    WALLET_AUTH_ALLOW_RAW_SIGNATURES: opts.allowRaw ?? false,
  };
  const configService = { get: (k: string) => configMap[k] };

  return new WalletAuthProvider(
    opts.redisService ?? new InMemoryRedis(),
    opts.userService ?? {
      findOrCreateByStellarAddress: jest.fn().mockResolvedValue({
        id: 'u1',
        stellarAddress: 'G...',
      }),
    },
    opts.generateTokensProvider ?? {
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { id: 'u1' },
        refreshTokenFamily: 'fam',
        refreshTokenJti: 'jti',
      }),
    },
    configService as any,
  );
}

// ---------------------------------------------------------------------------
// createChallenge
// ---------------------------------------------------------------------------

describe('WalletAuthProvider.createChallenge', () => {
  it('returns a challenge string and a TTL', async () => {
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis });
    const kp = Keypair.random();

    const { challenge, expiresIn } = await provider.createChallenge(kp.publicKey());

    expect(typeof challenge).toBe('string');
    expect(challenge).toContain('LyricsFlip auth: sign in');
    expect(challenge).toContain(`address: ${kp.publicKey()}`);
    expect(expiresIn).toBeGreaterThan(0);
  });

  it('stores the challenge in Redis under the expected key', async () => {
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis });
    const kp = Keypair.random();

    const { challenge } = await provider.createChallenge(kp.publicKey());

    const stored = await redis.get(
      `${WALLET_CHALLENGE_KEY_PREFIX}${kp.publicKey()}`,
    );
    expect(stored).toBe(challenge);
  });

  it('rejects an invalid Stellar address', async () => {
    const provider = makeProvider({});
    await expect(provider.createChallenge('not-an-address')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('overwrites an existing challenge for the same address (idempotent)', async () => {
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis });
    const kp = Keypair.random();

    const { challenge: c1 } = await provider.createChallenge(kp.publicKey());
    // A tiny delay so the nonce/timestamp differs.
    await new Promise((r) => setTimeout(r, 5));
    const { challenge: c2 } = await provider.createChallenge(kp.publicKey());

    // The second call should overwrite, so only c2 is stored.
    const stored = await redis.get(
      `${WALLET_CHALLENGE_KEY_PREFIX}${kp.publicKey()}`,
    );
    expect(stored).toBe(c2);
    // And the two challenges should differ (different nonce/timestamp).
    expect(c1).not.toBe(c2);
  });

  it('embeds the domain and network passphrase in the challenge', async () => {
    const provider = makeProvider({ appUrl: 'https://lyric.app', network: 'mainnet' });
    const kp = Keypair.random();

    const { challenge } = await provider.createChallenge(kp.publicKey());

    expect(challenge).toContain('domain: https://lyric.app');
    expect(challenge).toContain(`network: ${Networks.PUBLIC}`);
  });
});

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

describe('WalletAuthProvider.verify', () => {
  it('succeeds with a valid SEP-53 signature and returns tokens', async () => {
    const kp = Keypair.random();
    const redis = new InMemoryRedis();
    const tokens = {
      accessToken: 'token-abc',
      refreshToken: 'refresh-abc',
      user: { id: 'u-new' },
      refreshTokenFamily: 'fam',
      refreshTokenJti: 'jti',
    };
    const generateTokens = jest.fn().mockResolvedValue(tokens);
    const findOrCreate = jest
      .fn()
      .mockResolvedValue({ id: 'u-new', stellarAddress: kp.publicKey() });

    const provider = makeProvider({
      redisService: redis,
      userService: { findOrCreateByStellarAddress: findOrCreate },
      generateTokensProvider: { generateTokens },
    });

    const { challenge } = await provider.createChallenge(kp.publicKey());
    const sig = signSEP53(kp, challenge);

    const result = await provider.verify(kp.publicKey(), sig);

    expect(result).toEqual(tokens);
    expect(findOrCreate).toHaveBeenCalledWith(kp.publicKey());
    expect(generateTokens).toHaveBeenCalledTimes(1);
  });

  it('consumes the challenge (single-use nonce)', async () => {
    const kp = Keypair.random();
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis });

    const { challenge } = await provider.createChallenge(kp.publicKey());
    const sig = signSEP53(kp, challenge);

    await provider.verify(kp.publicKey(), sig);

    // Second attempt must fail because the nonce was consumed.
    await expect(provider.verify(kp.publicKey(), sig)).rejects.toThrow(
      UnauthorizedException,
    );
    // The key must be absent in Redis.
    const remaining = await redis.get(
      `${WALLET_CHALLENGE_KEY_PREFIX}${kp.publicKey()}`,
    );
    expect(remaining).toBeNull();
  });

  it('rejects a signature from a different keypair', async () => {
    const owner = Keypair.random();
    const impostor = Keypair.random();
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis });

    const { challenge } = await provider.createChallenge(owner.publicKey());
    const wrongSig = signSEP53(impostor, challenge);

    await expect(provider.verify(owner.publicKey(), wrongSig)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when no challenge exists (expired or never created)', async () => {
    const kp = Keypair.random();
    const provider = makeProvider({});
    // No createChallenge call, so Redis has nothing.
    await expect(
      provider.verify(kp.publicKey(), 'any-sig'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a malformed base64 signature', async () => {
    const kp = Keypair.random();
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis });

    await provider.createChallenge(kp.publicKey());

    await expect(
      provider.verify(kp.publicKey(), '!!!not-base64!!!'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid Stellar address in verify()', async () => {
    const provider = makeProvider({});
    await expect(provider.verify('bad-addr', 'sig')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts raw-byte signatures when the feature flag is enabled', async () => {
    const kp = Keypair.random();
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis, allowRaw: true });

    const { challenge } = await provider.createChallenge(kp.publicKey());
    const rawSig = signRaw(kp, challenge);

    // Raw signatures must succeed under the flag.
    await expect(provider.verify(kp.publicKey(), rawSig)).resolves.toBeDefined();
  });

  it('rejects raw-byte signatures when the feature flag is off', async () => {
    const kp = Keypair.random();
    const redis = new InMemoryRedis();
    const provider = makeProvider({ redisService: redis, allowRaw: false });

    const { challenge } = await provider.createChallenge(kp.publicKey());
    const rawSig = signRaw(kp, challenge);

    // Without the flag only SEP-53 is accepted.
    await expect(provider.verify(kp.publicKey(), rawSig)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a challenge whose domain does not match the current app URL', async () => {
    // Create the challenge under one domain, then configure the provider
    // to believe it runs on a different domain.
    const kp = Keypair.random();
    const redis = new InMemoryRedis();

    // Store the challenge as if it was issued by domain-a.
    const providerA = makeProvider({
      redisService: redis,
      appUrl: 'http://domain-a.test',
    });
    const { challenge } = await providerA.createChallenge(kp.publicKey());

    // Now verify using a provider configured for domain-b.
    const providerB = makeProvider({
      redisService: redis,
      appUrl: 'http://domain-b.test',
    });
    const sig = signSEP53(kp, challenge);

    await expect(providerB.verify(kp.publicKey(), sig)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
