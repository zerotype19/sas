/**
 * Calendar Put Spread Strategy (SCAFFOLD - NOT ENABLED)
 * Bearish volatility expansion play with defined risk
 * 
 * Structure: Sell near-term put + Buy longer-term put at same/similar strike
 * 
 * Entry Criteria:
 * - Neutral to mildly bearish trend
 * - Strike near ATM (delta ~-0.50)
 * - Front expiry: 14-21 DTE
 * - Back expiry: 45-75 DTE
 * - Positive term structure (back IV > front IV)
 * - Moderate IV Rank (10-50 preferred)
 * 
 * This is a scaffold for future implementation.
 * To enable, set CALENDAR_PUT.enabled = true in config/strategies.ts
 */

import type { StrategyInput, StrategyOutput } from '../types';

export function generate(input: StrategyInput): StrategyOutput {
  // TODO: Implement calendar put logic (mirror of calendar call with puts)
  // For now, return empty proposals
  return { proposals: [] };
}

