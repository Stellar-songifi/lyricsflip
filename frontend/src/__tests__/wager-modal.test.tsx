import { parseAmountToStroops, formatAmount, MIN_WAGER_STROOPS, MAX_WAGER_STROOPS } from '../lib/utils';

describe('LF-198: Wager Escrow & Stroop Conversion', () => {
  describe('parseAmountToStroops', () => {
    it('converts integer XLM to stroops (7 decimals)', () => {
      expect(parseAmountToStroops('5')).toBe(BigInt(50_000_000));
      expect(parseAmountToStroops(1)).toBe(BigInt(10_000_000));
      expect(parseAmountToStroops('100')).toBe(BigInt(1_000_000_000));
    });

    it('converts decimal XLM amounts to stroops accurately without floating point loss', () => {
      expect(parseAmountToStroops('0.1')).toBe(BigInt(1_000_000));
      expect(parseAmountToStroops('5.25')).toBe(BigInt(52_500_000));
      expect(parseAmountToStroops('0.0000001')).toBe(BigInt(1)); // 1 stroop
      expect(parseAmountToStroops('1.2345678')).toBe(BigInt(12_345_678)); // truncated to 7 decimals
    });

    it('handles edge cases and invalid inputs gracefully', () => {
      expect(parseAmountToStroops('')).toBe(BigInt(0));
      expect(parseAmountToStroops('abc')).toBe(BigInt(0));
      expect(parseAmountToStroops('0')).toBe(BigInt(0));
    });
  });

  describe('formatAmount', () => {
    it('formats stroops back to human readable strings', () => {
      expect(formatAmount(BigInt(50_000_000))).toBe('5');
      expect(formatAmount(BigInt(52_500_000))).toBe('5.25');
      expect(formatAmount(BigInt(10_000_000_000))).toBe('1,000');
    });
  });

  describe('Wager Limits', () => {
    it('defines min wager as 1 XLM (10_000_000 stroops)', () => {
      expect(MIN_WAGER_STROOPS).toBe(BigInt(10_000_000));
    });

    it('defines max wager as 1,000 XLM (10_000_000_000 stroops)', () => {
      expect(MAX_WAGER_STROOPS).toBe(BigInt(10_000_000_000));
    });

    it('validates minimum and maximum boundaries', () => {
      const stake5 = parseAmountToStroops('5');
      expect(stake5 >= MIN_WAGER_STROOPS).toBe(true);
      expect(stake5 <= MAX_WAGER_STROOPS).toBe(true);

      const stakeBelowMin = parseAmountToStroops('0.5');
      expect(stakeBelowMin >= MIN_WAGER_STROOPS).toBe(false);

      const stakeAboveMax = parseAmountToStroops('1001');
      expect(stakeAboveMax <= MAX_WAGER_STROOPS).toBe(false);
    });
  });
});
