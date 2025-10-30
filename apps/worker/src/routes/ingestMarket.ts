// Market Data Ingestion Route
// Fetches quotes from IBKR and stores them in D1

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

app.get('/', async (c) => {
  const env = c.env;
  const db = env.DB;
  const ts = Date.now();
  
  // Skip ingestion outside market hours
  if (!isUsMarketOpen()) {
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
  
  for (const sym of SYMBOLS) {
    try {
      // Fetch quote from IBKR broker service
      const brokerBase = env.IBKR_BROKER_BASE || 'http://127.0.0.1:8081';
      const headers: Record<string, string> = {
        'content-type': 'application/json'
      };
      
      // Add Cloudflare Access headers if configured
      if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
        headers['cf-access-client-id'] = env.CF_ACCESS_CLIENT_ID;
        headers['cf-access-client-secret'] = env.CF_ACCESS_CLIENT_SECRET;
      }
      
      const res = await fetch(`${brokerBase}/quote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ symbol: sym })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      
      const quote = await res.json();
      
      // Store in D1
      await db
        .prepare(
          `INSERT INTO market_data (symbol, timestamp, bid, ask, last)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(sym, ts, quote.bid, quote.ask, quote.last)
        .run();
      
      results.push({ 
        symbol: sym, 
        bid: quote.bid, 
        ask: quote.ask, 
        last: quote.last,
        status: 'stored'
      });
    } catch (err: any) {
      console.error(`Error ingesting ${sym}:`, err);
      results.push({ symbol: sym, error: err.message, status: 'failed' });
    }
  }

  return c.json({ 
    timestamp: ts,
    inserted: results.filter(r => r.status === 'stored').length,
    failed: results.filter(r => r.status === 'failed').length,
    data: results 
  });
});

export default app;

