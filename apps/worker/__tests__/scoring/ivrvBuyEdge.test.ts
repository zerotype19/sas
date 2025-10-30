import { describe, it, expect } from 'vitest';
import { scoreIvrvBuyEdge } from '../../src/scoring/factors';

describe('scoreIvrvBuyEdge', () => {
  it('prefers deeply negative spreads (cheap options)', () => {
    expect(scoreIvrvBuyEdge(-0.25)).toBe(100);
    expect(scoreIvrvBuyEdge(-0.30)).toBe(100);
  });

  it('rewards moderately negative spreads', () => {
    const score = scoreIvrvBuyEdge(-0.125);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(100);
  });

  it('neutral at zero', () => {
    expect(scoreIvrvBuyEdge(0)).toBe(50);
  });

  it('penalizes positive spreads (expensive options)', () => {
    const score = scoreIvrvBuyEdge(0.10);
    expect(score).toBeLessThan(50);
    expect(score).toBeGreaterThan(0);
  });

  it('heavily penalizes high positive spreads', () => {
    expect(scoreIvrvBuyEdge(0.25)).toBe(0);
    expect(scoreIvrvBuyEdge(0.30)).toBe(0);
  });

  it('returns neutral score when spread is undefined', () => {
    expect(scoreIvrvBuyEdge(undefined)).toBe(50);
  });

  it('linear interpolation in negative range', () => {
    // Test mid-point: -0.125 should be 75 (halfway between 50 and 100)
    expect(scoreIvrvBuyEdge(-0.125)).toBe(75);
  });

  it('linear interpolation in positive range', () => {
    // Test mid-point: 0.125 should be 25 (halfway between 50 and 0)
    expect(scoreIvrvBuyEdge(0.125)).toBe(25);
  });
});

