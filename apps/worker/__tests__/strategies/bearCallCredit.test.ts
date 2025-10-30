/**
 * Bear Call Credit Spread Strategy Tests
 */

import { describe, it, expect } from 'vitest';
import * as bearCall from '../../src/strategies/bearCallCredit';
import { makeStrategyInput } from '../helpers/makeInput';

describe('Bear Call Credit Spread', () => {
  it('emits a 2-leg credit spread with POP in a sane range', () => {
    const input = makeStrategyInput({
      trend: 'DOWN',
      ivRank: 70,
      spot: 100,
    });

    const { proposals } = bearCall.generate(input);

    expect(proposals.length).toBeGreaterThan(0);

    const p = proposals[0];
    expect(p.strategy).toBe('BEAR_CALL_CREDIT');
    expect(p.entry_type).toBe('CREDIT_SPREAD');
    expect(p.action).toBe('SELL');
    expect(p.legs.length).toBe(2);

    // Verify leg structure: SELL call + BUY call
    const shortLeg = p.legs.find(l => l.side === 'SELL');
    const longLeg = p.legs.find(l => l.side === 'BUY');

    expect(shortLeg).toBeDefined();
    expect(longLeg).toBeDefined();
    expect(shortLeg!.type).toBe('CALL');
    expect(longLeg!.type).toBe('CALL');
    expect(longLeg!.strike).toBeGreaterThan(shortLeg!.strike); // Long call above short

    expect(p.credit).toBeGreaterThan(0);
    expect(p.pop).toBeGreaterThanOrEqual(60);
    expect(p.pop).toBeLessThanOrEqual(90);
    expect(p.rr).toBeGreaterThan(0);
  });

  it('suppresses when trend is UP (bullish)', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 70,
    });

    const { proposals } = bearCall.generate(input);

    expect(proposals.length).toBe(0);
  });

  it('sets width to $5', () => {
    const input = makeStrategyInput({
      trend: 'DOWN',
      ivRank: 70,
    });

    const { proposals } = bearCall.generate(input);

    const p = proposals[0];
    expect(p.width).toBe(5);

    // Verify strike difference
    const strikes = p.legs.map(l => l.strike).sort((a, b) => a - b);
    expect(strikes[1] - strikes[0]).toBe(5);
  });
});

