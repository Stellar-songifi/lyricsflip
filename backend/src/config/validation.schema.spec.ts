import { validationSchema } from './validation.schema';

const baseEnv = {
  DATABASE_URL: 'postgres://localhost:5432/test',
  JWT_SECRET: 'test-secret',
  STELLAR_NETWORK: 'testnet',
};

describe('validationSchema', () => {
  it('accepts a minimal valid environment and fills in defaults', () => {
    const { error, value } = validationSchema.validate(baseEnv, {
      abortEarly: false,
    });

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(4000);
  });

  it('fails fast with a clear message when JWT_SECRET is missing', () => {
    const { JWT_SECRET, ...envWithoutSecret } = baseEnv;
    const { error } = validationSchema.validate(envWithoutSecret, {
      abortEarly: false,
    });

    expect(error).toBeDefined();
    expect(error.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
      true,
    );
  });

  it('fails when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...envWithoutDb } = baseEnv;
    const { error } = validationSchema.validate(envWithoutDb, {
      abortEarly: false,
    });

    expect(error).toBeDefined();
    expect(error.details.some((d) => d.path.includes('DATABASE_URL'))).toBe(
      true,
    );
  });

  it('rejects an unsupported STELLAR_NETWORK', () => {
    const { error } = validationSchema.validate(
      { ...baseEnv, STELLAR_NETWORK: 'devnet' },
      { abortEarly: false },
    );

    expect(error).toBeDefined();
    expect(
      error.details.some((d) => d.path.includes('STELLAR_NETWORK')),
    ).toBe(true);
  });
});
