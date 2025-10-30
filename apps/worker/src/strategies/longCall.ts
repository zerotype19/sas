/**
 * Long Call Strategy (Existing - adapted to modular interface)
 * Bullish directional momentum play with defined risk
 * 
 * Entry Criteria:
 * - Target delta: 0.60-0.70 (sweet spot: 0.65)
 * - Low to moderate IV Rank (prefer IVR ≤ 40)
 * - DTE: 30-60 days
 * - Good liquidity (max 20% spread)
 * 
 * Scoring:
 * - IV Rank (lower is better for buying) (50%)
 * - Delta/Momentum (50%)
 */

import type { StrategyInput, StrategyOutput, Proposal, ProposalLeg, OptionQuote } from '../types';
import { debitExits, calculatePositionSize } from '../exits/rules';
import { scoreIvrvBuyEdge } from '../scoring/factors';
import { weighted } from '../scoring/compose';

const CONFIG = {
  DTE_MIN: 30,
  DTE_MAX: 60,
  DELTA_MIN: 0.60,
  DELTA_MAX: 0.70,
  TARGET_DELTA: 0.65,
  MAX_SPREAD_PCT: 20,
  MAX_IVR: 40,  // Prefer low IV for buying
  RISK_FRACTION: 0.005,
  MAX_NOTIONAL: 10000,
  MAX_QTY: 5,
};

export function generate(input: StrategyInput): StrategyOutput {
  const proposals: Proposal[] = [];
  
  // Only consider if IVR is acceptable for buying
  const okIvr = input.ivRank === null || input.ivRank <= CONFIG.MAX_IVR;
  if (!okIvr) {
    return { proposals };
  }
  
  // Filter expiries in DTE range
  const validExpiries = input.chain.expiries
    .map(exp => ({
      expiry: exp,
      dte: getDTE(exp, input.todayISO),
    }))
    .filter(e => e.dte >= CONFIG.DTE_MIN && e.dte <= CONFIG.DTE_MAX)
    .sort((a, b) => Math.abs(a.dte - 45) - Math.abs(b.dte - 45)); // Prefer ~45 DTE
  
  if (validExpiries.length === 0) {
    return { proposals };
  }
  
  // Analyze top expiry
  const debitExpiry = validExpiries[0];
  
  const calls = input.chain.quotes.filter(
    q => q.expiry === debitExpiry.expiry &&
      q.right === 'C' &&
      q.delta !== null &&
      q.delta >= CONFIG.DELTA_MIN &&
      q.delta <= CONFIG.DELTA_MAX
  );
  
  // Sort by closest to target delta
  calls.sort((a, b) =>
    Math.abs(CONFIG.TARGET_DELTA - (a.delta!)) - Math.abs(CONFIG.TARGET_DELTA - (b.delta!))
  );
  
  const longCall = calls[0];
  
  if (!longCall) {
    return { proposals };
  }
  
  // Calculate price
  const price = longCall.mid ?? ((longCall.bid ?? 0) + (longCall.ask ?? 0)) / 2;
  
  if (price <= 0) {
    return { proposals };
  }
  
  // Check spread
  const spreadPct = getSpreadPercent(longCall);
  if (spreadPct > CONFIG.MAX_SPREAD_PCT) {
    return { proposals };
  }
  
  // Calculate position size
  const perContractRisk = price * 100;
  const riskBudget = CONFIG.RISK_FRACTION * input.equity;
  
  let qty = Math.floor(riskBudget / perContractRisk);
  qty = Math.max(1, Math.min(qty, CONFIG.MAX_QTY));
  
  const notional = perContractRisk * qty;
  
  if (notional > CONFIG.MAX_NOTIONAL) {
    return { proposals };
  }
  
  // Calculate exits
  const exits = debitExits(price);
  
  // Calculate score with optional IV/RV buy edge
  const useIvrv = input?.env?.ENABLE_IVRV_EDGE === 'true';
  const callSkew = input.ivrvMetrics?.call_skew_ivrv_spread;
  const edgeScore = useIvrv ? scoreIvrvBuyEdge(callSkew) : 50;
  
  // IVR penalty score: Lower IV is better for buying calls
  const ivrPenaltyScore = input.ivRank !== null ? (100 - input.ivRank) : 65;
  
  // Momentum score: use delta as proxy (higher delta = more bullish)
  const momentumScore = longCall.delta! >= 0.65 ? 50 : 40;
  
  // Liquidity score: tighter spreads are better
  const spread = getSpreadPercent(longCall);
  const liquidityScore = spread <= 10 ? 100 : spread <= 20 ? 50 : 0;
  
  // Compose score with optional IV/RV edge
  const score = useIvrv
    ? weighted()
        .add('momentum', momentumScore, 0.45)
        .add('ivr_penalty', ivrPenaltyScore, 0.25)
        .add('ivrv_buy_edge', edgeScore, 0.20)
        .add('liquidity', liquidityScore, 0.10)
        .compute()
    : weighted()
        .add('momentum', momentumScore, 0.50)
        .add('ivr_penalty', ivrPenaltyScore, 0.30)
        .add('liquidity', liquidityScore, 0.20)
        .compute();
  
  // Create proposal
  const leg: ProposalLeg = {
    side: 'BUY',
    type: 'CALL',
    strike: longCall.strike,
    expiry: longCall.expiry,
    quantity: qty,
    price: +price.toFixed(2),
  };
  
  const proposal: Proposal = {
    strategy: 'LONG_CALL',
    symbol: input.symbol,
    action: 'BUY',
    entry_type: 'DEBIT_CALL',
    score: +score.toFixed(1),
    debit: +price.toFixed(2),
    entry_price: +price.toFixed(2),
    target_price: exits.target,
    stop_price: exits.stop,
    qty,
    dte: debitExpiry.dte,
    rr: 1.0, // Unlimited upside, defined risk
    pop: null,
    ivr: input.ivRank !== null ? +input.ivRank.toFixed(1) : null,
    maxLoss: perContractRisk * qty,
    legs: [leg],
    rationale: `Delta≈${longCall.delta?.toFixed(2)} | IVR<=${CONFIG.MAX_IVR}% | Spread%<=${CONFIG.MAX_SPREAD_PCT}%`,
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

