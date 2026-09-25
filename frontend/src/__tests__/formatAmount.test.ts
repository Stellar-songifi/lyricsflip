import { formatAmount } from '@/lib/utils';

describe('formatAmount', () => {
  it('formats zero', () => {
    expect(formatAmount(BigInt(0))).toBe('0');
  });

  it('formats fractional amounts and trims trailing zeros', () => {
    expect(formatAmount(BigInt(1))).toBe('0.0000001');
    expect(formatAmount(BigInt(15_000_000))).toBe('1.5');
    expect(formatAmount(BigInt(123_456_789))).toBe('12.3456789');
  });

  it('formats large amounts with thousands separators', () => {
    expect(formatAmount(BigInt('186780000000'))).toBe('18,678');
    expect(formatAmount(BigInt('170141183460469231731687303715884105727'))).toBe(
      '17,014,118,346,046,923,173,168,730,371,588.4105727',
    );
  });

  it('supports negative values, number/string input and custom decimals', () => {
    expect(formatAmount(BigInt(-25_000_000))).toBe('-2.5');
    expect(formatAmount('1000', 2)).toBe('10');
    expect(formatAmount(1234, 0)).toBe('1,234');
  });
});
