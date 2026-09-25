import {
  LYRICSFLIP_ERRORS,
  LYRICSFLIP_NFT_ERRORS,
  parseContractError,
} from '@/lib/stellar/errors';

const sdkError = (code: number) =>
  new Error(
    `HostError: Error(Contract, #${code})\nEvent log (newest first): ...`,
  );

describe('parseContractError', () => {
  it.each(Object.entries(LYRICSFLIP_ERRORS))(
    'maps lyricsflip error #%s',
    (code, info) => {
      expect(parseContractError(sdkError(Number(code)))).toEqual({
        code: Number(code),
        message: info.message,
      });
    },
  );

  it.each(Object.entries(LYRICSFLIP_NFT_ERRORS))(
    'maps NFT error #%s',
    (code, info) => {
      expect(
        parseContractError(sdkError(Number(code)), LYRICSFLIP_NFT_ERRORS),
      ).toEqual({
        code: Number(code),
        message: info.message,
      });
    },
  );

  it('falls back for an unknown contract code', () => {
    expect(parseContractError(sdkError(999))).toEqual({
      code: 999,
      message: 'Contract error #999.',
    });
  });

  it('reports a rejected signature', () => {
    expect(parseContractError(new Error('User rejected the request'))).toEqual({
      message: 'You rejected the signature request.',
    });
  });

  it('passes other errors through', () => {
    expect(parseContractError(new Error('Network down'))).toEqual({
      message: 'Network down',
    });
  });
});
