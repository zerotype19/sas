/**
 * Iron Condor Strategy
 * Neutral range-bound income strategy with defined risk
 * 
 * Structure: Sell OTM call spread + Sell OTM put spread
 * 
 * Entry Criteria:
 * - Neutral trend preferred
 * - Short deltas: ±0.20 to ±0.25 (balanced)
 * - Width: $5 per side
 * - Moderate IV Rank (20-60 preferred)
 * - DTE: 30-45 days
 * - Minimum total credit: 30% of width
 * - NOT near earnings (7-day buffer)
 * 
 * Scoring:
 * - Condor symmetry (balanced deltas) (20%)
 * - IV Rank (mid-range sweet spot) (25%)
 * - Liquidity (both sides) (20%)
 * - R/R (15%)
 * - Neutral trend (20%)
 */

import type { StrategyInput, StrategyOutput, Proposal, ProposalLeg, OptionQuote } from '../types';
import { scoreDeltaWindow, scoreIvr, scoreTrendBias, scoreLiquidity, scoreRR, scoreDTE, popFromShortDelta, scoreIvrvEdge } from '../scoring/factors';
import { weighted } from '../scoring/compose';
import { blockForEarnings } from '../filters/events';
import { condorExits, calculatePositionSize } from '../exits/rules';
import { IRON_CONDOR_THRESHOLDS, RISK_LIMITS } from '../config/thresholds';

const CONFIG = {
  SHORT_DELTA_TARGET: 0.22,
  DELTA_TOLERANCE: 0.03,
  DELTA_MIN: 0.18,
  DELTA_MAX: 0.28,
  WIDTH: 5,
  DTE_MIN: 30,
  DTE_MAX: 45,
  MIN_CREDIT_FRAC: IRON_CONDOR_THRESHOLDS.MIN_CREDIT_FRAC, // 25% prod, 15% test
  MAX_SPREAD_PCT: IRON_CONDOR_THRESHOLDS.MAX_SPREAD_PCT,
  IVR_SWEET_SPOT: [20, 60] as [number, number],
  RISK_FRACTION: RISK_LIMITS.FRACTION_PER_TRADE,
  MAX_QTY: RISK_LIMITS.MAX_QTY_PER_LEG,
  SYMMETRY_TOLERANCE: IRON_CONDOR_THRESHOLDS.SYMMETRY_TOLERANCE,
  EARNINGS_BLOCK_DAYS: IRON_CONDOR_THRESHOLDS.EARNINGS_BLOCK_WINDOW_DAYS,
};

