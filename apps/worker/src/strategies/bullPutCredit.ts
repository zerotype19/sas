/**
 * Bull Put Credit Spread Strategy (Existing - adapted to modular interface)
 * Bullish/neutral income strategy with defined risk
 * 
 * Entry Criteria:
 * - Short put delta: -0.20 to -0.30 (target: -0.25)
 * - Width: $5
 * - High IV Rank (prefer 60+)
 * - DTE: 30-45 days
 * - Minimum credit: 30% of width
 * 
 * Scoring:
 * - IV Rank (50%)
 * - POP from delta (50%)
 */

import type { StrategyInput, StrategyOutput, Proposal, ProposalLeg, OptionQuote } from '../types';
import { creditSpreadExits, calculatePositionSize } from '../exits/rules';
import { CREDIT_SPREAD_THRESHOLDS, RISK_LIMITS } from '../config/thresholds';
import { scoreIvrvEdge } from '../scoring/factors';

const CONFIG = {
  DTE_MIN: 30,
  DTE_MAX: 45,
  DELTA_MIN: -0.30,
  DELTA_MAX: -0.20,
  TARGET_DELTA: -0.25,
  WIDTH: 5,
  MIN_CREDIT_FRAC: CREDIT_SPREAD_THRESHOLDS.MIN_CREDIT_FRAC, // 30% prod, 20% test
  MAX_SPREAD_PCT: CREDIT_SPREAD_THRESHOLDS.MAX_SPREAD_PCT,
  RISK_FRACTION: RISK_LIMITS.FRACTION_PER_TRADE,
  MAX_NOTIONAL: RISK_LIMITS.MAX_NOTIONAL_PER_POSITION,
  MAX_QTY: RISK_LIMITS.MAX_QTY_PER_LEG,
};

export function generate(input: StrategyInput): StrategyOutput {
  const proposals: Proposal[] = [];
  
  // Filter expiries in DTE range
  const validExpiries = input.chain.expiries
    .map(exp => ({
      expiry: exp,
      dte: getDTE(exp, input.todayISO),
    }))
    .filter(e => e.dte >= CONFIG.DTE_MIN && e.dte <= CONFIG.DTE_MAX)
    .sort((a, b) => Math.abs(a.dte - 37.5) - Math.abs(b.dte - 37.5)); // Prefer ~37 DTE
  
  if (validExpiries.length === 0) {
    return { proposals };
  }
  
  // Analyze top expiry
  const creditExpiry = validExpiries[0];
  
  // Get all puts for this expiry
  const allPuts = input.chain.quotes.filter(
    q => q.expiry === creditExpiry.expiry &&
      q.right === 'P' &&
      q.delta !== null
  );
  
  // Filter SHORT puts by delta range
  const shortPutCandidates = allPuts.filter(
    q => q.delta! >= CONFIG.DELTA_MIN && q.delta! <= CONFIG.DELTA_MAX
  );
  
  // Sort by closest to target delta
  shortPutCandidates.sort((a, b) =>
    Math.abs(CONFIG.TARGET_DELTA - a.delta!) - Math.abs(CONFIG.TARGET_DELTA - b.delta!)
  );
  
  const shortPut = shortPutCandidates[0];
  
  if (!shortPut) {
    return { proposals };
  }
  
  // Find long put (WIDTH lower)
  const targetStrike = shortPut.strike - CONFIG.WIDTH;
  const longPut = allPuts.find(q => Math.abs(q.strike - targetStrike) < 0.01);
  
  if (!longPut) {
    return { proposals };
  }
  
  // Calculate prices
  const shortMid = shortPut.mid ?? ((shortPut.bid ?? 0) + (shortPut.ask ?? 0)) / 2;
  const longMid = longPut.mid ?? ((longPut.bid ?? 0) + (longPut.ask ?? 0)) / 2;
  
  if (shortMid <= 0 || longMid <= 0) {
    return { proposals };
  }
  
  const credit = shortMid - longMid;
  const spreadPctShort = getSpreadPercent(shortPut);
  const spreadPctLong = getSpreadPercent(longPut);
  const maxSpread = Math.max(spreadPctShort, spreadPctLong);
  
  // Check eligibility
  const minCredit = CONFIG.MIN_CREDIT_FRAC * CONFIG.WIDTH;
  
  if (credit < minCredit) {
    return { proposals };
  }
  
  if (maxSpread > CONFIG.MAX_SPREAD_PCT) {
    return { proposals };
  }
  
  // Calculate position size
  const width = CONFIG.WIDTH;
  const maxLoss = (width - credit) * 100; // Per spread
  const riskBudget = CONFIG.RISK_FRACTION * input.equity;
  
  let qty = Math.floor(riskBudget / maxLoss);
  qty = Math.max(1, Math.min(qty, CONFIG.MAX_QTY));
  
  const notional = maxLoss * qty;
  
  if (notional > CONFIG.MAX_NOTIONAL) {
    return { proposals };
  }
  
  // Calculate exits
  const exits = creditSpreadExits(credit, width);
  
  // Calculate R/R and POP
  const rr = maxLoss > 0 ? (credit * 100) / maxLoss : null;
  const pop = shortPut.delta ? (1 - Math.abs(shortPut.delta)) * 100 : null;
  
  // Calculate score with optional IV/RV edge
  const useIvrvEdge = input.env?.ENABLE_IVRV_EDGE === 'true';
  const ivrScore = input.ivRank !== null ? input.ivRank / 2 : 25;
  const popScore = pop !== null ? pop / 2 : 25;
  
  let score: number;
  if (useIvrvEdge && input.ivrvMetrics) {
    // With IV/RV edge: IVR 40% + POP 35% + Edge 25%
    const ivrvEdgeScore = scoreIvrvEdge(input.ivrvMetrics.put_skew_ivrv_spread, false); // false = credit strategy
    score = (ivrScore * 0.80) + (popScore * 0.70) + (ivrvEdgeScore * 0.25);
  } else {
    // Legacy scoring: IVR 50% + POP 50%
    score = ivrScore + popScore;
  }
  
  // Create proposal
  const legs: ProposalLeg[] = [
    {
      side: 'SELL',
      type: 'PUT',
      strike: shortPut.strike,
      expiry: shortPut.expiry,
      quantity: qty,
      price: +shortMid.toFixed(2),
    },
    {
      side: 'BUY',
      type: 'PUT',
      strike: longPut.strike,
      expiry: longPut.expiry,
      quantity: qty,
      price: +longMid.toFixed(2),
    },
  ];
  
  const proposal: Proposal = {
    strategy: 'BULL_PUT_CREDIT',
    symbol: input.symbol,
    action: 'SELL',
    entry_type: 'CREDIT_SPREAD',
    score: +score.toFixed(1),
    credit: +credit.toFixed(2),
    entry_price: +credit.toFixed(2),
    target_price: exits.target,
    stop_price: exits.stop,
    width,
    qty,
    dte: creditExpiry.dte,
    rr: rr ? +rr.toFixed(2) : null,
    pop: pop ? +pop.toFixed(1) : null,
    ivr: input.ivRank !== null ? +input.ivRank.toFixed(1) : null,
    maxLoss: maxLoss * qty,
    legs,
    rationale: `Delta≈${shortPut.delta?.toFixed(2)} | IVR=${input.ivRank?.toFixed(0) ?? 'n/a'}% | Spread%<=${CONFIG.MAX_SPREAD_PCT}%`,
  };
  
  proposals.push(proposal);
  
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

