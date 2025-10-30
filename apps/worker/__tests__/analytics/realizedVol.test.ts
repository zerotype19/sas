import { describe, it, expect } from 'vitest';
import { calcRV20, calcMultiPeriodRV } from '../../src/analytics/realizedVol';

describe('realizedVol', () => {
  it('calcRV20 - normal volatility', () => {
    // Generate 21 prices with ~10% annualized vol
    const prices = [100];
    for (let i = 1; i < 21; i++) {
      prices.push(prices[i-1] * (1 + 0.01 * (Math.random() - 0.5)));
    }
    
    const rv = calcRV20(prices);
    expect(rv).toBeGreaterThanOrEqual(5); // Floor is 5
    expect(rv).toBeLessThan(50); // Reasonable range
  });

  it('calcRV20 - throws on insufficient data', () => {
    expect(() => calcRV20([100, 101, 102])).toThrow('Need at least 21 closes');
  });

  it('calcRV20 - flat prices', () => {
    const prices = Array(21).fill(100);
    const rv = calcRV20(prices);
    expect(rv).toBe(5); // Floored at 5%
  });

  it('calcMultiPeriodRV', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
    const rv = calcMultiPeriodRV(prices);
    
    expect(rv.rv10).not.toBeNull();
    expect(rv.rv20).not.toBeNull();
    expect(rv.rv30).not.toBeNull();
  });

  it('calcMultiPeriodRV - insufficient data', () => {
    const prices = Array(15).fill(100);
    const rv = calcMultiPeriodRV(prices);
    
    expect(rv.rv10).not.toBeNull();
    expect(rv.rv20).toBeNull();
    expect(rv.rv30).toBeNull();
  });
});

