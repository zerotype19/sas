/**
 * Iron Condor Strategy Tests
 */

import { describe, it, expect } from 'vitest';
import * as condor from '../../src/strategies/ironCondor';
import { makeStrategyInput } from '../helpers/makeInput';

describe('Iron Condor (neutral income)', () => {
  it('creates a 4-leg neutral income structure', () => {
    const input = makeStrategyInput({
      trend: 'NEUTRAL',
      ivRank: 35,
      spot: 100,
    });

    const { proposals } = condor.generate(input);

    expect(proposals.length).toBeGreaterThan(0);

    const p = proposals[0];
    expect(p.strategy).toBe('IRON_CONDOR');
    expect(p.entry_type).toBe('IRON_CONDOR');
    expect(p.action).toBe('SELL');
    expect(p.legs.length).toBe(4);

    // Verify structure: 2 call legs + 2 put legs
    const calls = p.legs.filter(l => l.type === 'CALL');
    const puts = p.legs.filter(l => l.type === 'PUT');

    expect(calls.length).toBe(2);
    expect(puts.length).toBe(2);

    // Each pair should have SELL and BUY
    const shortCall = calls.find(l => l.side === 'SELL');
    const longCall = calls.find(l => l.side === 'BUY');
    const shortPut = puts.find(l => l.side === 'SELL');
    const longPut = puts.find(l => l.side === 'BUY');

    expect(shortCall).toBeDefined();
    expect(longCall).toBeDefined();
    expect(shortPut).toBeDefined();
    expect(longPut).toBeDefined();

    expect(p.credit).toBeGreaterThan(0);
    expect(p.score).toBeGreaterThanOrEqual(50);
  });

  it('blocks near earnings (<=7d)', () => {
    // Earnings 3 days from now
    const today = new Date();
    const e = new Date(today);
    e.setUTCDate(today.getUTCDate() + 3);

    const input = makeStrategyInput({
      trend: 'NEUTRAL',
      ivRank: 35,
      earningsDate: e.toISOString().slice(0, 10),
    });

    const { proposals } = condor.generate(input);

    expect(proposals.length).toBe(0);
  });

  it('allows when earnings are 8+ days away', () => {
    // Earnings 10 days from now
    const today = new Date();
    const e = new Date(today);
    e.setUTCDate(today.getUTCDate() + 10);

    const input = makeStrategyInput({
      trend: 'NEUTRAL',
      ivRank: 35,
      earningsDate: e.toISOString().slice(0, 10),
    });

    const { proposals } = condor.generate(input);

    // Should not block
    expect(proposals.length).toBeGreaterThan(0);
  });

  it('width is $5 per side', () => {
    const input = makeStrategyInput({
      trend: 'NEUTRAL',
      ivRank: 35,
    });

    const { proposals } = condor.generate(input);

    const p = proposals[0];
    expect(p.width).toBe(5);

    // Check call spread width
    const calls = p.legs.filter(l => l.type === 'CALL').map(l => l.strike).sort((a, b) => a - b);
    expect(calls[1] - calls[0]).toBe(5);

    // Check put spread width
    const puts = p.legs.filter(l => l.type === 'PUT').map(l => l.strike).sort((a, b) => a - b);
    expect(puts[1] - puts[0]).toBe(5);
  });
});

