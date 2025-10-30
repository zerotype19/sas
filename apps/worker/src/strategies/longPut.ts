/**
 * Long Put Strategy
 * Bearish directional play with defined risk
 * 
 * Entry Criteria:
 * - Bearish trend
 * - Target delta: -0.60 (±0.05)
 * - Moderate IV Rank (30-70 preferred)
 * - DTE: 30-60 days
 * - Good liquidity
 * 
 * Scoring:
 * - Delta window (35%)
 * - Trend bias (bearish) (30%)
 * - IV Rank (15%)
 * - Liquidity (10%)
 * - R/R (10%)
 */

import type { StrategyInput, StrategyOutput, Proposal, ProposalLeg, OptionQuote } from '../types';
import { scoreDeltaWindow, scoreIvr, scoreTrendBias, scoreLiquidity, scoreRR, scoreDTE, scoreIvrvBuyEdge } from '../scoring/factors';
import { weighted } from '../scoring/compose';
import { blockForEarnings } from '../filters/events';
import { debitExits, calculatePositionSize } from '../exits/rules';

const CONFIG = {
  TARGET_DELTA: -0.60,
  DELTA_TOLERANCE: 0.05,
  DTE_MIN: 30,
  DTE_MAX: 60,
  MAX_SPREAD_PCT: 20,  // Max 20% bid-ask spread
  IVR_SWEET_SPOT: [30, 70] as [number, number],
  RISK_FRACTION: 0.005,  // 0.5% of equity per trade
  MAX_QTY: 5,
};

export function generate(input: StrategyInput): StrategyOutput {
  const proposals: Proposal[] = [];
  
  // Block if near earnings
  if (blockForEarnings(input.earningsDate, input.todayISO)) {
    return { proposals };
  }
  
  // Only consider bearish or neutral trends
  if (input.trend === 'UP') {
    return { proposals };
  }
  
  // Filter expiries in DTE range
  const validExpiries = input.chain.expiries
    .map(exp => ({
      expiry: exp,
      dte: getDTE(exp, input.todayISO),
    }))
    .filter(e => e.dte >= CONFIG.DTE_MIN && e.dte <= CONFIG.DTE_MAX)
    .sort((a, b) => a.dte - b.dte);
  
  if (validExpiries.length === 0) {
    return { proposals };
  }
  
  // Analyze each expiry
  for (const { expiry, dte } of validExpiries) {
    const puts = input.chain.quotes.filter(
      q => q.expiry === expiry && q.right === 'P' && q.delta !== null
    );
    
    // Find puts near target delta
    const candidates = puts
      .filter(p => {
        const absDelta = Math.abs(p.delta!);
        return Math.abs(absDelta - Math.abs(CONFIG.TARGET_DELTA)) <= CONFIG.DELTA_TOLERANCE * 2;
      })
      .map(p => ({
        quote: p,
        deltaDiff: Math.abs(Math.abs(p.delta!) - Math.abs(CONFIG.TARGET_DELTA)),
      }))
      .sort((a, b) => a.deltaDiff - b.deltaDiff);
    
    if (candidates.length === 0) continue;
    
    const longPut = candidates[0].quote;
    
    // Calculate price and spread
    const price = longPut.mid ?? ((longPut.bid ?? 0) + (longPut.ask ?? 0)) / 2;
    if (price <= 0) continue;
    
    const spreadPct = getSpreadPercent(longPut);
    if (spreadPct > CONFIG.MAX_SPREAD_PCT) continue;
    
    // Calculate position size
    const perContractRisk = price * 100;
    const riskBudget = CONFIG.RISK_FRACTION * input.equity;
    const qty = calculatePositionSize(perContractRisk, riskBudget, CONFIG.MAX_QTY);
    
    // Calculate exits
    const exits = debitExits(price);
    
    // Calculate R/R (undefined upside, defined risk)
    const rr = (exits.target - price) / (price - exits.stop);
    
    // Score components
    const deltaScore = scoreDeltaWindow(
      Math.abs(longPut.delta!),
      Math.abs(CONFIG.TARGET_DELTA),
      CONFIG.DELTA_TOLERANCE
    );
    
    const trendScore = scoreTrendBias(
      30,  // Bullish score (not preferred)
      90,  // Bearish score (preferred)
      input.trend
    );
    
    const ivrScore = scoreIvr(input.ivRank, CONFIG.IVR_SWEET_SPOT);
    
    const liquidityScore = scoreLiquidity(
      spreadPct * price,  // Convert to cents
      longPut.openInterest ?? null
    );
    
    const rrScore = scoreRR(rr);
    
    const dteScore = scoreDTE(dte, [CONFIG.DTE_MIN, CONFIG.DTE_MAX]);
    
    // Compose final score with optional IV/RV buy edge
    const useIvrv = input?.env?.ENABLE_IVRV_EDGE === 'true';
    const putSkew = input.ivrvMetrics?.put_skew_ivrv_spread;
    const edgeScore = useIvrv ? scoreIvrvBuyEdge(putSkew) : 50;
    
    const score = useIvrv
      ? weighted()
          .add('trend', trendScore, 0.40)
          .add('ivr', ivrScore, 0.25)
          .add('ivrv_buy_edge', edgeScore, 0.20)
          .add('liquidity', liquidityScore, 0.15)
          .compute()
      : weighted()
          .add('delta', deltaScore, 0.35)
          .add('trend', trendScore, 0.30)
          .add('ivr', ivrScore, 0.15)
          .add('liquidity', liquidityScore, 0.10)
          .add('rr', rrScore, 0.10)
          .compute();
    
    // Create proposal
    const leg: ProposalLeg = {
      side: 'BUY',
      type: 'PUT',
      strike: longPut.strike,
      expiry: longPut.expiry,
      quantity: qty,
      price: +price.toFixed(2),
    };
    
    const proposal: Proposal = {
      strategy: 'LONG_PUT',
      symbol: input.symbol,
      action: 'BUY',
      entry_type: 'DEBIT_PUT',
      score,
      debit: +price.toFixed(2),
      entry_price: +price.toFixed(2),
      target_price: exits.target,
      stop_price: exits.stop,
      qty,
      dte,
      rr: +rr.toFixed(2),
      pop: null,  // Can estimate from delta if needed
      ivr: input.ivRank,
      maxLoss: perContractRisk * qty,
      legs: [leg],
      rationale: `Bearish momentum | Delta≈${longPut.delta?.toFixed(2)} | IVR=${input.ivRank?.toFixed(0) ?? 'n/a'}% | Spread≤${CONFIG.MAX_SPREAD_PCT}%`,
    };
    
    proposals.push(proposal);
    
    // Limit to top 2 expiries
    if (proposals.length >= 2) break;
  }
  
  return { proposals };
}

// Helper functions

function getDTE(expiryISO: string, todayISO: string): number {
  const expiry = new Date(expiryISO);
  const today = new Date(todayISO);
  const diff = +expiry - +today;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function getSpreadPercent(quote: OptionQuote): number {
  if (quote.bid === null || quote.ask === null || quote.bid <= 0) return 100;
  return ((quote.ask - quote.bid) / quote.bid) * 100;
}

