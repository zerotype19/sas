/**
 * Scoring factors for strategy evaluation
 * All functions return scores from 0-100
 */

/**
 * Score how close delta is to target
 * Returns 100 when |delta-target| <= tolerance
 * Linearly decays to 0 at 2*tolerance
 */
export function scoreDeltaWindow(
  delta: number,
  target: number,
  tolerance: number
): number {
  const d = Math.abs(delta - target);
  if (d <= tolerance) return 100;
  if (d >= 2 * tolerance) return 0;
  return 100 * (1 - (d - tolerance) / tolerance);
}

/**
 * Score IV Rank based on strategy preferences
 * sweetSpot: [low, high] range where score is highest
 * - Credit strategies prefer high IV (60-100)
 * - Debit strategies prefer moderate IV (20-50)
 */
export function scoreIvr(
  ivRank: number | null,
  sweetSpot: [number, number]
): number {
  if (ivRank === null || ivRank < 0) return 50; // Neutral when unavailable
  
  const [lo, hi] = sweetSpot;
  
  if (ivRank < lo) {
    // Below sweet spot - still tradable for debits
    return 60 * (ivRank / lo);
  }
  
  if (ivRank > hi) {
    // Above sweet spot - penalize
    return Math.max(0, 100 - Math.min(40, (ivRank - hi) * 2));
  }
  
  // Inside sweet spot - highest scores
  const range = Math.max(1, hi - lo);
  return 80 + 20 * ((ivRank - lo) / range);
}

/**
 * Score based on trend alignment
 * Returns appropriate score based on strategy direction preference
 */
export function scoreTrendBias(
  bullishScore: number,
  bearishScore: number,
  direction: 'UP' | 'DOWN' | 'NEUTRAL'
): number {
  if (direction === 'UP') return bullishScore;
  if (direction === 'DOWN') return bearishScore;
  // Neutral: average of both
  return Math.round((bullishScore + bearishScore) / 2);
}

/**
 * Score based on liquidity metrics
 * spreadCents: bid-ask spread in cents
 * oi: open interest
 */
export function scoreLiquidity(
  spreadCents: number | null,
  oi: number | null
): number {
  let score = 100;
  
  // Penalize wide spreads
  if (spreadCents !== null && spreadCents > 10) {
    score -= Math.min(40, (spreadCents - 10) * 2);
  }
  
  // Penalize low open interest
  if (oi !== null && oi < 500) {
    score -= Math.min(40, (500 - oi) / 10);
  }
  
  return Math.max(0, score);
}

/**
 * Estimate Probability of Profit from short leg delta
 * POP ≈ 1 - |shortDelta|
 */
export function popFromShortDelta(absShortDelta: number): number {
  const p = 1 - Math.min(0.5, Math.abs(absShortDelta));
  return Math.round(p * 100);
}

/**
 * Score risk/reward ratio
 * Higher R/R is better
 */
export function scoreRR(rr: number | null): number {
  if (rr === null || rr <= 0) return 0;
  
  // Map R/R to 0-100 scale
  // R/R of 2+ is excellent (100)
  // R/R of 1 is acceptable (60)
  // R/R below 0.5 is poor (0)
  
  if (rr >= 2) return 100;
  if (rr >= 1) return 60 + 40 * ((rr - 1) / 1);
  if (rr >= 0.5) return 30 + 30 * ((rr - 0.5) / 0.5);
  return 30 * (rr / 0.5);
}

/**
 * Score DTE (Days to Expiration) preference
 * sweetSpot: [min, max] preferred range
 */
export function scoreDTE(
  dte: number,
  sweetSpot: [number, number]
): number {
  const [min, max] = sweetSpot;
  
  if (dte < min) {
    // Too short - exponential decay
    return Math.max(0, 50 * (dte / min));
  }
  
  if (dte > max) {
    // Too long - linear decay
    const excess = dte - max;
    return Math.max(0, 100 - excess);
  }
  
  // Inside sweet spot
  return 100;
}

/**
 * Score IV/RV skew spread edge
 * 
 * For credit strategies (selling options):
 * - Positive spread (IV > RV) is favorable
 * - spread >= 0.25 → 100 points
 * - spread <= 0 → 0 points
 * 
 * For debit strategies (buying options):
 * - Negative or low spread (IV ≤ RV) is favorable
 * - spread <= 0 → 100 points
 * - spread >= 0.25 → 0 points
 * 
 * @param spread - IV/RV skew spread (OTM vs ATM)
 * @param preferLow - True for debit strategies, false for credit strategies
 * @returns Score from 0-100
 */
export function scoreIvrvEdge(spread: number | undefined, preferLow = false): number {
  if (spread == null) return 50; // Neutral when unavailable
  
  if (preferLow) {
    // Debit strategies: prefer LOW IV/RV (buying when cheap)
    if (spread <= 0) return 100;
    if (spread >= 0.25) return 0;
    return Math.round(100 * (1 - spread / 0.25));
  } else {
    // Credit strategies: prefer HIGH IV/RV (selling when expensive)
    if (spread <= 0) return 0;
    if (spread >= 0.25) return 100;
    return Math.round((spread / 0.25) * 100);
  }
}

