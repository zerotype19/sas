/**
 * Trend Detector - Simple SMA + RSI based trend analysis
 */

export type TrendSignal = 'UP' | 'DOWN' | 'NEUTRAL';

interface PriceBar {
  timestamp: number;
  close: number;
}

/**
 * Calculate Simple Moving Average
 */
function sma(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function rsi(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // Neutral default
  
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const recentChanges = changes.slice(-period);
  const gains = recentChanges.map(c => Math.max(0, c));
  const losses = recentChanges.map(c => Math.max(0, -c));
  
  const avgGain = gains.reduce((sum, g) => sum + g, 0) / period;
  const avgLoss = losses.reduce((sum, l) => sum + l, 0) / period;
  
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Detect trend from price history
 * Uses 20/50 SMA crossover + RSI confirmation
 */
export function detectTrend(prices: number[]): TrendSignal {
  if (prices.length < 50) {
    // Not enough data, return neutral
    return 'NEUTRAL';
  }
  
  const currentPrice = prices[prices.length - 1];
  const sma20 = sma(prices, 20);
  const sma50 = sma(prices, 50);
  const rsi14 = rsi(prices, 14);
  
  // Golden cross: 20 SMA > 50 SMA + RSI > 50
  if (sma20 > sma50 && currentPrice > sma20 && rsi14 > 50) {
    return 'UP';
  }
  
  // Death cross: 20 SMA < 50 SMA + RSI < 50
  if (sma20 < sma50 && currentPrice < sma20 && rsi14 < 50) {
    return 'DOWN';
  }
  
  // Weak signals
  if (currentPrice > sma20 && rsi14 > 60) return 'UP';
  if (currentPrice < sma20 && rsi14 < 40) return 'DOWN';
  
  return 'NEUTRAL';
}

/**
 * Fetch price history from D1 and detect trend
 */
export async function getTrendFromD1(
  db: D1Database,
  symbol: string,
  lookbackBars: number = 60
): Promise<TrendSignal> {
  try {
    const result = await db.prepare(`
      SELECT last as close
      FROM market_data
      WHERE symbol = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(symbol, lookbackBars).all();
    
    if (!result.results || result.results.length < 20) {
      return 'NEUTRAL'; // Not enough data
    }
    
    // Reverse to chronological order
    const prices = result.results
      .reverse()
      .map(r => r.close as number)
      .filter(p => p && p > 0);
    
    return detectTrend(prices);
  } catch (err) {
    console.error(`[TREND] Error fetching trend for ${symbol}:`, err);
    return 'NEUTRAL'; // Fail gracefully
  }
}

/**
 * Batch get trends for multiple symbols
 */
export async function getBatchTrends(
  db: D1Database,
  symbols: string[]
): Promise<Record<string, TrendSignal>> {
  const trends: Record<string, TrendSignal> = {};
  
  // Process in parallel
  const promises = symbols.map(async symbol => {
    trends[symbol] = await getTrendFromD1(db, symbol);
  });
  
  await Promise.all(promises);
  
  return trends;
}

/**
 * Log trend summary for debugging
 */
export function logTrendSummary(trends: Record<string, TrendSignal>) {
  const up = Object.values(trends).filter(t => t === 'UP').length;
  const down = Object.values(trends).filter(t => t === 'DOWN').length;
  const neutral = Object.values(trends).filter(t => t === 'NEUTRAL').length;
  
  console.log(`[TREND] Summary: UP=${up} DOWN=${down} NEUTRAL=${neutral}`);
}

