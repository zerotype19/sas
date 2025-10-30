import { describe, it, expect } from 'vitest';
import { selectByDelta, calcIvrvMetrics, type OptionChain, type OptionQuote } from '../../src/analytics/ivrv';

describe('ivrv', () => {
  describe('selectByDelta', () => {
    const quotes: OptionQuote[] = [
      { symbol: 'SPY', expiry: '2024-12-15', strike: 580, right: 'C', delta: 0.50, iv: 15 },
      { symbol: 'SPY', expiry: '2024-12-15', strike: 590, right: 'C', delta: 0.20, iv: 18 },
      { symbol: 'SPY', expiry: '2024-12-15', strike: 570, right: 'P', delta: -0.50, iv: 16 },
      { symbol: 'SPY', expiry: '2024-12-15', strike: 560, right: 'P', delta: -0.20, iv: 19 },
    ];

    it('finds ATM call', () => {
      const q = selectByDelta(quotes, 0.50, 'CALL', 0.10);
      expect(q).not.toBeNull();
      expect(q?.strike).toBe(580);
      expect(q?.delta).toBe(0.50);
    });

    it('finds OTM call', () => {
      const q = selectByDelta(quotes, 0.20, 'CALL', 0.05);
      expect(q).not.toBeNull();
      expect(q?.strike).toBe(590);
      expect(q?.delta).toBe(0.20);
    });

    it('finds ATM put', () => {
      const q = selectByDelta(quotes, -0.50, 'PUT', 0.10);
      expect(q).not.toBeNull();
      expect(q?.strike).toBe(570);
      expect(q?.delta).toBe(-0.50);
    });

    it('finds OTM put', () => {
      const q = selectByDelta(quotes, -0.20, 'PUT', 0.05);
      expect(q).not.toBeNull();
      expect(q?.strike).toBe(560);
      expect(q?.delta).toBe(-0.20);
    });

    it('returns null when no match', () => {
      const q = selectByDelta(quotes, 0.80, 'CALL', 0.05);
      expect(q).toBeNull();
    });
  });

  describe('calcIvrvMetrics', () => {
    const chain: OptionChain = {
      symbol: 'SPY',
      expiries: new Set(['2024-12-15', '2025-01-17']),
      quotes: [
        // Front month (2024-12-15)
        { symbol: 'SPY', expiry: '2024-12-15', strike: 580, right: 'C', delta: 0.50, iv: 20, mid: 5.00 },
        { symbol: 'SPY', expiry: '2024-12-15', strike: 590, right: 'C', delta: 0.20, iv: 24, mid: 2.50 },
        { symbol: 'SPY', expiry: '2024-12-15', strike: 570, right: 'P', delta: -0.50, iv: 21, mid: 4.80 },
        { symbol: 'SPY', expiry: '2024-12-15', strike: 560, right: 'P', delta: -0.20, iv: 25, mid: 2.30 },
        // Back month (2025-01-17) - should be ignored
        { symbol: 'SPY', expiry: '2025-01-17', strike: 580, right: 'C', delta: 0.50, iv: 22, mid: 6.00 },
      ],
    };

    it('calculates comprehensive IV/RV metrics', () => {
      const rv20 = 15; // 15% realized vol
      const result = calcIvrvMetrics({ chain, rv20 });

      // Basic RV
      expect(result.rv20).toBe(15);

      // ATM IV (average of call and put)
      expect(result.atm_iv).toBeCloseTo(20.5, 1);

      // OTM IVs
      expect(result.otm_call_iv).toBe(24);
      expect(result.otm_put_iv).toBe(25);

      // IV/RV ratios
      expect(result.atm_ivrv_ratio).toBeCloseTo(1.37, 2); // 20.5 / 15
      expect(result.otm_call_ivrv_ratio).toBeCloseTo(1.60, 2); // 24 / 15
      expect(result.otm_put_ivrv_ratio).toBeCloseTo(1.67, 2); // 25 / 15

      // IV premiums
      expect(result.iv_premium_atm_pct).toBeCloseTo(36.67, 1); // (20.5 - 15) / 15 * 100

      // Skew spreads
      expect(result.call_skew_ivrv_spread).toBeCloseTo(0.23, 2); // 1.60 - 1.37
      expect(result.put_skew_ivrv_spread).toBeCloseTo(0.30, 2); // 1.67 - 1.37
    });

    it('handles low RV (high IV/RV ratio)', () => {
      const rv20 = 10; // Low realized vol
      const result = calcIvrvMetrics({ chain, rv20 });

      expect(result.atm_ivrv_ratio).toBeCloseTo(2.05, 2); // 20.5 / 10
      expect(result.iv_premium_atm_pct).toBeCloseTo(105, 0); // (20.5 - 10) / 10 * 100
    });

    it('handles high RV (low IV/RV ratio)', () => {
      const rv20 = 25; // High realized vol
      const result = calcIvrvMetrics({ chain, rv20 });

      expect(result.atm_ivrv_ratio).toBeCloseTo(0.82, 2); // 20.5 / 25
      expect(result.iv_premium_atm_pct).toBeCloseTo(-18, 0); // (20.5 - 25) / 25 * 100
    });

    it('handles missing OTM quotes gracefully', () => {
      const sparseChain: OptionChain = {
        symbol: 'SPY',
        expiries: new Set(['2024-12-15']),
        quotes: [
          { symbol: 'SPY', expiry: '2024-12-15', strike: 580, right: 'C', delta: 0.50, iv: 20, mid: 5.00 },
        ],
      };

      const result = calcIvrvMetrics({ chain: sparseChain, rv20: 15 });

      expect(result.atm_iv).toBe(20);
      expect(result.otm_call_iv).toBeUndefined();
      expect(result.otm_put_iv).toBeUndefined();
      expect(result.call_skew_ivrv_spread).toBeUndefined();
      expect(result.put_skew_ivrv_spread).toBeUndefined();
    });
  });
});

