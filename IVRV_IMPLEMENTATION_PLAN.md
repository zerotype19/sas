# IV/RV Metrics Implementation Plan
**Branch:** `feat/ivrv-metrics-and-ops`  
**Status:** Ready for Implementation  
**Feature Flag:** `ENABLE_IVRV_EDGE=false` (default off)  
**Time Estimate:** 2-3 hours per PR  

---

## Overview

Add Realized Volatility (RV) and IV/RV ratio metrics to enhance strategy scoring with directional volatility edge detection. All changes gated behind feature flag for safe rollout.

---

## PR 1 — Realized Vol + IV/RV Metrics

**Goal:** Compute RV20, ATM/OTM IVs, IV/RV ratios, and IV premium %; persist and expose to strategies.

### Files to Create

#### 1. `apps/worker/src/analytics/realizedVol.ts`

```typescript
/**
 * Realized Volatility Calculator
 * 
 * Computes annualized realized volatility from historical price closes
 * using log returns method
 */

/**
 * Calculate 20-day realized volatility (annualized)
 * 
 * @param closes - Array of closing prices (most recent first)
 * @returns Annualized RV as percentage (0-100), floored at 5%
 */
export function calcRV20(closes: number[]): number {
  if (closes.length < 21) {
    throw new Error('Need at least 21 closes for RV20');
  }

  // Calculate log returns for last 20 days
  const returns: number[] = [];
  for (let i = 0; i < 20; i++) {
    const logReturn = Math.log(closes[i] / closes[i + 1]);
    returns.push(logReturn);
  }

  // Calculate standard deviation
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Annualize (252 trading days)
  const annualizedRV = stdDev * Math.sqrt(252) * 100;

  // Floor at 5% to avoid blowups
  return Math.max(5, annualizedRV);
}

/**
 * Calculate realized volatility for multiple lookback periods
 * 
 * @param closes - Array of closing prices
 * @returns Object with RV10, RV20, RV30
 */
export function calcMultiPeriodRV(closes: number[]): {
  rv10: number | null;
  rv20: number | null;
  rv30: number | null;
} {
  return {
    rv10: closes.length >= 11 ? calcRV(closes, 10) : null,
    rv20: closes.length >= 21 ? calcRV(closes, 20) : null,
    rv30: closes.length >= 31 ? calcRV(closes, 30) : null,
  };
}

function calcRV(closes: number[], period: number): number {
  const returns: number[] = [];
  for (let i = 0; i < period; i++) {
    returns.push(Math.log(closes[i] / closes[i + 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.map(r => Math.pow(r - mean, 2)).reduce((a, b) => a + b, 0) / returns.length;
  const annualizedRV = Math.sqrt(variance) * Math.sqrt(252) * 100;

  return Math.max(5, annualizedRV);
}
```

#### 2. `apps/worker/src/analytics/ivrv.ts`

