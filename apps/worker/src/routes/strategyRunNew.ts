/**
 * Strategy Runner - Modular Multi-Strategy Engine
 * 
 * Integrates all strategies with phase gating:
 * Phase 1: Long Call, Bull Put Credit Spread
 * Phase 2: Long Put, Bear Call Credit Spread
 * Phase 3: Iron Condor, Calendar Call, Calendar Put
 * 
 * Reads from: option_quotes, iv_history, market_data
 * Returns: Ranked proposals across all enabled strategies
 */

import { Hono } from 'hono';
import type { Bindings } from '../env';
import { ivRank } from '../utils/options';
import { STRATEGIES, isStrategyAllowed } from '../config/strategies';
import type { StrategyInput, Proposal, OptionChain, TrendDirection } from '../types';

// Import all strategy modules
import * as longCall from '../strategies/longCall';
import * as bullPutCredit from '../strategies/bullPutCredit';
import * as longPut from '../strategies/longPut';
import * as bearCallCredit from '../strategies/bearCallCredit';
import * as ironCondor from '../strategies/ironCondor';
import * as calendarCall from '../strategies/calendarCall';
import * as calendarPut from '../strategies/calendarPut';

const app = new Hono<{ Bindings: Bindings }>();

// Strategy module map
const strategyModules = {
  LONG_CALL: longCall,
  BULL_PUT_CREDIT: bullPutCredit,
  LONG_PUT: longPut,
  BEAR_CALL_CREDIT: bearCallCredit,
  IRON_CONDOR: ironCondor,
  CALENDAR_CALL: calendarCall,
  CALENDAR_PUT: calendarPut,
};

/**
 * Main strategy runner
 * Analyzes option chains and generates proposals across all enabled strategies
 */
app.get('/', async (c) => {
  const db = c.env.DB;
  
  if (!db) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  try {
    // 1) Get account equity for sizing
    let equity = 100000;
    try {
      if (c.env.IBKR_BROKER_BASE) {
        const acctRes = await fetch(`${c.env.IBKR_BROKER_BASE}/account`, {
          headers: {
            'cf-access-client-id': c.env.CF_ACCESS_CLIENT_ID || '',
            'cf-access-client-secret': c.env.CF_ACCESS_CLIENT_SECRET || ''
          },
          signal: AbortSignal.timeout(5000),
        });
        if (acctRes.ok) {
          const account = await acctRes.json();
          equity = Math.max(100000, Number(account?.equity) || 100000);
        }
      }
    } catch (err) {
      console.log('Using fallback equity:', equity);
    }

    // 2) Get symbols with recent option quotes
    const { results: symbolRows } = await db
      .prepare(
        `SELECT DISTINCT symbol FROM option_quotes 
         WHERE timestamp > ? 
         ORDER BY symbol`
      )
      .bind(Date.now() - 3600000) // Last hour
      .all();

    const symbols = symbolRows.map((r: any) => r.symbol);
    
    if (symbols.length === 0) {
      return c.json({ 
        timestamp: Date.now(),
        count: 0, 
        proposals: [],
        message: 'No option quotes available.'
      });
    }

    const allProposals: Proposal[] = [];
    const debugInfo: any[] = [];

    // 3) Process each symbol
    for (const symbol of symbols) {
      try {
        // Build strategy input for this symbol
        const input = await buildStrategyInput(symbol, equity, db, c.env);
        
        if (!input) {
          debugInfo.push({ symbol, skipped: 'No data available' });
          continue;
        }

        // Run all enabled strategies for this symbol
        const proposals = await runEnabledStrategies(input);
        
        allProposals.push(...proposals);
        
        debugInfo.push({
          symbol,
          strategies_run: proposals.length,
          top_score: proposals.length > 0 ? Math.max(...proposals.map(p => p.score)) : 0,
        });
      } catch (err: any) {
        console.error(`Error processing ${symbol}:`, err);
        debugInfo.push({ symbol, error: err.message });
      }
    }

    // 4) Sort by score and apply global filters
    const rankedProposals = allProposals
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Top 50 proposals

    // 5) Format response (maintain backward compatibility)
    const candidates = rankedProposals.map(p => ({
      symbol: p.symbol,
      strategy: p.strategy,
      action: p.action,
      entry_type: p.entry_type,
      legs: p.legs.map(leg => ({
        side: leg.side,
        type: leg.type,
        expiry: leg.expiry,
        strike: leg.strike,
        price: leg.price,
      })),
      qty: p.qty,
      credit: p.credit ?? null,
      debit: p.debit ?? null,
      width: p.width ?? null,
      maxLoss: p.maxLoss,
      rr: p.rr,
      pop: p.pop,
      ivr: p.ivr,
      dte: p.dte,
      rationale: p.rationale,
      score: p.score,
    }));

    return c.json({
      timestamp: Date.now(),
      count: candidates.length,
      candidates,
      equity,
      symbols_analyzed: symbols.length,
      debug: debugInfo,
    });
  } catch (error: any) {
    console.error('Strategy run error:', error);
    return c.json({ error: 'Strategy run failed', message: error.message }, 500);
  }
});

/**
 * Build strategy input for a symbol
 */
