/**
 * Phase 2B: Options Strategy Helpers
 * 
 * - IV Rank calculation
 * - DTE selection
 * - Spread quality checks
 * - Black-Scholes delta fallback
 */

/**
 * Compute IV Rank over historical samples
 * Returns percentile of current IV vs historical range (0-100)
 * 
 * @param samples - Array of IV values, newest first
 * @returns IV Rank (0-100) or null if insufficient data
 */
export function ivRank(samples: number[]): number | null {
  if (!samples || samples.length < 5) return null;
  
  const current = samples[0]; // Newest
  const historical = samples.slice(1); // Rest
  
  const min = Math.min(...historical);
  const max = Math.max(...historical);
  
  // If no range, return neutral
  if (max <= min) return 50;
  
  // Calculate percentile
  const rank = ((current - min) / (max - min)) * 100;
  
  return Math.max(0, Math.min(100, rank)); // Clamp to 0-100
}

/**
 * Pick the expiry closest to target DTE within allowed range
 * 
 * @param expiriesISO - Array of expiry dates in YYYY-MM-DD format
 * @param todayET - Current date in ET timezone
 * @param minDTE - Minimum days to expiration
 * @param maxDTE - Maximum days to expiration
 * @returns Selected expiry or null if none in range
 */
export function pickNearestDTE(
  expiriesISO: string[], 
  todayET: Date, 
  minDTE: number, 
  maxDTE: number
): string | null {
  // Convert today to ET midnight for consistent DTE calculation
  const base = new Date(todayET.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  base.setHours(0, 0, 0, 0);
  
  // Calculate DTE for each expiry
  const candidates = expiriesISO
    .map(e => ({
      expiry: e,
      dte: Math.round((Date.parse(e) - +base) / 86400000)
    }))
    .filter(x => x.dte >= minDTE && x.dte <= maxDTE);
  
  if (candidates.length === 0) return null;
  
  // Find closest to midpoint of range
  const targetDTE = (minDTE + maxDTE) / 2;
  candidates.sort((a, b) => 
    Math.abs(a.dte - targetDTE) - Math.abs(b.dte - targetDTE)
  );
  
  return candidates[0].expiry;
}

/**
 * Calculate mid price from bid/ask/last
 * 
 * @param bid - Bid price
 * @param ask - Ask price
 * @param last - Last traded price
 * @returns Mid price or null
 */
export function mid(
  bid?: number | null, 
  ask?: number | null, 
  last?: number | null
): number | null {
  if (bid && ask && bid > 0 && ask > 0) {
    return (bid + ask) / 2;
  }
  return last ?? null;
}

/**
 * Calculate bid/ask spread as percentage of mid
 * 
 * @param bid - Bid price
 * @param ask - Ask price
 * @returns Spread percentage or 999 if invalid
 */
export function pctBidAsk(
  bid?: number | null, 
  ask?: number | null
): number {
  if (!bid || !ask || bid <= 0 || ask <= 0) return 999;
  
  const midPrice = (bid + ask) / 2;
  const spreadPct = ((ask - bid) / midPrice) * 100;
  
  return spreadPct;
}

/**
 * Black-Scholes Delta Calculation (fallback when IB doesn't provide greeks)
 * 
 * @param S - Underlying price
 * @param K - Strike price
 * @param T - Time to expiration (years)
 * @param iv - Implied volatility (as decimal, e.g., 0.30 for 30%)
 * @param r - Risk-free rate (as decimal, default 0.0)
 * @param optionType - 'C' for call, 'P' for put
 * @returns Delta value
 */
export function blackScholesDelta(
  S: number,
  K: number,
  T: number,
  iv: number,
  r: number = 0.0,
  optionType: 'C' | 'P'
): number {
  if (T <= 0) {
    // At expiration
    if (optionType === 'C') {
      return S > K ? 1.0 : 0.0;
    } else {
      return S < K ? -1.0 : 0.0;
    }
  }
  
  if (iv <= 0 || S <= 0 || K <= 0) {
    return optionType === 'C' ? 0.5 : -0.5; // Neutral fallback
  }
  
  // Calculate d1
  const d1 = (Math.log(S / K) + (r + (iv * iv) / 2) * T) / (iv * Math.sqrt(T));
  
  // Standard normal CDF approximation
  const cdf = (x: number): number => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  };
  
  const delta = cdf(d1);
  
  return optionType === 'C' ? delta : delta - 1.0;
}

/**
 * Calculate DTE (days to expiration) from expiry string
 * 
 * @param expiryISO - Expiry date in YYYY-MM-DD format
 * @returns Days to expiration
 */
export function calculateDTE(expiryISO: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryISO);
  expiry.setHours(0, 0, 0, 0);
  
  const dte = Math.round((+expiry - +today) / 86400000);
  return Math.max(0, dte);
}

/**
 * Hash legs for deduplication
 * 
 * @param legs - Array of leg objects
 * @returns MD5-like hash string
 */
export function hashLegs(legs: any[]): string {
  // Create stable string representation
  const sorted = legs
    .map(leg => `${leg.side}|${leg.type}|${leg.expiry}|${leg.strike}`)
    .sort()
    .join('::');
  
  // Simple hash (not cryptographic, just for deduplication)
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Create deduplication key for a proposal
 * 
 * @param symbol - Stock symbol
 * @param strategy - Strategy name
 * @param entryType - Entry type (CREDIT_SPREAD, DEBIT_CALL, etc.)
 * @param expiry - Expiry date
 * @param legs - Array of legs
 * @returns Deduplication key
 */
export function createDedupeKey(
  symbol: string,
  strategy: string,
  entryType: string,
  expiry: string,
  legs: any[]
): string {
  const legsHash = hashLegs(legs);
  return `${symbol}|${strategy}|${entryType}|${expiry}|${legsHash}`;
}

/**
 * Check if a proposal already exists in the last N hours
 * 
 * @param db - D1 database instance
 * @param dedupeKey - Deduplication key
 * @param hoursBack - Hours to look back (default 24)
 * @returns True if duplicate exists
 */
export async function isDuplicate(
  db: D1Database,
  dedupeKey: string,
  hoursBack: number = 24
): Promise<boolean> {
  const cutoff = Date.now() - (hoursBack * 3600 * 1000);
  
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count 
       FROM proposals 
       WHERE dedupe_key = ? AND created_at > ?`
    )
    .bind(dedupeKey, cutoff)
    .first();
  
  return (result?.count as number) > 0;
}

