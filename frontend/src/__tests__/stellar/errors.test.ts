/**
 * Tests for src/lib/stellar/errors.ts
 * Covers: LYRICSFLIP_ERRORS table, getContractErrorCode, describeContractError.
 */
import {
  LYRICSFLIP_ERRORS,
  LYRICSFLIP_NFT_ERRORS,
  getContractErrorCode,
  describeContractError,
} from '@/lib/stellar/errors';

describe('LYRICSFLIP_ERRORS table', () => {
  it('has entries for all known game contract error codes', () => {
    // Core error codes from the Rust contract
    const expectedCodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    expectedCodes.forEach((code) => {
      expect(LYRICSFLIP_ERRORS[code]).toBeDefined();
      expect(LYRICSFLIP_ERRORS[code].name).toBeTruthy();
      expect(LYRICSFLIP_ERRORS[code].message).toBeTruthy();
    });
  });

  it('AlreadyInitialized has code 1', () => {
    expect(LYRICSFLIP_ERRORS[1].name).toBe('AlreadyInitialized');
  });

  it('NonExistingRound has code 2', () => {
    expect(LYRICSFLIP_ERRORS[2].name).toBe('NonExistingRound');
  });

  it('NotAParticipant has code 12', () => {
    expect(LYRICSFLIP_ERRORS[12].name).toBe('NotAParticipant');
  });
});

describe('LYRICSFLIP_NFT_ERRORS table', () => {
  it('has entries for NFT contract error codes 1-10', () => {
    for (let i = 1; i <= 10; i++) {
      expect(LYRICSFLIP_NFT_ERRORS[i]).toBeDefined();
    }
  });

  it('NotMinter has code 2', () => {
    expect(LYRICSFLIP_NFT_ERRORS[2].name).toBe('NotMinter');
  });

  it('TokenDoesNotExist has code 4', () => {
    expect(LYRICSFLIP_NFT_ERRORS[4].name).toBe('TokenDoesNotExist');
  });
});

describe('getContractErrorCode', () => {
  it('extracts the code from a standard Soroban contract error message', () => {
    const err = new Error('Transaction failed: Error(Contract, #2)');
    expect(getContractErrorCode(err)).toBe(2);
  });

  it('returns undefined when no contract error pattern is present', () => {
    expect(getContractErrorCode(new Error('generic error'))).toBeUndefined();
  });

  it('works with a plain string (non-Error)', () => {
    expect(getContractErrorCode('Error(Contract, #9)')).toBe(9);
  });

  it('handles multi-digit codes', () => {
    expect(getContractErrorCode(new Error('Error(Contract, #17)'))).toBe(17);
  });

  it('returns undefined for an empty string', () => {
    expect(getContractErrorCode('')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getContractErrorCode(null)).toBeUndefined();
  });
});

describe('describeContractError', () => {
  it('returns the correct ContractErrorInfo for a known error', () => {
    const err = new Error('Transaction failed: Error(Contract, #5)');
    const info = describeContractError(err);
    expect(info).toBeDefined();
    expect(info!.name).toBe('RoundAlreadyJoined');
  });

  it('returns undefined for an unrecognised code', () => {
    const err = new Error('Error(Contract, #999)');
    expect(describeContractError(err)).toBeUndefined();
  });

  it('accepts a custom error table', () => {
    const customTable = { 42: { name: 'CustomError', message: 'A custom error.' } };
    const err = new Error('Error(Contract, #42)');
    const info = describeContractError(err, customTable);
    expect(info).toEqual({ name: 'CustomError', message: 'A custom error.' });
  });

  it('returns undefined when no error code found', () => {
    expect(describeContractError(new Error('no code here'))).toBeUndefined();
  });
});
