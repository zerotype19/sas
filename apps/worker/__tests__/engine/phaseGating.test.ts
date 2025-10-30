/**
 * Phase Gating Tests
 * Ensure SAS_PHASE environment variable controls which strategies run
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { STRATEGIES, getCurrentPhase, isStrategyAllowed } from '../../src/config/strategies';

describe('Phase Gating', () => {
  const originalPhase = process.env.SAS_PHASE;

  afterEach(() => {
    process.env.SAS_PHASE = originalPhase;
  });

  it('defaults to Phase 1 when SAS_PHASE not set', () => {
    delete process.env.SAS_PHASE;
    expect(getCurrentPhase()).toBe(1);
  });

  it('reads SAS_PHASE from environment', () => {
    process.env.SAS_PHASE = '2';
    expect(getCurrentPhase()).toBe(2);

    process.env.SAS_PHASE = '3';
    expect(getCurrentPhase()).toBe(3);
  });

  it('Phase 1: only allows Phase 1 strategies', () => {
    process.env.SAS_PHASE = '1';

    expect(isStrategyAllowed(STRATEGIES.LONG_CALL.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.BULL_PUT_CREDIT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.LONG_PUT.phase)).toBe(false);
    expect(isStrategyAllowed(STRATEGIES.BEAR_CALL_CREDIT.phase)).toBe(false);
    expect(isStrategyAllowed(STRATEGIES.IRON_CONDOR.phase)).toBe(false);
    expect(isStrategyAllowed(STRATEGIES.CALENDAR_CALL.phase)).toBe(false);
  });

  it('Phase 2: allows Phase 1 + 2 strategies', () => {
    process.env.SAS_PHASE = '2';

    expect(isStrategyAllowed(STRATEGIES.LONG_CALL.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.BULL_PUT_CREDIT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.LONG_PUT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.BEAR_CALL_CREDIT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.IRON_CONDOR.phase)).toBe(false);
    expect(isStrategyAllowed(STRATEGIES.CALENDAR_CALL.phase)).toBe(false);
  });

  it('Phase 3: allows all strategies', () => {
    process.env.SAS_PHASE = '3';

    expect(isStrategyAllowed(STRATEGIES.LONG_CALL.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.BULL_PUT_CREDIT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.LONG_PUT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.BEAR_CALL_CREDIT.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.IRON_CONDOR.phase)).toBe(true);
    expect(isStrategyAllowed(STRATEGIES.CALENDAR_CALL.phase)).toBe(true);
  });

  it('Calendar Put is disabled by default', () => {
    expect(STRATEGIES.CALENDAR_PUT.enabled).toBe(false);
  });

  it('All Phase 1-3 strategies except Calendar Put are enabled', () => {
    expect(STRATEGIES.LONG_CALL.enabled).toBe(true);
    expect(STRATEGIES.BULL_PUT_CREDIT.enabled).toBe(true);
    expect(STRATEGIES.LONG_PUT.enabled).toBe(true);
    expect(STRATEGIES.BEAR_CALL_CREDIT.enabled).toBe(true);
    expect(STRATEGIES.IRON_CONDOR.enabled).toBe(true);
    expect(STRATEGIES.CALENDAR_CALL.enabled).toBe(true);
  });
});

