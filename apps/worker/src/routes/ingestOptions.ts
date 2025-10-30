// Options Data Ingestion Route
// Fetches option quotes from IBKR and stores them in D1

import { Hono } from 'hono';
import type { Bindings } from '../env';

const app = new Hono<{ Bindings: Bindings }>();

// Symbols to track
const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'SPY', 'QQQ', 'NVDA', 'META', 'AMZN', 'GOOGL', 'NFLX'];

/**
 * Check if US market is currently open
 * Mon-Fri, 9:30 AM - 4:00 PM ET
 */
function isUsMarketOpen(date = new Date()): boolean {
  const et = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();  // 0 = Sunday ... 6 = Saturday
  const h = et.getHours();
  const m = et.getMinutes();
  
  // Skip weekends
  if (day === 0 || day === 6) return false;
  
  // Convert to minutes after midnight ET
  const mins = h * 60 + m;
  
  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min) ET
  return mins >= 570 && mins < 960;
}

/**
 * Generate expiries (YYYY-MM-DD) for target DTEs
 */
function generateExpiries(targetDTEs: number[]): string[] {
  const today = new Date();
  const expiries = [];
  
  for (const dte of targetDTEs) {
    const expiry = new Date(today);
    expiry.setDate(today.getDate() + dte);
    
    // Adjust to Friday if needed (options typically expire on Fridays)
    const day = expiry.getDay();
    if (day !== 5) {  // Not Friday
      const daysToFriday = (5 - day + 7) % 7;
      expiry.setDate(expiry.getDate() + daysToFriday);
    }
    
    expiries.push(expiry.toISOString().split('T')[0]);
  }
  
  return expiries;
}

/**
 * Generate strike prices around spot (ATM ± range)
 */
function generateStrikes(spot: number, range: number = 6): number[] {
  const strikes = [];
  const roundedSpot = Math.round(spot / 5) * 5;  // Round to nearest $5
  
  for (let i = -range; i <= range; i++) {
    strikes.push(roundedSpot + (i * 5));
  }
  
  return strikes;
}

app.get('/', async (c) => {
  const env = c.env;
  const db = env.DB;
  const ts = Date.now();
  
  // Skip ingestion outside market hours (unless force=true)
  const force = c.req.query('force') === 'true';
  if (!force && !isUsMarketOpen()) {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return c.json({ 
      skipped: true, 
      reason: 'Outside US market hours (Mon-Fri, 9:30 AM - 4:00 PM ET)',
      currentTime: et.toLocaleString('en-US', { timeZone: 'America/New_York' })
    });
  }

  if (!db) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  const results = [];
  let totalQuotes = 0;
  
  // Generate target expiries (35 DTE and 60 DTE)
  const expiries = generateExpiries([35, 60]);
  
  for (const sym of SYMBOLS) {
    try {
      // 1. Get current spot price
      const brokerBase = env.IBKR_BROKER_BASE || 'http://127.0.0.1:8081';
      const headers: Record<string, string> = {
        'content-type': 'application/json'
      };
      
      // Add Cloudflare Access headers if configured
      if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
        headers['cf-access-client-id'] = env.CF_ACCESS_CLIENT_ID;
        headers['cf-access-client-secret'] = env.CF_ACCESS_CLIENT_SECRET;
      }
      
      const quoteRes = await fetch(`${brokerBase}/quote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ symbol: sym })
      });
      
      if (!quoteRes.ok) {
        throw new Error(`HTTP ${quoteRes.status}: ${await quoteRes.text()}`);
      }
      
      const quote = await quoteRes.json();
      const spot = quote.last || quote.bid || quote.ask;
      
      if (!spot) {
        results.push({ symbol: sym, error: 'No spot price available', status: 'failed' });
        continue;
      }
      
      // 2. Generate strikes (ATM ± 6 strikes)
      const strikes = generateStrikes(spot);
      
      // 3. Build contract list (all strikes × all expiries × both rights)
      const contracts = [];
      for (const expiry of expiries) {
        for (const strike of strikes) {
          contracts.push({ symbol: sym, expiry, strike, right: 'C' });
          contracts.push({ symbol: sym, expiry, strike, right: 'P' });
        }
      }
      
      // 4. Fetch option quotes from broker
      const optionsRes = await fetch(`${brokerBase}/options/quotes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contracts })
      });
      
      if (!optionsRes.ok) {
        throw new Error(`HTTP ${optionsRes.status}: ${await optionsRes.text()}`);
      }
      
      const optionQuotes = await optionsRes.json();
      
      if (!Array.isArray(optionQuotes) || optionQuotes.length === 0) {
        results.push({ symbol: sym, quotes: 0, status: 'no_data' });
        continue;
      }
      
      // 5. Store quotes in D1 (batch insert)
      const insertStmt = db.prepare(
        `INSERT OR REPLACE INTO option_quotes 
         (symbol, expiry, strike, right, bid, ask, mid, iv, delta, gamma, vega, theta, volume, open_interest, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
      );
      
      for (const q of optionQuotes) {
        await insertStmt.bind(
          q.symbol,
          q.expiry,
          q.strike,
          q.right,
          q.bid,
          q.ask,
          q.mid,
          q.iv,
          q.delta,
          q.gamma,
          q.vega,
          q.theta,
          q.volume,
          q.openInterest,
          q.timestamp
        ).run();
      }
      
      totalQuotes += optionQuotes.length;
      results.push({ 
        symbol: sym, 
        quotes: optionQuotes.length,
        spot: spot,
        expiries: expiries,
        strikes: strikes.length,
        status: 'stored'
      });
      
    } catch (err: any) {
      console.error(`Error ingesting options for ${sym}:`, err);
      results.push({ symbol: sym, error: err.message, status: 'failed' });
    }
  }

  return c.json({ 
    timestamp: ts,
    symbols: SYMBOLS.length,
    totalQuotes,
    results
  });
});

export default app;

