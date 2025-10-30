/**
 * Strategy input builder for testing
 */

import type { StrategyInput } from '../../src/types';
import { makeChain, type ChainParams } from './mockChain';

export function makeStrategyInput(overrides: Partial<StrategyInput & ChainParams> = {}): StrategyInput {
  const { chain, spot, front, back } = makeChain({
    spot: overrides.spot ?? 100,
    ivFront: overrides.ivFront ?? 0.50,  // Higher IV for testing (50%)
    ivBack: overrides.ivBack ?? 0.55,
    dteFront: overrides.dteFront ?? 35,  // Default to credit spread sweet spot
    dteBack: overrides.dteBack ?? 60,
  });

  return {
    symbol: overrides.symbol ?? 'TEST',
    chain,
    spot,
    ivRank: overrides.ivRank ?? 55, // 0-100
    trend: overrides.trend ?? 'NEUTRAL', // 'UP' | 'DOWN' | 'NEUTRAL'
    earningsDate: overrides.earningsDate, // optional
    todayISO: overrides.todayISO ?? new Date().toISOString().slice(0, 10),
    equity: overrides.equity ?? 100000, // $100k default
    termSkew: overrides.termSkew ?? {
      frontIV: overrides.ivFront ?? 0.50,
      backIV: overrides.ivBack ?? 0.55,
    },
  };
}

