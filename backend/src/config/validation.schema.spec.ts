import { validationSchema } from './validation.schema';

const baseEnv = {
  DATABASE_URL: 'postgres://localhost:5432/test',
  JWT_SECRET: 'test-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  STELLAR_NETWORK: 'testnet',
};

const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://localhost:5432/prod',
  JWT_SECRET: 'a-sufficiently-long-production-secret-value',
  JWT_REFRESH_SECRET: 'a-sufficiently-long-production-refresh-secret-value',
  STELLAR_NETWORK: 'mainnet',
  CORS_ORIGINS: 'https://app.example.com',
};

const validate = (env: Record<string, unknown>) =>
  validationSchema.validate(env, { abortEarly: false });

// ── Baseline ──────────────────────────────────────────────────────────────────

describe('validationSchema', () => {
  describe('baseline', () => {
    it('accepts a minimal valid environment and fills in defaults', () => {
      const { error, value } = validate(baseEnv);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('development');
      expect(value.PORT).toBe(4000);
      expect(value.LOG_LEVEL).toBe('info');
      expect(value.DB_MIGRATIONS_RUN).toBe(true);
      expect(value.JWT_ACCESS_TOKEN_TTL).toBe(3600);
      expect(value.JWT_REFRESH_TOKEN_TTL).toBe(7_776_000);
      expect(value.PASSWORD_RESET_TTL_MINUTES).toBe(15);
      expect(value.WALLET_AUTH_ALLOW_RAW_SIGNATURES).toBe(false);
      expect(value.INDEXER_MAX_LAG_LEDGERS).toBe(100);
      expect(value.RPC_HEALTH_TIMEOUT_MS).toBe(5000);
    });

    it('fails when JWT_SECRET is missing', () => {
      const { JWT_SECRET, ...env } = baseEnv;
      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
        true,
      );
    });

    it('fails when JWT_REFRESH_SECRET is missing', () => {
      const { JWT_REFRESH_SECRET, ...env } = baseEnv;
      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(
        error.details.some((d) => d.path.includes('JWT_REFRESH_SECRET')),
      ).toBe(true);
    });

    it('fails when DATABASE_URL is missing', () => {
      const { DATABASE_URL, ...env } = baseEnv;
      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('DATABASE_URL'))).toBe(
        true,
      );
    });

    it('rejects an unsupported STELLAR_NETWORK', () => {
      const { error } = validate({ ...baseEnv, STELLAR_NETWORK: 'devnet' });

      expect(error).toBeDefined();
      expect(
        error.details.some((d) => d.path.includes('STELLAR_NETWORK')),
      ).toBe(true);
    });

    it('rejects an unsupported LOG_LEVEL', () => {
      const { error } = validate({ ...baseEnv, LOG_LEVEL: 'trace' });

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('LOG_LEVEL'))).toBe(
        true,
      );
    });
  });

  // ── Production safety: JWT secrets ────────────────────────────────────────

  describe('production secret safety', () => {
    it('accepts a valid production environment', () => {
      const { error } = validate(productionEnv);
      expect(error).toBeUndefined();
    });

    it('rejects JWT_SECRET shorter than 32 chars in production', () => {
      const { error } = validate({ ...productionEnv, JWT_SECRET: 'tooshort' });

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
        true,
      );
    });

    it('rejects JWT_REFRESH_SECRET shorter than 32 chars in production', () => {
      const { error } = validate({
        ...productionEnv,
        JWT_REFRESH_SECRET: 'tooshort',
      });

      expect(error).toBeDefined();
      expect(
        error.details.some((d) => d.path.includes('JWT_REFRESH_SECRET')),
      ).toBe(true);
    });

    it('rejects JWT_SECRET set to the placeholder "change-me" in production', () => {
      const { error } = validate({ ...productionEnv, JWT_SECRET: 'change-me' });

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
        true,
      );
    });

    it('rejects JWT_REFRESH_SECRET set to "change-me-too" in production', () => {
      const { error } = validate({
        ...productionEnv,
        JWT_REFRESH_SECRET: 'change-me-too',
      });

      expect(error).toBeDefined();
      expect(
        error.details.some((d) => d.path.includes('JWT_REFRESH_SECRET')),
      ).toBe(true);
    });

    it('allows short JWT_SECRET outside production', () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: 'development',
        JWT_SECRET: 'short',
      });

      expect(error).toBeUndefined();
    });

    it('allows the "change-me" placeholder outside production', () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: 'development',
        JWT_SECRET: 'change-me',
      });

      expect(error).toBeUndefined();
    });
  });

  // ── Production safety: CORS ───────────────────────────────────────────────

  describe('CORS_ORIGINS production safety', () => {
    it('rejects CORS_ORIGINS="*" in production', () => {
      const { error } = validate({ ...productionEnv, CORS_ORIGINS: '*' });

      expect(error).toBeDefined();
      expect(
        error.details.some((d) => d.path.includes('CORS_ORIGINS')),
      ).toBe(true);
    });

    it('accepts CORS_ORIGINS="*" outside production', () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: 'development',
        CORS_ORIGINS: '*',
      });

      expect(error).toBeUndefined();
    });

    it('accepts explicit origins in production', () => {
      const { error } = validate({
        ...productionEnv,
        CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
      });

      expect(error).toBeUndefined();
    });
  });

  // ── Production safety: WALLET_AUTH_ALLOW_RAW_SIGNATURES ───────────────────

  describe('WALLET_AUTH_ALLOW_RAW_SIGNATURES production safety', () => {
    it('rejects WALLET_AUTH_ALLOW_RAW_SIGNATURES=true in production', () => {
      const { error } = validate({
        ...productionEnv,
        WALLET_AUTH_ALLOW_RAW_SIGNATURES: true,
      });

      expect(error).toBeDefined();
      expect(
        error.details.some((d) =>
          d.path.includes('WALLET_AUTH_ALLOW_RAW_SIGNATURES'),
        ),
      ).toBe(true);
    });

    it('accepts WALLET_AUTH_ALLOW_RAW_SIGNATURES=true outside production', () => {
      const { error } = validate({
        ...baseEnv,
        NODE_ENV: 'test',
        WALLET_AUTH_ALLOW_RAW_SIGNATURES: true,
      });

      expect(error).toBeUndefined();
    });

    it('defaults WALLET_AUTH_ALLOW_RAW_SIGNATURES to false', () => {
      const { error, value } = validate(baseEnv);

      expect(error).toBeUndefined();
      expect(value.WALLET_AUTH_ALLOW_RAW_SIGNATURES).toBe(false);
    });
  });

  // ── Optional vars with defaults ───────────────────────────────────────────

  describe('optional vars with defaults', () => {
    it('applies DB_MIGRATIONS_RUN default of true', () => {
      const { error, value } = validate(baseEnv);
      expect(error).toBeUndefined();
      expect(value.DB_MIGRATIONS_RUN).toBe(true);
    });

    it('accepts DB_MIGRATIONS_RUN=false', () => {
      const { error, value } = validate({
        ...baseEnv,
        DB_MIGRATIONS_RUN: false,
      });
      expect(error).toBeUndefined();
      expect(value.DB_MIGRATIONS_RUN).toBe(false);
    });

    it('applies JWT_ACCESS_TOKEN_TTL default of 3600', () => {
      const { error, value } = validate(baseEnv);
      expect(error).toBeUndefined();
      expect(value.JWT_ACCESS_TOKEN_TTL).toBe(3600);
    });

    it('applies PASSWORD_RESET_TTL_MINUTES default of 15', () => {
      const { error, value } = validate(baseEnv);
      expect(error).toBeUndefined();
      expect(value.PASSWORD_RESET_TTL_MINUTES).toBe(15);
    });
  });

  // ── Error reporting ───────────────────────────────────────────────────────

  describe('error reporting', () => {
    it('reports all failures at once (abortEarly: false)', () => {
      const { error } = validate({
        NODE_ENV: 'production',
        // DATABASE_URL missing
        // JWT_SECRET missing
        // JWT_REFRESH_SECRET missing
        STELLAR_NETWORK: 'mainnet',
      });

      expect(error).toBeDefined();
      const paths = error.details.map((d) => d.path[0]);
      expect(paths).toContain('DATABASE_URL');
      expect(paths).toContain('JWT_SECRET');
      expect(paths).toContain('JWT_REFRESH_SECRET');
      expect(paths.length).toBeGreaterThanOrEqual(3);
    });
  });
});
