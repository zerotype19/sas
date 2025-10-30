/**
 * Calendar Call Spread Strategy Tests
 */

import { describe, it, expect } from 'vitest';
import * as calendar from '../../src/strategies/calendarCall';
import { makeStrategyInput } from '../helpers/makeInput';

describe('Calendar Call Spread (vol expansion)', () => {
  it('emits 2-leg mixed-expiry debit when back IV > front IV', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 30,
      termSkew: { frontIV: 0.22, backIV: 0.28 },
      ivFront: 0.22,
      ivBack: 0.28,
      dteFront: 21,  // Front: 21 DTE
      dteBack: 60,   // Back: 60 DTE
    });

    const { proposals } = calendar.generate(input);

    expect(proposals.length).toBeGreaterThan(0);

    const p = proposals[0];
    expect(p.strategy).toBe('CALENDAR_CALL');
    expect(p.entry_type).toBe('CALENDAR');
    expect(p.action).toBe('BUY');
    expect(p.legs.length).toBe(2);

    // Verify leg structure: SELL front + BUY back
    const shortLeg = p.legs.find(l => l.side === 'SELL');
    const longLeg = p.legs.find(l => l.side === 'BUY');

    expect(shortLeg).toBeDefined();
    expect(longLeg).toBeDefined();
    expect(shortLeg!.type).toBe('CALL');
    expect(longLeg!.type).toBe('CALL');

    // Different expiries
    expect(shortLeg!.expiry).not.toBe(longLeg!.expiry);

    // Net debit
    expect(p.debit).toBeGreaterThan(0);
    expect(p.score).toBeGreaterThanOrEqual(50);
  });

  it('suppresses when term structure is not positive', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 30,
      termSkew: { frontIV: 0.28, backIV: 0.22 }, // Inverted!
      ivFront: 0.28,
      ivBack: 0.22,
    });

    const { proposals } = calendar.generate(input);

    expect(proposals.length).toBe(0);
  });

  it('suppresses when term structure is missing', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 30,
      termSkew: undefined,
    });

    const { proposals } = calendar.generate(input);

    expect(proposals.length).toBe(0);
  });

  it('suppresses on bearish trend', () => {
    const input = makeStrategyInput({
      trend: 'DOWN',
      ivRank: 30,
      termSkew: { frontIV: 0.22, backIV: 0.28 },
      ivFront: 0.22,
      ivBack: 0.28,
    });

    const { proposals } = calendar.generate(input);

    expect(proposals.length).toBe(0);
  });

  it('requires minimum term skew (2+ percentage points)', () => {
    // Barely positive term structure (< 2 pts)
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 30,
      termSkew: { frontIV: 0.25, backIV: 0.26 }, // Only 1 pt difference
      ivFront: 0.25,
      ivBack: 0.26,
    });

    const { proposals } = calendar.generate(input);

    // Should be blocked (< 2 pts)
    expect(proposals.length).toBe(0);
  });
});

