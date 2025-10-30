/**
 * Realized Volatility Calculations
 * Computes historical volatility from price series
 */

/**
 * Calculate 20-day realized volatility
 * @param closes - Array of closing prices (most recent first)
 * @returns Annualized realized volatility as percentage
 */
export function calcRV20(closes: number[]): number {
  if (closes.length < 21) {
    throw new Error('Need at least 21 closes for RV20');
  }
  
  const returns: number[] = [];
  for (let i = 0; i < 20; i++) {
    returns.push(Math.log(closes[i] / closes[i + 1]));
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.map(r => (r - mean) * (r - mean)).reduce((a, b) => a + b, 0) / returns.length;
  const annualized = Math.sqrt(variance) * Math.sqrt(252) * 100;
  
  // Floor at 5% to avoid division issues
  return Math.max(5, annualized);
}

/**
 * Calculate realized volatility for a specific period
 * @param closes - Array of closing prices (most recent first)
 * @param period - Number of periods to calculate over
 * @returns Annualized realized volatility as percentage
 */
function calcRV(closes: number[], period: number): number {
  const returns: number[] = [];
  for (let i = 0; i < period; i++) {
    returns.push(Math.log(closes[i] / closes[i + 1]));
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.map(r => (r - mean) * (r - mean)).reduce((a, b) => a + b, 0) / returns.length;
  
  return Math.max(5, Math.sqrt(variance) * Math.sqrt(252) * 100);
}

/**
 * Calculate realized volatility for multiple periods
 * @param closes - Array of closing prices (most recent first)
 * @returns Object with rv10, rv20, rv30 (or null if insufficient data)
 */
export function calcMultiPeriodRV(closes: number[]): {
  rv10: number | null;
  rv20: number | null;
  rv30: number | null;
} {
  return {
    rv10: closes.length >= 11 ? calcRV(closes, 10) : null,
    rv20: closes.length >= 21 ? calcRV(closes, 20) : null,
    rv30: closes.length >= 31 ? calcRV(closes, 30) : null,
  };
}

