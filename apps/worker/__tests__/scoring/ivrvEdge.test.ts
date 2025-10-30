import { describe, it, expect } from 'vitest';
import { scoreIvrvEdge } from '../../src/scoring/factors';

describe('scoreIvrvEdge', () => {
  describe('Credit strategies (preferLow=false)', () => {
    it('max score when spread >= 0.25', () => {
      expect(scoreIvrvEdge(0.25, false)).toBe(100);
      expect(scoreIvrvEdge(0.30, false)).toBe(100);
      expect(scoreIvrvEdge(0.50, false)).toBe(100);
    });

    it('zero score when spread <= 0', () => {
      expect(scoreIvrvEdge(0, false)).toBe(0);
      expect(scoreIvrvEdge(-0.10, false)).toBe(0);
    });

    it('linear scaling between 0 and 0.25', () => {
      expect(scoreIvrvEdge(0.125, false)).toBe(50); // Halfway
      expect(scoreIvrvEdge(0.05, false)).toBe(20);  // 0.05/0.25 * 100
      expect(scoreIvrvEdge(0.20, false)).toBe(80);  // 0.20/0.25 * 100
    });
  });

  describe('Debit strategies (preferLow=true)', () => {
    it('max score when spread <= 0', () => {
      expect(scoreIvrvEdge(0, true)).toBe(100);
      expect(scoreIvrvEdge(-0.10, true)).toBe(100);
      expect(scoreIvrvEdge(-0.50, true)).toBe(100);
    });

    it('zero score when spread >= 0.25', () => {
      expect(scoreIvrvEdge(0.25, true)).toBe(0);
      expect(scoreIvrvEdge(0.30, true)).toBe(0);
    });

    it('linear scaling between 0 and 0.25', () => {
      expect(scoreIvrvEdge(0.125, true)).toBe(50); // Halfway
      expect(scoreIvrvEdge(0.05, true)).toBe(80);  // (1 - 0.05/0.25) * 100
      expect(scoreIvrvEdge(0.20, true)).toBe(20);  // (1 - 0.20/0.25) * 100
    });
  });

  describe('Edge cases', () => {
    it('returns 50 when spread is undefined', () => {
      expect(scoreIvrvEdge(undefined, false)).toBe(50);
      expect(scoreIvrvEdge(undefined, true)).toBe(50);
    });

    it('handles zero spread', () => {
      expect(scoreIvrvEdge(0, false)).toBe(0);  // Credit: bad (not expensive)
      expect(scoreIvrvEdge(0, true)).toBe(100); // Debit: good (not expensive)
    });
  });

  describe('Real-world scenarios', () => {
    it('High IV environment (good for credit spreads)', () => {
      const spread = 0.30; // IV 30% above RV
      expect(scoreIvrvEdge(spread, false)).toBe(100); // Excellent for selling
      expect(scoreIvrvEdge(spread, true)).toBe(0);    // Poor for buying
    });

    it('Low IV environment (good for debit spreads)', () => {
      const spread = -0.05; // IV 5% below RV
      expect(scoreIvrvEdge(spread, false)).toBe(0);   // Poor for selling
      expect(scoreIvrvEdge(spread, true)).toBe(100);  // Excellent for buying
    });

    it('Moderate IV premium (tradable for credits)', () => {
      const spread = 0.15; // IV 15% above RV
      expect(scoreIvrvEdge(spread, false)).toBe(60); // Decent for selling
      expect(scoreIvrvEdge(spread, true)).toBe(40);  // Marginal for buying
    });

    it('Neutral IV/RV (avoid both)', () => {
      const spread = 0.02; // IV slightly above RV
      expect(scoreIvrvEdge(spread, false)).toBe(8);  // Not attractive for selling
      expect(scoreIvrvEdge(spread, true)).toBe(92);  // Still okay for buying
    });
  });
});

