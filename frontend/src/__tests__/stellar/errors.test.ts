/**
 * Tests for src/lib/stellar/errors.ts
 * Covers: LYRICSFLIP_ERRORS table, CONTRACT_ERROR_NAMES, LYRICSFLIP_ERROR_MESSAGES,
 * buildErrorTable, getContractErrorCode, describeContractError, parseContractError.
 */
import {
  LYRICSFLIP_ERRORS,
  LYRICSFLIP_NFT_ERRORS,
  CONTRACT_ERROR_NAMES,
  LYRICSFLIP_ERROR_MESSAGES,
  NFT_ERROR_NAMES,
  NFT_ERROR_MESSAGES,
  buildErrorTable,
  getContractErrorCode,
  describeContractError,
  parseContractError,
} from '@/lib/stellar/errors';

describe('LYRICSFLIP_ERRORS table', () => {
  it('has entries for all 40 contract error codes defined in onchain errors.rs', () => {
    for (let code = 1; code <= 40; code++) {
      expect(LYRICSFLIP_ERRORS[code]).toBeDefined();
      expect(LYRICSFLIP_ERRORS[code].name).toBeTruthy();
      expect(LYRICSFLIP_ERRORS[code].message).toBeTruthy();
      expect(LYRICSFLIP_ERRORS[code].message).not.toContain('Contract error:');
    }
  });

  it('every error variant in CONTRACT_ERROR_NAMES has a friendly message defined', () => {
    for (const [codeStr, name] of Object.entries(CONTRACT_ERROR_NAMES)) {
      const code = Number(codeStr);
      expect(LYRICSFLIP_ERROR_MESSAGES[name]).toBeDefined();
      expect(LYRICSFLIP_ERROR_MESSAGES[name].trim().length).toBeGreaterThan(0);
      expect(LYRICSFLIP_ERRORS[code].message).toBe(LYRICSFLIP_ERROR_MESSAGES[name]);
    }
  });

  it('fails if a contract error is missing a friendly message', () => {
    const incompleteMessages: Record<string, string> = {
      AlreadyInitialized: 'Initialized',
    };
    const missingName = 'RoundAlreadyStarted';
    const hasMessage = Object.prototype.hasOwnProperty.call(incompleteMessages, missingName);
    expect(hasMessage).toBe(false);

    const testTable = buildErrorTable({ 1: 'AlreadyInitialized', 3: missingName }, incompleteMessages);
    expect(testTable[3].message).toBe(`Contract error: ${missingName}`);
  });

  it('verifies specific error names and codes', () => {
    expect(LYRICSFLIP_ERRORS[1].name).toBe('AlreadyInitialized');
    expect(LYRICSFLIP_ERRORS[2].name).toBe('NonExistingRound');
    expect(LYRICSFLIP_ERRORS[12].name).toBe('NotAParticipant');
    expect(LYRICSFLIP_ERRORS[19].name).toBe('RoundAlreadyFinalized');
    expect(LYRICSFLIP_ERRORS[24].name).toBe('MilestoneNotReached');
    expect(LYRICSFLIP_ERRORS[25].name).toBe('MilestoneAlreadyClaimed');
    expect(LYRICSFLIP_ERRORS[34].name).toBe('NoMoreCards');
    expect(LYRICSFLIP_ERRORS[38].name).toBe('NoActiveCard');
    expect(LYRICSFLIP_ERRORS[39].name).toBe('AlreadyAnswered');
    expect(LYRICSFLIP_ERRORS[40].name).toBe('Paused');
  });
});

describe('LYRICSFLIP_NFT_ERRORS table', () => {
  it('has entries for NFT contract error codes 1-11', () => {
    for (let i = 1; i <= 11; i++) {
      expect(LYRICSFLIP_NFT_ERRORS[i]).toBeDefined();
      expect(LYRICSFLIP_NFT_ERRORS[i].name).toBeTruthy();
      expect(LYRICSFLIP_NFT_ERRORS[i].message).toBeTruthy();
    }
  });

  it('every error variant in NFT_ERROR_NAMES has a friendly message', () => {
    for (const [codeStr, name] of Object.entries(NFT_ERROR_NAMES)) {
      const code = Number(codeStr);
      expect(NFT_ERROR_MESSAGES[name]).toBeDefined();
      expect(LYRICSFLIP_NFT_ERRORS[code].message).toBe(NFT_ERROR_MESSAGES[name]);
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
    expect(getContractErrorCode(new Error('Error(Contract, #39)'))).toBe(39);
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

describe('parseContractError', () => {
  it('produces friendly message for NoMoreCards (#34)', () => {
    const err = new Error('Simulation failed: Error(Contract, #34)');
    const res = parseContractError(err);
    expect(res.code).toBe(34);
    expect(res.message).toBe('All cards have been drawn; finalize the round.');
  });

  it('produces friendly message for AlreadyAnswered (#39)', () => {
    const err = new Error('Simulation failed: Error(Contract, #39)');
    const res = parseContractError(err);
    expect(res.code).toBe(39);
    expect(res.message).toBe('You have already answered this card.');
  });

  it('produces friendly message for Paused (#40)', () => {
    const err = new Error('Simulation failed: Error(Contract, #40)');
    const res = parseContractError(err);
    expect(res.code).toBe(40);
    expect(res.message).toBe('The game is temporarily paused.');
  });

  it('handles user rejection', () => {
    const err = new Error('User cancelled signature request');
    const res = parseContractError(err);
    expect(res.message).toBe('You rejected the signature request.');
  });

  it('falls back to generic error message', () => {
    const err = new Error('Network timeout');
    const res = parseContractError(err);
    expect(res.message).toBe('Network timeout');
  });
});