async function buildStrategyInput(
  symbol: string,
  equity: number,
  db: any,
  env: Bindings
): Promise<StrategyInput | null> {
  // Load IV history
  const { results: ivRows } = await db
    .prepare(
      `SELECT iv FROM iv_history 
       WHERE symbol = ? 
       ORDER BY timestamp DESC LIMIT 60`
    )
    .bind(symbol)
    .all();

  const ivSamples = ivRows.map((r: any) => r.iv).filter((x: any) => x != null);
  const ivRankValue = ivRank(ivSamples);

  // Load option quotes
  const { results: quotes } = await db
    .prepare(
      `SELECT * FROM option_quotes 
       WHERE symbol = ? AND timestamp > ?
       ORDER BY expiry, strike, right`
    )
    .bind(symbol, Date.now() - 3600000)
    .all();

  if (quotes.length === 0) return null;

  // Get unique expiries
  const expiries = Array.from(new Set(quotes.map((q: any) => q.expiry))) as string[];

  // Build option chain
  const chain: OptionChain = {
    symbol,
    quotes: quotes.map((q: any) => ({
      symbol: q.symbol,
      expiry: q.expiry,
      strike: q.strike,
      right: q.right,
      bid: q.bid,
      ask: q.ask,
      mid: q.mid,
      iv: q.iv,
      delta: q.delta,
      gamma: q.gamma,
      vega: q.vega,
      theta: q.theta,
      volume: q.volume,
      openInterest: q.open_interest,
      timestamp: q.timestamp,
    })),
    expiries,
  };

  // Get current spot price
  const { results: spotRows } = await db
    .prepare(
      `SELECT last FROM market_data 
       WHERE symbol = ? 
       ORDER BY timestamp DESC LIMIT 1`
    )
    .bind(symbol)
    .all();

  const spot = spotRows.length > 0 ? Number(spotRows[0].last) : 0;

  // Determine trend (simple placeholder - can enhance with TA)
  const trend: TrendDirection = determineTrend(symbol, db);

  // Calculate term structure (for calendar spreads)
  const termSkew = calculateTermSkew(quotes, expiries);

  // Today ISO
  const todayISO = new Date().toISOString().split('T')[0];

  return {
    symbol,
    chain,
    spot,
    ivRank: ivRankValue,
    trend,
    earningsDate: undefined, // TODO: Integrate earnings calendar
    todayISO,
    equity,
    termSkew,
  };
}

/**
 * Run all enabled strategies for given input
 */
async function runEnabledStrategies(input: StrategyInput): Promise<Proposal[]> {
  const proposals: Proposal[] = [];

  for (const [strategyId, config] of Object.entries(STRATEGIES)) {
    // Skip if not enabled
    if (!config.enabled) continue;

    // Skip if phase not allowed
    if (!isStrategyAllowed(config.phase)) continue;

    // Get strategy module
    const module = strategyModules[strategyId as keyof typeof strategyModules];
    if (!module) continue;

    try {
      // Run strategy
      const output = module.generate(input);
      
      // Filter by minimum score
      const validProposals = output.proposals.filter(p => p.score >= config.minScore);
      
      proposals.push(...validProposals);
    } catch (err: any) {
      console.error(`Strategy ${strategyId} error for ${input.symbol}:`, err.message);
    }
  }

  return proposals;
}

/**
 * Determine trend direction (placeholder - enhance with actual TA)
 */
function determineTrend(symbol: string, db: any): TrendDirection {
  // TODO: Implement actual trend analysis using market_data historical prices
  // For now, return NEUTRAL
  return 'NEUTRAL';
}

/**
 * Calculate term structure skew for calendar spreads
 */
function calculateTermSkew(
  quotes: any[],
  expiries: string[]
): { frontIV: number; backIV: number } | undefined {
  if (expiries.length < 2) return undefined;

  // Sort expiries by DTE
  const today = new Date();
  const sortedExpiries = expiries
    .map(exp => ({
      expiry: exp,
      dte: Math.round((+new Date(exp) - +today) / 86400000),
    }))
    .sort((a, b) => a.dte - b.dte);

  // Find front month (14-21 DTE) and back month (45-75 DTE)
  const front = sortedExpiries.find(e => e.dte >= 14 && e.dte <= 21);
  const back = sortedExpiries.find(e => e.dte >= 45 && e.dte <= 75);

  if (!front || !back) return undefined;

  // Calculate average IV for each expiry (ATM options)
  const frontIV = calculateAvgIV(quotes, front.expiry);
  const backIV = calculateAvgIV(quotes, back.expiry);

  if (frontIV === null || backIV === null) return undefined;

  return { frontIV, backIV };
}

/**
 * Calculate average IV for an expiry (from ATM options)
 */
function calculateAvgIV(quotes: any[], expiry: string): number | null {
  const expiryQuotes = quotes.filter(q => q.expiry === expiry && q.iv !== null);
  
  if (expiryQuotes.length === 0) return null;

  // Use ATM options (delta between 0.4 and 0.6 for calls, -0.6 and -0.4 for puts)
  const atmQuotes = expiryQuotes.filter(q => {
    const absDelta = Math.abs(q.delta || 0);
    return absDelta >= 0.4 && absDelta <= 0.6;
  });

  if (atmQuotes.length === 0) {
    // Fallback: use all quotes
    const ivSum = expiryQuotes.reduce((sum, q) => sum + q.iv, 0);
    return ivSum / expiryQuotes.length;
  }

  const ivSum = atmQuotes.reduce((sum, q) => sum + q.iv, 0);
  return ivSum / atmQuotes.length;
}

export default app;