export function generate(input: StrategyInput): StrategyOutput {
  const proposals: Proposal[] = [];
  
  // Block if near earnings (iron condors are sensitive to events)
  if (blockForEarnings(input.earningsDate, input.todayISO, CONFIG.EARNINGS_BLOCK_DAYS)) {
    return { proposals };
  }
  
  // Prefer neutral trend (but allow others with penalty)
  if (input.trend !== 'NEUTRAL') {
    // Still allow but will score lower
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
    
    const puts = input.chain.quotes.filter(
      q => q.expiry === expiry && q.right === 'P' && q.delta !== null
    );
    
    if (calls.length < 2 || puts.length < 2) continue;
    
    // Find call spread (short OTM call + long call above)
    const callSpread = findShortSpread(calls, 'CALL', CONFIG);
    if (!callSpread) continue;
    
    // Find put spread (short OTM put + long put below)
    const putSpread = findShortSpread(puts, 'PUT', CONFIG);
    if (!putSpread) continue;
    
    // Check delta symmetry
    const callDelta = Math.abs(callSpread.short.delta!);
    const putDelta = Math.abs(putSpread.short.delta!);
    const deltaImbalance = Math.abs(callDelta - putDelta);
    
    if (deltaImbalance > CONFIG.SYMMETRY_TOLERANCE) continue;
    
    // Calculate total credit
    const callCredit = callSpread.credit;
    const putCredit = putSpread.credit;
    const totalCredit = callCredit + putCredit;
    
    const minCredit = CONFIG.MIN_CREDIT_FRAC * CONFIG.WIDTH * 2;  // Both sides
    if (totalCredit < minCredit) continue;
    
    // Check spreads
    const maxSpread = Math.max(
      callSpread.maxSpreadPct,
      putSpread.maxSpreadPct
    );
    
    if (maxSpread > CONFIG.MAX_SPREAD_PCT) continue;
    
    // Calculate position size (use worst side for max loss)
    const maxLoss = (CONFIG.WIDTH - Math.min(callCredit, putCredit)) * 100;
    const riskBudget = CONFIG.RISK_FRACTION * input.equity;
    const qty = calculatePositionSize(maxLoss, riskBudget, CONFIG.MAX_QTY);
    
    // Calculate exits
    const exits = condorExits(totalCredit, CONFIG.WIDTH);
    
    // Calculate R/R and POP (conservative: use lower of the two sides)
    const rr = maxLoss > 0 ? (totalCredit * 100) / maxLoss : null;
    const callPop = popFromShortDelta(callDelta);
    const putPop = popFromShortDelta(putDelta);
    const pop = Math.round((callPop + putPop) / 2) - 10;  // Adjust for overlap risk
    
    // Score components
    const symmetryScore = 100 - (deltaImbalance / CONFIG.SYMMETRY_TOLERANCE) * 100;
    
    const ivrScore = scoreIvr(input.ivRank, CONFIG.IVR_SWEET_SPOT);
    
    const trendScore = scoreTrendBias(
      70,  // Bullish: acceptable but not ideal
      70,  // Bearish: acceptable but not ideal
      input.trend
    );
    // Boost for neutral
    const trendFinal = input.trend === 'NEUTRAL' ? 95 : trendScore;
    
    const liquidityScore = Math.min(
      callSpread.liquidityScore,
      putSpread.liquidityScore
    );
    
    const rrScore = rr ? scoreRR(rr) : 0;
    
    const dteScore = scoreDTE(dte, [CONFIG.DTE_MIN, CONFIG.DTE_MAX]);
    
    // Compose final score with optional IV/RV edge
    const useIvrv = input?.env?.ENABLE_IVRV_EDGE === 'true';
    const callSkew = input.ivrvMetrics?.call_skew_ivrv_spread ?? 0;
    const putSkew  = input.ivrvMetrics?.put_skew_ivrv_spread  ?? 0;
    
    // Average both sides to capture "balanced richness" (both credit sides)
    const avgSkew  = (callSkew + putSkew) / 2;
    const edgeScore = useIvrv ? scoreIvrvEdge(avgSkew, false) : 50; // false = credit strategy
    
    const score = useIvrv
      ? weighted()
          .add('symmetry', symmetryScore, 0.20)
          .add('ivr', ivrScore, 0.20)
          .add('ivrv_edge', edgeScore, 0.25)
          .add('liquidity', liquidityScore, 0.20)
          .add('rr', rrScore, 0.15)
          .compute()
      : weighted()
          .add('symmetry', symmetryScore, 0.20)
          .add('ivr', ivrScore, 0.25)
          .add('liquidity', liquidityScore, 0.20)
          .add('rr', rrScore, 0.15)
          .add('trend', trendFinal, 0.20)
          .compute();
    
    // Create proposal with 4 legs
    const legs: ProposalLeg[] = [
      // Call spread
      {
        side: 'SELL',
        type: 'CALL',
        strike: callSpread.short.strike,
        expiry: callSpread.short.expiry,
        quantity: qty,
        price: +callSpread.shortMid.toFixed(2),
      },
      {
        side: 'BUY',
        type: 'CALL',
        strike: callSpread.long.strike,
        expiry: callSpread.long.expiry,
        quantity: qty,
        price: +callSpread.longMid.toFixed(2),
      },
      // Put spread
      {
        side: 'SELL',
        type: 'PUT',
        strike: putSpread.short.strike,
        expiry: putSpread.short.expiry,
        quantity: qty,
        price: +putSpread.shortMid.toFixed(2),
      },
      {
        side: 'BUY',
        type: 'PUT',
        strike: putSpread.long.strike,
        expiry: putSpread.long.expiry,
        quantity: qty,
        price: +putSpread.longMid.toFixed(2),
      },
    ];
    
    const proposal: Proposal = {
      strategy: 'IRON_CONDOR',
      symbol: input.symbol,
      action: 'SELL',
      entry_type: 'IRON_CONDOR',
      score,
      credit: +totalCredit.toFixed(2),
      entry_price: +totalCredit.toFixed(2),
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
      rationale: `Neutral range | Δ balance: ±${callDelta.toFixed(2)} | IVR=${input.ivRank?.toFixed(0) ?? 'n/a'}% | Width=$${CONFIG.WIDTH} both sides`,
    };
    
    proposals.push(proposal);
    
    // Limit to top 1 expiry (condors are complex enough)
    if (proposals.length >= 1) break;
  }
  
  return { proposals };
}

// Helper functions

interface SpreadResult {
  short: OptionQuote;
  long: OptionQuote;
  shortMid: number;
  longMid: number;
  credit: number;
  maxSpreadPct: number;
  liquidityScore: number;
}

function findShortSpread(
  options: OptionQuote[],
  type: 'CALL' | 'PUT',
  config: typeof CONFIG
): SpreadResult | null {
  // Sort by delta (absolute value)
  const sorted = options
    .filter(o => {
      const absDelta = Math.abs(o.delta!);
      return absDelta >= config.DELTA_MIN && absDelta <= config.DELTA_MAX;
    })
    .map(o => ({
      quote: o,
      deltaDiff: Math.abs(Math.abs(o.delta!) - config.SHORT_DELTA_TARGET),
    }))
    .sort((a, b) => a.deltaDiff - b.deltaDiff);
  
  if (sorted.length === 0) return null;
  
  const shortQuote = sorted[0].quote;
  
  // Find long leg (width away)
  const targetStrike = type === 'CALL'
    ? shortQuote.strike + config.WIDTH
    : shortQuote.strike - config.WIDTH;
  
  const longQuote = options.find(o => Math.abs(o.strike - targetStrike) < 0.01);
  
  if (!longQuote) return null;
  
  // Calculate prices
  const shortMid = shortQuote.mid ?? ((shortQuote.bid ?? 0) + (shortQuote.ask ?? 0)) / 2;
  const longMid = longQuote.mid ?? ((longQuote.bid ?? 0) + (longQuote.ask ?? 0)) / 2;
  
  if (shortMid <= 0 || longMid <= 0) return null;
  
  const credit = shortMid - longMid;
  if (credit <= 0) return null;
  
  const shortSpreadPct = getSpreadPercent(shortQuote);
  const longSpreadPct = getSpreadPercent(longQuote);
  const maxSpreadPct = Math.max(shortSpreadPct, longSpreadPct);
  
  const liquidityScore = scoreLiquidity(
    maxSpreadPct * Math.max(shortMid, longMid),
    Math.min(shortQuote.openInterest ?? 0, longQuote.openInterest ?? 0)
  );
  
  return {
    short: shortQuote,
    long: longQuote,
    shortMid,
    longMid,
    credit,
    maxSpreadPct,
    liquidityScore,
  };
}

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