```typescript
/**
 * IV/RV Analysis
 * 
 * Extracts implied volatilities from option chains and computes
 * IV/RV ratios and directional skew metrics
 */

import type { OptionChain, OptionQuote } from '../types';

export interface IvrvResult {
  rv20: number;
  
  // ATM metrics
  atm_iv?: number;
  atm_ivrv_ratio?: number;
  iv_premium_atm_pct?: number;
  
  // OTM call metrics
  otm_call_iv?: number;
  otm_call_ivrv_ratio?: number;
  iv_premium_otm_call_pct?: number;
  
  // OTM put metrics
  otm_put_iv?: number;
  otm_put_ivrv_ratio?: number;
  iv_premium_otm_put_pct?: number;
  
  // Directional skew spreads
  call_skew_ivrv_spread?: number;  // otm_call_ivrv_ratio - atm_ivrv_ratio
  put_skew_ivrv_spread?: number;   // otm_put_ivrv_ratio - atm_ivrv_ratio
}

/**
 * Select option by target delta with tolerance
 * 
 * @param chain - Option chain
 * @param targetDelta - Target delta (e.g., 0.50 for ATM call, -0.20 for OTM put)
 * @param side - 'CALL' or 'PUT'
 * @param tolerance - Delta tolerance (default 0.05)
 * @returns Best matching option quote or null
 */
export function selectByDelta(
  chain: OptionQuote[],
  targetDelta: number,
  side: 'CALL' | 'PUT',
  tolerance: number = 0.05
): OptionQuote | null {
  const filtered = chain
    .filter(q => q.right === (side === 'CALL' ? 'C' : 'P'))
    .filter(q => q.delta !== null && q.iv !== null);

  if (filtered.length === 0) return null;

  // Find closest to target delta within tolerance
  const candidates = filtered
    .map(q => ({
      quote: q,
      deltaDiff: Math.abs((q.delta || 0) - targetDelta),
    }))
    .filter(c => c.deltaDiff <= tolerance)
    .sort((a, b) => a.deltaDiff - b.deltaDiff);

  if (candidates.length > 0) {
    return candidates[0].quote;
  }

  // Fallback: find nearest strike
  const spot = chain[0]?.symbol ? 100 : 100; // Would need spot price here
  const nearestStrike = filtered
    .map(q => ({
      quote: q,
      strikeDiff: Math.abs(q.strike - spot),
    }))
    .sort((a, b) => a.strikeDiff - b.strikeDiff)[0];

  return nearestStrike?.quote || null;
}

/**
 * Calculate IV/RV metrics from option chain and historical closes
 * 
 * @param params - Chain and closes
 * @returns IvrvResult with all metrics
 */
export function calcIvrvMetrics(params: {
  chain: OptionChain;
  closes: number[];
  spot: number;
  rv20: number;
}): IvrvResult {
  const { chain, rv20, spot } = params;
  
  // Get front-month expiry
  const frontExpiry = chain.expiries.sort()[0];
  const frontQuotes = chain.quotes.filter(q => q.expiry === frontExpiry);

  // Extract ATM IV (average of call/put at ~0.50 delta)
  const atmCall = selectByDelta(frontQuotes, 0.50, 'CALL', 0.10);
  const atmPut = selectByDelta(frontQuotes, -0.50, 'PUT', 0.10);
  const atm_iv = atmCall && atmPut 
    ? ((atmCall.iv || 0) + Math.abs(atmPut.iv || 0)) / 2 
    : atmCall?.iv || atmPut?.iv || undefined;

  // Extract OTM call IV (~0.20 delta)
  const otmCall = selectByDelta(frontQuotes, 0.20, 'CALL', 0.05);
  const otm_call_iv = otmCall?.iv;

  // Extract OTM put IV (~-0.20 delta)
  const otmPut = selectByDelta(frontQuotes, -0.20, 'PUT', 0.05);
  const otm_put_iv = otmPut?.iv;

  // Calculate ratios and premiums
  const atm_ivrv_ratio = atm_iv ? atm_iv / rv20 : undefined;
  const otm_call_ivrv_ratio = otm_call_iv ? otm_call_iv / rv20 : undefined;
  const otm_put_ivrv_ratio = otm_put_iv ? Math.abs(otm_put_iv) / rv20 : undefined;

  const iv_premium_atm_pct = atm_iv ? ((atm_iv - rv20) / rv20) * 100 : undefined;
  const iv_premium_otm_call_pct = otm_call_iv ? ((otm_call_iv - rv20) / rv20) * 100 : undefined;
  const iv_premium_otm_put_pct = otm_put_iv ? ((Math.abs(otm_put_iv) - rv20) / rv20) * 100 : undefined;

  // Calculate directional skew spreads
  const call_skew_ivrv_spread = 
    otm_call_ivrv_ratio && atm_ivrv_ratio 
      ? otm_call_ivrv_ratio - atm_ivrv_ratio 
      : undefined;

  const put_skew_ivrv_spread = 
    otm_put_ivrv_ratio && atm_ivrv_ratio 
      ? otm_put_ivrv_ratio - atm_ivrv_ratio 
      : undefined;

  return {
    rv20,
    atm_iv,
    otm_call_iv,
    otm_put_iv,
    atm_ivrv_ratio,
    otm_call_ivrv_ratio,
    otm_put_ivrv_ratio,
    iv_premium_atm_pct,
    iv_premium_otm_call_pct,
    iv_premium_otm_put_pct,
    call_skew_ivrv_spread,
    put_skew_ivrv_spread,
  };
}
```

