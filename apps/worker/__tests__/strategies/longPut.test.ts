/**
 * Long Put Strategy Tests
 */

import { describe, it, expect } from 'vitest';
import * as longPut from '../../src/strategies/longPut';
import { makeStrategyInput } from '../helpers/makeInput';

describe('Long Put (bearish momentum)', () => {
  it('emits at least one bearish debit proposal with decent score', () => {
    const input = makeStrategyInput({
      trend: 'DOWN',
      ivRank: 45,
      spot: 100,
    });

    const { proposals } = longPut.generate(input);

    expect(Array.isArray(proposals)).toBe(true);
    expect(proposals.length).toBeGreaterThan(0);

    const p = proposals[0];
    expect(p).toBeDefined();
    expect(p.strategy).toBe('LONG_PUT');
    expect(p.entry_type).toBe('DEBIT_PUT');
    expect(p.action).toBe('BUY');
    expect(p.legs.length).toBe(1);
    expect(p.legs[0].side).toBe('BUY');
    expect(p.legs[0].type).toBe('PUT');
    expect(p.debit).toBeGreaterThan(0);
    expect(p.score).toBeGreaterThanOrEqual(40); // Reasonable threshold
  });

  it('suppresses when trend is UP (bullish)', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 45,
    });

    const { proposals } = longPut.generate(input);

    expect(proposals.length).toBe(0);
  });

  it('works with neutral trend', () => {
    const input = makeStrategyInput({
      trend: 'NEUTRAL',
      ivRank: 45,
    });

    const { proposals } = longPut.generate(input);

    // Should allow neutral (not just bearish)
    expect(proposals.length).toBeGreaterThan(0);
  });

  it('sets proper risk parameters', () => {
    const input = makeStrategyInput({
      trend: 'DOWN',
      ivRank: 45,
      equity: 100000,
    });

    const { proposals } = longPut.generate(input);

    const p = proposals[0];
    expect(p.qty).toBeGreaterThan(0);
    expect(p.qty).toBeLessThanOrEqual(5); // MAX_QTY
    expect(p.maxLoss).toBeGreaterThan(0);
    expect(p.maxLoss).toBeLessThanOrEqual(10000); // MAX_NOTIONAL
  });
});

