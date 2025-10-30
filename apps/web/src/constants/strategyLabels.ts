/**
 * Strategy labels and metadata for UI display
 */

export const STRATEGY_LABEL: Record<string, string> = {
  LONG_CALL: 'Long Call',
  LONG_PUT: 'Long Put',
  BULL_PUT_CREDIT: 'Bull Put Credit Spread',
  BEAR_CALL_CREDIT: 'Bear Call Credit Spread',
  IRON_CONDOR: 'Iron Condor',
  CALENDAR_CALL: 'Calendar Call Spread',
  CALENDAR_PUT: 'Calendar Put Spread',
  // Legacy names (for backward compatibility)
  BULL_PUT_CREDIT_SPREAD: 'Bull Put Credit Spread',
  LONG_CALL_MOMENTUM: 'Long Call',
};

export const STRATEGY_CATEGORY: Record<string, string> = {
  LONG_CALL: 'Momentum',
  LONG_PUT: 'Momentum',
  BULL_PUT_CREDIT: 'Income',
  BEAR_CALL_CREDIT: 'Income',
  IRON_CONDOR: 'Income',
  CALENDAR_CALL: 'Term Structure',
  CALENDAR_PUT: 'Term Structure',
  // Legacy
  BULL_PUT_CREDIT_SPREAD: 'Income',
  LONG_CALL_MOMENTUM: 'Momentum',
};

export const STRATEGY_DESCRIPTION: Record<string, string> = {
  LONG_CALL: 'Bullish directional play with defined risk',
  LONG_PUT: 'Bearish directional play with defined risk',
  BULL_PUT_CREDIT: 'Bullish premium collection with defined risk',
  BEAR_CALL_CREDIT: 'Bearish premium collection with defined risk',
  IRON_CONDOR: 'Neutral range-bound income strategy',
  CALENDAR_CALL: 'Volatility expansion play (bullish bias)',
  CALENDAR_PUT: 'Volatility expansion play (bearish bias)',
  // Legacy
  BULL_PUT_CREDIT_SPREAD: 'Bullish premium collection with defined risk',
  LONG_CALL_MOMENTUM: 'Bullish directional play with defined risk',
};

/**
 * Get display label for strategy
 */
export function getStrategyLabel(strategy: string): string {
  return STRATEGY_LABEL[strategy] || strategy;
}

/**
 * Get category badge for strategy
 */
export function getStrategyCategory(strategy: string): string {
  return STRATEGY_CATEGORY[strategy] || 'Strategy';
}

/**
 * Get description for strategy
 */
export function getStrategyDescription(strategy: string): string {
  return STRATEGY_DESCRIPTION[strategy] || '';
}

