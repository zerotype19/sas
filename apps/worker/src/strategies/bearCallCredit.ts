/**
 * Bear Call Credit Spread Strategy
 * Bearish/neutral income strategy with defined risk
 * 
 * Entry Criteria:
 * - Bearish or neutral trend
 * - Short call delta: 0.20 to 0.30 (OTM calls have positive deltas)
 * - Width: $5 default
 * - High IV Rank (60-100 preferred)
 * - DTE: 30-45 days
 * - Minimum credit: 30% of width
 * 
 * Scoring:
 * - Short delta window (30%)
 * - IV Rank (high sweet spot) (25%)
 * - Liquidity (15%)
 * - R/R (15%)
 * - Trend bias (bearish) (15%)
 */

import type { StrategyInput, StrategyOutput, Proposal, ProposalLeg, OptionQuote } from '../types';
import { scoreDeltaWindow, scoreIvr, scoreTrendBias, scoreLiquidity, scoreRR, scoreDTE, popFromShortDelta, scoreIvrvEdge } from '../scoring/factors';
import { weighted } from '../scoring/compose';
import { blockForEarnings } from '../filters/events';
import { creditSpreadExits, calculatePositionSize } from '../exits/rules';
import { CREDIT_SPREAD_THRESHOLDS, RISK_LIMITS } from '../config/thresholds';

