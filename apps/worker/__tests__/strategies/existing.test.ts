/**
 * Tests for existing strategies (Long Call + Bull Put Credit)
 * Ensure refactoring didn't break them
 */

import { describe, it, expect } from 'vitest';
import * as longCall from '../../src/strategies/longCall';
import * as bullPut from '../../src/strategies/bullPutCredit';
import { makeStrategyInput } from '../helpers/makeInput';

describe('Long Call (existing - refactored)', () => {
  it('still works after modularization', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 35,  // Low IV for buying
    });

    const { proposals } = longCall.generate(input);

    expect(proposals.length).toBeGreaterThan(0);

    const p = proposals[0];
    expect(p.strategy).toBe('LONG_CALL');
    expect(p.entry_type).toBe('DEBIT_CALL');
    expect(p.legs.length).toBe(1);
    expect(p.debit).toBeGreaterThan(0);
  });

  it('blocks when IV Rank too high', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 50,  // Above MAX_IVR threshold (40)
    });

    const { proposals } = longCall.generate(input);

    expect(proposals.length).toBe(0);
  });
});

describe('Bull Put Credit Spread (existing - refactored)', () => {
  it('still works after modularization', () => {
    const input = makeStrategyInput({
      trend: 'UP',
      ivRank: 70,  // High IV for selling
    });

    const { proposals } = bullPut.generate(input);

    expect(proposals.length).toBeGreaterThan(0);

    const p = proposals[0];
    expect(p.strategy).toBe('BULL_PUT_CREDIT');
    expect(p.entry_type).toBe('CREDIT_SPREAD');
    expect(p.legs.length).toBe(2);
    expect(p.credit).toBeGreaterThan(0);
    expect(p.width).toBe(5);
  });
});