#### 3. D1 Migration: `apps/worker/src/db/migrations/005_add_volatility_metrics.sql`

```sql
-- Migration 005: Add volatility_metrics table
-- Purpose: Store realized volatility and IV/RV metrics for strategy analysis

CREATE TABLE IF NOT EXISTS volatility_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  asof_date TEXT NOT NULL,  -- YYYY-MM-DD
  expiry TEXT NOT NULL,      -- Front month expiry
  
  -- Realized volatility
  rv20 REAL NOT NULL,        -- 20-day realized vol (annualized %)
  
  -- Implied volatilities
  atm_iv REAL,               -- ATM implied vol
  otm_call_iv REAL,          -- OTM call IV (~0.20 delta)
  otm_put_iv REAL,           -- OTM put IV (~-0.20 delta)
  
  -- IV/RV ratios
  atm_ivrv_ratio REAL,       -- ATM IV / RV
  otm_call_ivrv_ratio REAL,  -- OTM call IV / RV
  otm_put_ivrv_ratio REAL,   -- OTM put IV / RV
  
  -- IV premiums (as %)
  iv_premium_atm_pct REAL,   -- (ATM IV - RV) / RV * 100
  iv_premium_otm_call_pct REAL,
  iv_premium_otm_put_pct REAL,
  
  -- Directional skew spreads
  call_skew_ivrv_spread REAL,  -- otm_call_ratio - atm_ratio
  put_skew_ivrv_spread REAL,   -- otm_put_ratio - atm_ratio
  
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  
  UNIQUE(symbol, asof_date, expiry)
);

CREATE INDEX IF NOT EXISTS idx_vol_metrics_symbol_date 
  ON volatility_metrics(symbol, asof_date DESC);

CREATE INDEX IF NOT EXISTS idx_vol_metrics_created 
  ON volatility_metrics(created_at DESC);
```

#### 4. Historical Data Fetcher: `apps/worker/src/data/history.ts`

```typescript
/**
 * Historical price data fetcher for RV calculation
 */

/**
 * Fetch daily closes from IBKR broker service
 * 
 * @param symbol - Stock symbol
 * @param nDays - Number of days (default 60)
 * @param brokerBase - IBKR broker base URL
 * @param headers - Auth headers (Cloudflare Access)
 * @returns Array of closing prices (most recent first)
 */
export async function getDailyCloses(
  symbol: string,
  nDays: number = 60,
  brokerBase: string,
  headers: Record<string, string>
): Promise<number[]> {
  const response = await fetch(
    `${brokerBase}/history/daily?symbol=${symbol}&days=${nDays}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch history for ${symbol}: ${response.status}`);
  }

  const data = await response.json();
  
  // Expect: { symbol, bars: [{ date, close, ... }, ...] }
  // Most recent first
  return data.bars.map((bar: any) => bar.close);
}
```

#### 5. IBKR Service Endpoint: `services/ibkr-broker/app/main.py`

Add to existing `main.py`:

```python
class HistoryReq(BaseModel):
    symbol: str
    days: int = 60
    exchange: Optional[str] = "SMART"
    currency: Optional[str] = "USD"

@app.get("/history/daily")
async def get_daily_history(symbol: str, days: int = 60, exchange: str = "SMART", currency: str = "USD"):
    """
    Fetch daily historical bars for RV calculation
    """
    ensure_connected()
    
    try:
        contract = Stock(symbol, exchange, currency)
        ib.qualifyContracts(contract)
        
        # Request historical data
        bars = ib.reqHistoricalData(
            contract,
            endDateTime='',
            durationStr=f'{days} D',
            barSizeSetting='1 day',
            whatToShow='TRADES',
            useRTH=True,
            formatDate=1
        )
        
        # Convert to JSON (most recent first)
        result = [
            {
                "date": bar.date.strftime('%Y-%m-%d'),
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume
            }
            for bar in reversed(bars)  # Most recent first
        ]
        
        return {"symbol": symbol, "bars": result}
        
    except Exception as e:
        logger.error(f"Failed to fetch history for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

#### 6. Integration into Strategy Run

Update `apps/worker/src/routes/strategyRun.ts` (or `strategyRunNew.ts`):

```typescript
// After fetching option chain, before generating proposals:

// 1. Fetch historical closes
const closes = await getDailyCloses(
  symbol,
  60,
  c.env.IBKR_BROKER_BASE,
  {
    'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET,
  }
);

// 2. Calculate RV20
const rv20 = calcRV20(closes);

// 3. Calculate IV/RV metrics
const ivrvMetrics = calcIvrvMetrics({
  chain: optionChain,
  closes,
  spot: spotPrice,
  rv20,
});

// 4. Persist to D1
await c.env.DB.prepare(`
  INSERT OR REPLACE INTO volatility_metrics (
    symbol, asof_date, expiry, rv20,
    atm_iv, otm_call_iv, otm_put_iv,
    atm_ivrv_ratio, otm_call_ivrv_ratio, otm_put_ivrv_ratio,
    iv_premium_atm_pct, iv_premium_otm_call_pct, iv_premium_otm_put_pct,
    call_skew_ivrv_spread, put_skew_ivrv_spread
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  symbol,
  new Date().toISOString().slice(0, 10),
  optionChain.expiries[0],
  ivrvMetrics.rv20,
  ivrvMetrics.atm_iv,
  ivrvMetrics.otm_call_iv,
  ivrvMetrics.otm_put_iv,
  ivrvMetrics.atm_ivrv_ratio,
  ivrvMetrics.otm_call_ivrv_ratio,
  ivrvMetrics.otm_put_ivrv_ratio,
  ivrvMetrics.iv_premium_atm_pct,
  ivrvMetrics.iv_premium_otm_call_pct,
  ivrvMetrics.iv_premium_otm_put_pct,
  ivrvMetrics.call_skew_ivrv_spread,
  ivrvMetrics.put_skew_ivrv_spread
).run();

// 5. Add to strategy input
const strategyInput: StrategyInput = {
  symbol,
  chain: optionChain,
  spot: spotPrice,
  ivRank: ivRankValue,
  trend: trendValue,
  todayISO: new Date().toISOString().slice(0, 10),
  equity: accountEquity,
  termSkew: calculateTermSkew(optionChain.quotes, optionChain.expiries),
  // NEW: Add IV/RV metrics
  ivrvMetrics,
};
```

### Unit Tests

```typescript
// apps/worker/__tests__/analytics/realizedVol.test.ts
import { describe, it, expect } from 'vitest';
import { calcRV20 } from '../../src/analytics/realizedVol';

describe('calcRV20', () => {
  it('calculates annualized RV from daily closes', () => {
    // Synthetic: 1% daily moves
    const closes = Array.from({ length: 21 }, (_, i) => 100 * Math.pow(1.01, 20 - i));
    const rv = calcRV20(closes);
    
    // Should be ~15.8% (1% * sqrt(252))
    expect(rv).toBeGreaterThan(10);
    expect(rv).toBeLessThan(20);
  });

  it('floors RV at 5% for very low volatility', () => {
    const closes = Array(21).fill(100); // No movement
    const rv = calcRV20(closes);
    expect(rv).toBe(5);
  });

  it('throws error if insufficient data', () => {
    const closes = Array(10).fill(100);
    expect(() => calcRV20(closes)).toThrow();
  });
});

// apps/worker/__tests__/analytics/ivrv.test.ts
import { describe, it, expect } from 'vitest';
import { calcIvrvMetrics, selectByDelta } from '../../src/analytics/ivrv';
import { makeChain } from '../helpers/mockChain';

describe('selectByDelta', () => {
  it('finds ATM call (~0.50 delta)', () => {
    const { chain } = makeChain({ spot: 100 });
    const atmCall = selectByDelta(chain.quotes, 0.50, 'CALL', 0.10);
    expect(atmCall).toBeDefined();
    expect(Math.abs((atmCall?.delta || 0) - 0.50)).toBeLessThan(0.10);
  });

  it('finds OTM put (~-0.20 delta)', () => {
    const { chain } = makeChain({ spot: 100 });
    const otmPut = selectByDelta(chain.quotes, -0.20, 'PUT', 0.05);
    expect(otmPut).toBeDefined();
    expect(Math.abs((otmPut?.delta || 0) + 0.20)).toBeLessThan(0.05);
  });

  it('returns null if no match within tolerance', () => {
    const { chain } = makeChain({ spot: 100 });
    // Request impossible delta
    const result = selectByDelta(chain.quotes, 1.50, 'CALL', 0.01);
    expect(result).toBeNull();
  });
});

describe('calcIvrvMetrics', () => {
  it('calculates all metrics when data available', () => {
    const { chain } = makeChain({ spot: 100, ivFront: 0.30 });
    const closes = Array.from({ length: 21 }, () => 100);
    
    const metrics = calcIvrvMetrics({
      chain,
      closes,
      spot: 100,
      rv20: 20,
    });

    expect(metrics.rv20).toBe(20);
    expect(metrics.atm_iv).toBeGreaterThan(0);
    expect(metrics.atm_ivrv_ratio).toBeGreaterThan(0);
    expect(metrics.call_skew_ivrv_spread).toBeDefined();
  });

  it('handles missing deltas gracefully', () => {
    const { chain } = makeChain({ spot: 100 });
    // Remove deltas
    chain.quotes.forEach(q => q.delta = null);
    
    const metrics = calcIvrvMetrics({
      chain,
      closes: Array(21).fill(100),
      spot: 100,
      rv20: 15,
    });

    expect(metrics.rv20).toBe(15);
    // Other metrics should be undefined
    expect(metrics.atm_iv).toBeUndefined();
  });
});
```

---

## PR 2 — Scoring Integration (Behind Flag)

**Goal:** Use directional IV/RV skew spread as scoring factor.

### Files to Update

#### 1. Add Scoring Factor: `apps/worker/src/scoring/factors.ts`

```typescript
/**
 * Score IV/RV directional edge
 * Higher spread = more attractive for selling (credit strategies)
 * 
 * @param spread - IV/RV skew spread (e.g., call_skew_ivrv_spread)
 * @returns Score 0-100
 */
export function scoreIvrvEdge(spread: number | undefined): number {
  if (spread === undefined || spread === null) return 50; // Neutral
  
  // Map spread to score:
  // 0.00 → 0
  // 0.15 → 75
  // 0.25+ → 100
  
  if (spread <= 0) return 0;
  if (spread >= 0.25) return 100;
  
  // Linear interpolation
  return Math.round((spread / 0.25) * 100);
}
```

#### 2. Update Strategy Scoring (Example: Bear Call Credit)

```typescript
// apps/worker/src/strategies/bearCallCredit.ts

// Import new factor
import { scoreIvrvEdge } from '../scoring/factors';

// In generate() function, after computing other scores:

// Check feature flag
const useIvrvEdge = input.env?.ENABLE_IVRV_EDGE === 'true';

let score: number;

if (useIvrvEdge && input.ivrvMetrics) {
  // Use directional skew spread (bearish = favor call skew)
  const edgeScore = scoreIvrvEdge(input.ivrvMetrics.call_skew_ivrv_spread);
  
  // Reweight composition
  score = weighted()
    .add('delta', deltaScore, 0.25)
    .add('ivr', ivrScore, 0.20)
    .add('ivrv_edge', edgeScore, 0.30)  // NEW
    .add('liquidity', liquidityScore, 0.10)
    .add('rr', rrScore, 0.10)
    .add('trend', trendScore, 0.05)
    .compute();
} else {
  // Original weights (no IVRV edge)
  score = weighted()
    .add('delta', deltaScore, 0.30)
    .add('ivr', ivrScore, 0.25)
    .add('liquidity', liquidityScore, 0.15)
    .add('rr', rrScore, 0.15)
    .add('trend', trendScore, 0.15)
    .compute();
}
```

Repeat for all strategies:
- **Bull Put Credit**: Use `put_skew_ivrv_spread`
- **Long Call**: Use `call_skew_ivrv_spread` (favor low spread for buying)
- **Long Put**: Use `put_skew_ivrv_spread` (favor low spread for buying)
- **Iron Condor**: Use average of both spreads
- **Calendar**: Use term structure + IV/RV spread

### Unit Tests

```typescript
// apps/worker/__tests__/scoring/ivrvEdge.test.ts
import { describe, it, expect } from 'vitest';
import { scoreIvrvEdge } from '../../src/scoring/factors';

describe('scoreIvrvEdge', () => {
  it('returns 0 for zero spread', () => {
    expect(scoreIvrvEdge(0)).toBe(0);
  });

  it('returns 100 for high spread (≥0.25)', () => {
    expect(scoreIvrvEdge(0.25)).toBe(100);
    expect(scoreIvrvEdge(0.30)).toBe(100);
  });

  it('interpolates linearly between 0 and 0.25', () => {
    expect(scoreIvrvEdge(0.125)).toBe(50);
    expect(scoreIvrvEdge(0.15)).toBeGreaterThan(50);
    expect(scoreIvrvEdge(0.15)).toBeLessThan(75);
  });

  it('returns 50 (neutral) for undefined spread', () => {
    expect(scoreIvrvEdge(undefined)).toBe(50);
  });

  it('returns 0 for negative spread', () => {
    expect(scoreIvrvEdge(-0.10)).toBe(0);
  });
});
```

---

## PR 3 — Historical Bars Fetcher

**Goal:** Fetch last 60 daily closes per symbol for RV calculation.

**Already covered in PR 1** (see `getDailyCloses()` and IBKR endpoint).

---

## PR 4 — Minimal Order Management

**Goal:** Cancel open orders and close positions.

### Files to Update

#### 1. IBKR Service: `services/ibkr-broker/app/main.py`

```python
class CancelOrderReq(BaseModel):
    order_id: int

@app.post("/orders/cancel")
async def cancel_order(req: CancelOrderReq):
    """Cancel an open order"""
    ensure_connected()
    
    try:
        ib.cancelOrder(req.order_id)
        return {"status": "cancelled", "order_id": req.order_id}
    except Exception as e:
        logger.error(f"Failed to cancel order {req.order_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ClosePositionReq(BaseModel):
    symbol: str
    legs: List[dict]  # Same format as place order

@app.post("/positions/close")
async def close_position(req: ClosePositionReq):
    """Close an option position (market order, opposite side)"""
    ensure_connected()
    
    try:
        # Create opposite combo
        combo_legs = []
        for leg in req.legs:
            # Flip side (BUY → SELL, SELL → BUY)
            action = 'SELL' if leg['side'] == 'BUY' else 'BUY'
            combo_legs.append(ComboLeg(
                conId=leg['conId'],  # Would need to look up contract ID
                ratio=1,
                action=action,
                exchange='SMART'
            ))
        
        # Create bag contract
        contract = Contract()
        contract.symbol = req.symbol
        contract.secType = 'BAG'
        contract.exchange = 'SMART'
        contract.currency = 'USD'
        contract.comboLegs = combo_legs
        
        # Market order to close
        order = MarketOrder('SELL' if req.legs[0]['side'] == 'BUY' else 'BUY', req.legs[0]['quantity'])
        
        trade = ib.placeOrder(contract, order)
        ib.sleep(2)
        
        return {
            "status": trade.orderStatus.status,
            "order_id": trade.order.orderId
        }
        
    except Exception as e:
        logger.error(f"Failed to close position {req.symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

#### 2. Worker Routes: `apps/worker/src/routes/execute.ts`

```typescript
// Add cancel endpoint
app.post('/execute/:proposalId/cancel', async (c) => {
  const proposalId = c.req.param('proposalId');
  
  // Get order ID from trades table
  const trade = await c.env.DB.prepare(`
    SELECT order_id FROM trades WHERE proposal_id = ?
  `).bind(proposalId).first();
  
  if (!trade || !trade.order_id) {
    return c.json({ error: 'No order found' }, 404);
  }
  
  // Cancel via broker
  const response = await fetch(`${c.env.IBKR_BROKER_BASE}/orders/cancel`, {
    method: 'POST',
    headers: {
      'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
      'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order_id: trade.order_id }),
  });
  
  const result = await response.json();
  
  // Update trade status
  await c.env.DB.prepare(`
    UPDATE trades SET status = 'cancelled' WHERE proposal_id = ?
  `).bind(proposalId).run();
  
  return c.json(result);
});

// Add close endpoint (similar pattern)
```

---

## PR 5 — UI Instrumentation

**Goal:** Display IV/RV metrics in proposal cards.

### Files to Update

#### 1. `apps/web/src/components/ProposalCard.tsx`

```typescript
// Add new section to proposal card

{proposal.ivrvMetrics && (
  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
    <div className="text-xs font-semibold text-gray-700 mb-2">
      Volatility Metrics
    </div>
    <div className="grid grid-cols-3 gap-3 text-xs">
      <div>
        <div className="text-gray-600">RV20</div>
        <div className="font-mono font-semibold">
          {proposal.ivrvMetrics.rv20.toFixed(1)}%
        </div>
      </div>
      <div>
        <div className="text-gray-600">ATM IV</div>
        <div className="font-mono font-semibold">
          {proposal.ivrvMetrics.atm_iv?.toFixed(1) || '–'}%
        </div>
      </div>
      <div>
        <div className="text-gray-600">IV/RV</div>
        <div className="font-mono font-semibold">
          {proposal.ivrvMetrics.atm_ivrv_ratio?.toFixed(2) || '–'}
        </div>
      </div>
    </div>
    
    {/* Directional skew badge */}
    {proposal.ivrvMetrics.call_skew_ivrv_spread !== undefined && (
      <div className="mt-2">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          proposal.ivrvMetrics.call_skew_ivrv_spread >= 0.25 ? 'bg-green-100 text-green-800' :
          proposal.ivrvMetrics.call_skew_ivrv_spread >= 0.15 ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          Edge: {proposal.ivrvMetrics.call_skew_ivrv_spread >= 0.25 ? 'Strong' :
                 proposal.ivrvMetrics.call_skew_ivrv_spread >= 0.15 ? 'Moderate' : 'Weak'}
        </span>
      </div>
    )}
  </div>
)}
```

---

## Deployment Checklist

### Before Deployment
- [ ] All 45 existing tests still pass
- [ ] New unit tests added and passing
- [ ] Feature flag `ENABLE_IVRV_EDGE=false` in production
- [ ] D1 migration 005 applied
- [ ] IBKR service updated with `/history/daily` endpoint
- [ ] Mac mini service restarted

### Deployment Steps
```bash
# 1. Apply D1 migration
cd apps/worker
wrangler d1 migrations apply sas-proposals --remote

# 2. Deploy Worker with flag OFF
wrangler deploy --env production
# Verify ENABLE_IVRV_EDGE=false in wrangler.toml

# 3. Update Mac mini IBKR service
ssh user@mac-mini
cd ~/ibkr-broker
# Copy updated main.py
launchctl stop com.sas.ibkr-broker
launchctl start com.sas.ibkr-broker

# 4. Deploy updated Web UI
cd apps/web
pnpm build
wrangler pages deploy dist
```

### Testing in Production
```bash
# 1. Verify volatility metrics table
wrangler d1 execute sas-proposals --command \
  "SELECT * FROM volatility_metrics LIMIT 1"

# 2. Test historical data endpoint
curl "https://sas-worker-production.kevin-mcgovern.workers.dev/broker/history/daily?symbol=AAPL&days=30"

# 3. Run strategy pass (flag OFF)
curl "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true" | jq

# 4. Check proposals have ivrvMetrics (but scores unchanged)

# 5. Enable flag
wrangler secret put ENABLE_IVRV_EDGE --env production
# Enter: true

# 6. Run strategy pass (flag ON)
curl "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true" | jq

# 7. Compare scores (should see differences when skew spread is significant)
```

### Rollback Plan
```bash
# Disable feature flag
wrangler secret put ENABLE_IVRV_EDGE --env production
# Enter: false

# Or redeploy previous version
git checkout main
wrangler deploy --env production
```

---

## Success Criteria

- [ ] Volatility metrics persisted to D1 for all analyzed symbols
- [ ] Metrics visible in Worker payload and Web UI
- [ ] With flag OFF: Scores identical to current system
- [ ] With flag ON: Scores adjust based on directional skew spread
- [ ] No regressions in existing tests
- [ ] Order management endpoints functional (cancel/close)

---

**Status:** Ready for implementation  
**Next Steps:** Create branch, implement PR 1 (RV + IV/RV), test with synthetic data  
**Timeline:** 2-3 hours per PR, total 8-12 hours for complete rollout

