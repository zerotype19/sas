/**
 * Calendar Call Spread Strategy
 * Volatility expansion play with defined risk
 * 
 * Structure: Sell near-term call + Buy longer-term call at same/similar strike
 * 
 * Entry Criteria:
 * - Neutral to mildly bullish trend
 * - Strike near ATM (delta ~0.50)
 * - Front expiry: 14-21 DTE
 * - Back expiry: 45-75 DTE
 * - Positive term structure (back IV > front IV)
 * - Moderate IV Rank (10-50 preferred)
 * - Good liquidity in both expiries
 * 
 * Scoring:
 * - Positive term structure (30%)
 * - Strike placement (ATM) (20%)
 * - Trend (neutral/mild bullish) (15%)
 * - IV Rank (moderate) (15%)
 * - Liquidity (both expiries) (20%)
 */

import type { StrategyInput, StrategyOutput, Proposal, ProposalLeg, OptionQuote } from '../types';
import { scoreDeltaWindow, scoreIvr, scoreTrendBias, scoreLiquidity, scoreDTE } from '../scoring/factors';
import { weighted } from '../scoring/compose';
import { calendarExits, calculatePositionSize } from '../exits/rules';

const CONFIG = {
  TARGET_DELTA: 0.50,  // ATM
  DELTA_TOLERANCE: 0.10,
  FRONT_DTE_MIN: 14,
  FRONT_DTE_MAX: 21,
  BACK_DTE_MIN: 45,
  BACK_DTE_MAX: 75,
  MAX_SPREAD_PCT: 20,
  IVR_SWEET_SPOT: [10, 50] as [number, number],  // Moderate IV
  MIN_TERM_SKEW_PTS: 2,  // Min 2 IV points back > front
  RISK_FRACTION: 0.005,
  MAX_QTY: 5,
  STRIKE_TOLERANCE_PCT: 0.02,  // 2% tolerance for strike matching
};

