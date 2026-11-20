import { createConfig } from '@/lib/stellar/stellar-config';
import { StrKey } from '@stellar/stellar-sdk';
import testnetDeployment from '../../../../deployments/testnet.json';

describe('stellarConfig and contract ID validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides configuration with testnet defaults when env vars are unset', () => {
    const config = createConfig();
    expect(config.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    expect(config.networkPassphrase).toBe(
      'Test SDF Network ; September 2015',
    );
    expect(config.lyricsflipContractId).toBe(testnetDeployment.lyricsflip || '');
    expect(config.lyricsflipNftContractId).toBe(
      testnetDeployment.lyricsflipNft || '',
    );
  });

  it('validates contract IDs using StrKey.isValidContract', () => {
    const validContractId =
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const invalidContractId = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const malformedId = 'not-a-valid-id';

    expect(StrKey.isValidContract(validContractId)).toBe(true);
    expect(StrKey.isValidContract(invalidContractId)).toBe(false);
    expect(StrKey.isValidContract(malformedId)).toBe(false);
    expect(StrKey.isValidContract('')).toBe(false);
  });

  it('fails build check in production when contract IDs are missing', () => {
    const checkProductionBuild = (
      gameId: string | undefined,
      nftId: string | undefined,
    ) => {
      const gameContract = gameId || testnetDeployment.lyricsflip;
      const nftContract = nftId || testnetDeployment.lyricsflipNft;
      if (!gameContract || !nftContract) {
        throw new Error(
          'Production build failed: NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID and NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID must be set in production mode.',
        );
      }
      return true;
    };

    expect(() => checkProductionBuild('', '')).toThrow(
      /Production build failed/,
    );
    expect(
      checkProductionBuild(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      ),
    ).toBe(true);
  });
});