const CONFIG = {
  SHORT_DELTA_MIN: 0.20,  // Calls have positive deltas
  SHORT_DELTA_MAX: 0.30,
  SHORT_DELTA_TARGET: 0.25,
  DELTA_TOLERANCE: 0.025,
  WIDTH: 5,
  DTE_MIN: 30,
  DTE_MAX: 45,
  MIN_CREDIT_FRAC: CREDIT_SPREAD_THRESHOLDS.MIN_CREDIT_FRAC, // 30% prod, 20% test
  MAX_SPREAD_PCT: CREDIT_SPREAD_THRESHOLDS.MAX_SPREAD_PCT,
  IVR_SWEET_SPOT: [60, 100] as [number, number],
  RISK_FRACTION: RISK_LIMITS.FRACTION_PER_TRADE,
  MAX_QTY: RISK_LIMITS.MAX_QTY_PER_LEG,
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
    const calls = input.chain.quotes.filter(
      q => q.expiry === expiry && q.right === 'C' && q.delta !== null
    );
    
    // Find short call candidates near target delta
    const shortCandidates = calls
      .filter(c => {
        const delta = c.delta!;
        return delta >= CONFIG.SHORT_DELTA_MIN && delta <= CONFIG.SHORT_DELTA_MAX;
      })
      .map(c => ({
        quote: c,
        deltaDiff: Math.abs(c.delta! - CONFIG.SHORT_DELTA_TARGET),
      }))
      .sort((a, b) => a.deltaDiff - b.deltaDiff);
    
    if (shortCandidates.length === 0) continue;
    
    const shortCall = shortCandidates[0].quote;
    
    // Find long call (width away)
    const targetStrike = shortCall.strike + CONFIG.WIDTH;
    const longCall = calls.find(c => Math.abs(c.strike - targetStrike) < 0.01);
    
    if (!longCall) continue;
    
    // Calculate prices
    const shortMid = shortCall.mid ?? ((shortCall.bid ?? 0) + (shortCall.ask ?? 0)) / 2;
    const longMid = longCall.mid ?? ((longCall.bid ?? 0) + (longCall.ask ?? 0)) / 2;
    
    if (shortMid <= 0 || longMid <= 0) continue;
    
    const credit = shortMid - longMid;
    const minCredit = CONFIG.MIN_CREDIT_FRAC * CONFIG.WIDTH;
    
    if (credit < minCredit) continue;
    
    // Check spreads
    const shortSpreadPct = getSpreadPercent(shortCall);
    const longSpreadPct = getSpreadPercent(longCall);
    const maxSpread = Math.max(shortSpreadPct, longSpreadPct);
    
    if (maxSpread > CONFIG.MAX_SPREAD_PCT) continue;
    
    // Calculate position size
    const maxLoss = (CONFIG.WIDTH - credit) * 100;
    const riskBudget = CONFIG.RISK_FRACTION * input.equity;
    const qty = calculatePositionSize(maxLoss, riskBudget, CONFIG.MAX_QTY);
    
    // Calculate exits
    const exits = creditSpreadExits(credit, CONFIG.WIDTH);
    
    // Calculate R/R and POP
    const rr = maxLoss > 0 ? (credit * 100) / maxLoss : null;
    const pop = popFromShortDelta(Math.abs(shortCall.delta!));
    
    // Score components
    const deltaScore = scoreDeltaWindow(
      Math.abs(shortCall.delta!),
      Math.abs(CONFIG.SHORT_DELTA_TARGET),
      CONFIG.DELTA_TOLERANCE
    );
    
    const ivrScore = scoreIvr(input.ivRank, CONFIG.IVR_SWEET_SPOT);
    
    const trendScore = scoreTrendBias(
      30,  // Bullish score (not preferred)
      90,  // Bearish score (preferred)
      input.trend
    );
    
    const liquidityScore = scoreLiquidity(
      maxSpread * Math.max(shortMid, longMid),
      Math.min(shortCall.openInterest ?? 0, longCall.openInterest ?? 0)
    );
    
    const rrScore = rr ? scoreRR(rr) : 0;
    
    const dteScore = scoreDTE(dte, [CONFIG.DTE_MIN, CONFIG.DTE_MAX]);
    
    // Compose final score (with optional IV/RV edge)
    const useIvrvEdge = input.env?.ENABLE_IVRV_EDGE === 'true';
    const ivrvEdgeScore = useIvrvEdge && input.ivrvMetrics
      ? scoreIvrvEdge(input.ivrvMetrics.call_skew_ivrv_spread, false) // false = credit strategy
      : 50;
    
    const score = useIvrvEdge && input.ivrvMetrics
      ? weighted()
          .add('delta', deltaScore, 0.25)
          .add('ivr', ivrScore, 0.20)
          .add('ivrv_edge', ivrvEdgeScore, 0.30)
          .add('liquidity', liquidityScore, 0.10)
          .add('rr', rrScore, 0.10)
          .add('trend', trendScore, 0.05)
          .compute()
      : weighted()
          .add('delta', deltaScore, 0.30)
          .add('ivr', ivrScore, 0.25)
          .add('liquidity', liquidityScore, 0.15)
          .add('rr', rrScore, 0.15)
          .add('trend', trendScore, 0.15)
          .compute();
    
    // Create proposal
    const legs: ProposalLeg[] = [
      {
        side: 'SELL',
        type: 'CALL',
        strike: shortCall.strike,
        expiry: shortCall.expiry,
        quantity: qty,
        price: +shortMid.toFixed(2),
      },
      {
        side: 'BUY',
        type: 'CALL',
        strike: longCall.strike,
        expiry: longCall.expiry,
        quantity: qty,
        price: +longMid.toFixed(2),
      },
    ];
    
    const proposal: Proposal = {
      strategy: 'BEAR_CALL_CREDIT',
      symbol: input.symbol,
      action: 'SELL',
      entry_type: 'CREDIT_SPREAD',
      score,
      credit: +credit.toFixed(2),
      entry_price: +credit.toFixed(2),
      target_price: exits.target,
      stop_price: exits.stop,
      width: CONFIG.WIDTH,
      qty,
      dte,
      rr: rr ? +rr.toFixed(2) : null,
      pop,
      ivr: input.ivRank,
      maxLoss: maxLoss * qty,
      legs,
      rationale: `Bearish bias | Short Δ≈${shortCall.delta?.toFixed(2)} | IVR=${input.ivRank?.toFixed(0) ?? 'n/a'}% | Width=$${CONFIG.WIDTH} | Spread≤${CONFIG.MAX_SPREAD_PCT}%`,
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