export function generate(input: StrategyInput): StrategyOutput {
  const proposals: Proposal[] = [];
  
  // Only consider neutral or mildly bullish trends
  if (input.trend === 'DOWN') {
    return { proposals };
  }
  
  // Check if term structure data is available
  if (!input.termSkew) {
    // Can't evaluate calendar without term structure
    return { proposals };
  }
  
  const { frontIV, backIV } = input.termSkew;
  const termSkewPts = (backIV - frontIV) * 100;  // Convert to percentage points
  
  // Require positive term structure
  if (termSkewPts < CONFIG.MIN_TERM_SKEW_PTS) {
    return { proposals };
  }
  
  // Find front and back expiries
  const expiryData = input.chain.expiries.map(exp => ({
    expiry: exp,
    dte: getDTE(exp, input.todayISO),
  }));
  
  const frontExpiries = expiryData.filter(
    e => e.dte >= CONFIG.FRONT_DTE_MIN && e.dte <= CONFIG.FRONT_DTE_MAX
  );
  
  const backExpiries = expiryData.filter(
    e => e.dte >= CONFIG.BACK_DTE_MIN && e.dte <= CONFIG.BACK_DTE_MAX
  );
  
  if (frontExpiries.length === 0 || backExpiries.length === 0) {
    return { proposals };
  }
  
  // Try each combination
  for (const frontExp of frontExpiries) {
    for (const backExp of backExpiries) {
      // Get calls for both expiries
      const frontCalls = input.chain.quotes.filter(
        q => q.expiry === frontExp.expiry && q.right === 'C' && q.delta !== null
      );
      
      const backCalls = input.chain.quotes.filter(
        q => q.expiry === backExp.expiry && q.right === 'C' && q.delta !== null
      );
      
      if (frontCalls.length === 0 || backCalls.length === 0) continue;
      
      // Find ATM strikes in back month (this is our anchor)
      const backATM = backCalls
        .map(c => ({
          quote: c,
          deltaDiff: Math.abs(c.delta! - CONFIG.TARGET_DELTA),
        }))
        .sort((a, b) => a.deltaDiff - b.deltaDiff)[0];
      
      if (!backATM) continue;
      
      const backCall = backATM.quote;
      const targetStrike = backCall.strike;
      
      // Find matching or closest strike in front month
      const frontCall = frontCalls
        .map(c => ({
          quote: c,
          strikeDiff: Math.abs(c.strike - targetStrike),
        }))
        .sort((a, b) => a.strikeDiff - b.strikeDiff)[0]?.quote;
      
      if (!frontCall) continue;
      
      // Verify strikes are close enough
      const strikeDiffPct = Math.abs(frontCall.strike - backCall.strike) / backCall.strike;
      if (strikeDiffPct > CONFIG.STRIKE_TOLERANCE_PCT) continue;
      
      // Calculate prices
      const frontMid = frontCall.mid ?? ((frontCall.bid ?? 0) + (frontCall.ask ?? 0)) / 2;
      const backMid = backCall.mid ?? ((backCall.bid ?? 0) + (backCall.ask ?? 0)) / 2;
      
      if (frontMid <= 0 || backMid <= 0) continue;
      
      // Net debit = buy back - sell front
      const netDebit = backMid - frontMid;
      if (netDebit <= 0) continue;  // Should always be positive for calendar
      
      // Check spreads
      const frontSpreadPct = getSpreadPercent(frontCall);
      const backSpreadPct = getSpreadPercent(backCall);
      const maxSpread = Math.max(frontSpreadPct, backSpreadPct);
      
      if (maxSpread > CONFIG.MAX_SPREAD_PCT) continue;
      
      // Calculate position size
      const perContractRisk = netDebit * 100;
      const riskBudget = CONFIG.RISK_FRACTION * input.equity;
      const qty = calculatePositionSize(perContractRisk, riskBudget, CONFIG.MAX_QTY);
      
      // Calculate exits
      const exits = calendarExits(netDebit);
      
      // Score components
      
      // Term structure score (higher skew = better)
      const termScore = Math.min(100, 50 + termSkewPts * 10);
      
      // Strike placement score (how close to ATM)
      const strikeScore = scoreDeltaWindow(
        backCall.delta!,
        CONFIG.TARGET_DELTA,
        CONFIG.DELTA_TOLERANCE
      );
      
      // Trend score (prefer neutral/mild bullish)
      const trendScore = scoreTrendBias(
        85,  // Bullish: good
        50,  // Bearish: not preferred
        input.trend
      );
      const trendFinal = input.trend === 'NEUTRAL' ? 90 : trendScore;
      
      // IV Rank score (prefer moderate)
      const ivrScore = scoreIvr(input.ivRank, CONFIG.IVR_SWEET_SPOT);
      
      // Liquidity score
      const liquidityScore = scoreLiquidity(
        maxSpread * Math.max(frontMid, backMid),
        Math.min(frontCall.openInterest ?? 0, backCall.openInterest ?? 0)
      );
      
      // Compose final score
      const score = weighted()
        .add('termStructure', termScore, 0.30)
        .add('strike', strikeScore, 0.20)
        .add('trend', trendFinal, 0.15)
        .add('ivr', ivrScore, 0.15)
        .add('liquidity', liquidityScore, 0.20)
        .compute();
      
      // Create proposal
      const legs: ProposalLeg[] = [
        {
          side: 'SELL',
          type: 'CALL',
          strike: frontCall.strike,
          expiry: frontCall.expiry,
          quantity: qty,
          price: +frontMid.toFixed(2),
        },
        {
          side: 'BUY',
          type: 'CALL',
          strike: backCall.strike,
          expiry: backCall.expiry,
          quantity: qty,
          price: +backMid.toFixed(2),
        },
      ];
      
      const proposal: Proposal = {
        strategy: 'CALENDAR_CALL',
        symbol: input.symbol,
        action: 'BUY',
        entry_type: 'CALENDAR',
        score,
        debit: +netDebit.toFixed(2),
        entry_price: +netDebit.toFixed(2),
        target_price: exits.target,
        stop_price: exits.stop,
        qty,
        dte: frontExp.dte,  // Front month DTE
        rr: null,  // Complex to calculate for calendars
        pop: null,
        ivr: input.ivRank,
        maxLoss: perContractRisk * qty,
        legs,
        rationale: `Vol expansion play | Term skew: +${termSkewPts.toFixed(1)}% | Front ${frontExp.dte}d / Back ${backExp.dte}d | Strike $${targetStrike} (ATM)`,
        meta: {
          frontDTE: frontExp.dte,
          backDTE: backExp.dte,
          termSkewPts,
        },
      };
      
      proposals.push(proposal);
      
      // Limit to top 2 combinations
      if (proposals.length >= 2) break;
    }
    
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

