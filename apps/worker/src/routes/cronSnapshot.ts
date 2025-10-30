/**
 * Daily IV Snapshot Cron
 * 
 * Runs at 16:10 ET (4:10 PM) to capture end-of-day ATM IV for all tracked symbols
 * This keeps iv_history fresh for IVR calculations
 * 
 * Scheduled via wrangler.toml cron trigger
 */

import { Hono } from 'hono';
import type { Bindings } from '../env';

const app = new Hono<{ Bindings: Bindings }>();

const UNIVERSE = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'META', 'GOOGL', 'NFLX'];

interface OptionQuote {
  symbol: string;
  expiry: string;
  strike: number;
  right: 'C' | 'P';
  delta?: number;
  iv?: number;
}

/**
 * Find ATM IV from option chain
 * Uses front-month, ~50 delta calls/puts
 */
function extractAtmIv(quotes: OptionQuote[]): number | null {
  if (!quotes.length) return null;
  
  // Get front-month expiry
  const expiries = [...new Set(quotes.map(q => q.expiry))].sort();
  const frontMonth = expiries[0];
  
  const frontQuotes = quotes.filter(q => q.expiry === frontMonth && q.iv != null);
  
  // Find ~50 delta options (ATM)
  const atmCalls = frontQuotes
    .filter(q => q.right === 'C' && q.delta != null)
    .filter(q => Math.abs((q.delta ?? 0) - 0.50) <= 0.10)
    .sort((a, b) => Math.abs((a.delta ?? 0) - 0.50) - Math.abs((b.delta ?? 0) - 0.50));
  
  const atmPuts = frontQuotes
    .filter(q => q.right === 'P' && q.delta != null)
    .filter(q => Math.abs((q.delta ?? 0) + 0.50) <= 0.10)
    .sort((a, b) => Math.abs((a.delta ?? 0) + 0.50) - Math.abs((b.delta ?? 0) + 0.50));
  
  // Average call and put IV if both available
  if (atmCalls.length && atmPuts.length) {
    return ((atmCalls[0].iv ?? 0) + Math.abs(atmPuts[0].iv ?? 0)) / 2;
  }
  
  // Fallback to whichever is available
  return atmCalls[0]?.iv ?? (atmPuts[0] ? Math.abs(atmPuts[0].iv ?? 0) : null);
}

/**
 * GET /cron/snapshot
 * 
 * Daily end-of-day IV snapshot for IVR calculation
 */
app.get('/', async (c) => {
  const brokerBase = c.env.IBKR_BROKER_BASE || 'http://localhost:8081';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Add Cloudflare Access headers if available
  if (c.env.CF_ACCESS_CLIENT_ID && c.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = c.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = c.env.CF_ACCESS_CLIENT_SECRET;
  }
  
  const results: Array<{ symbol: string; atm_iv: number | null; status: string }> = [];
  const now = Date.now();
  
  for (const symbol of UNIVERSE) {
    try {
      // Define front-month expiry and ATM strikes
      const expiry = '2025-12-05'; // Front month (adjust as needed)
      const strikes = [90, 95, 100, 105, 110]; // ~ATM range
      
      // Build contract list (both calls and puts)
      const contracts = [];
      for (const strike of strikes) {
        contracts.push({ symbol, expiry, strike, right: 'C', exchange: 'SMART' });
        contracts.push({ symbol, expiry, strike, right: 'P', exchange: 'SMART' });
      }
      
      // Fetch option quotes
      const resp = await fetch(`${brokerBase}/options/quotes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contracts })
      });
      
      if (!resp.ok) {
        console.error(`[IV Snapshot] Failed to fetch ${symbol}: ${resp.status}`);
        results.push({ symbol, atm_iv: null, status: `fetch_error_${resp.status}` });
        continue;
      }
      
      const raw = await resp.json();
      const quotes: OptionQuote[] = Array.isArray(raw) ? raw : (raw?.quotes ?? []);
      const atmIv = extractAtmIv(quotes);
      
      if (atmIv != null) {
        // Insert or ignore (unique per symbol/day)
        try {
          await c.env.DB.prepare(
            'INSERT OR IGNORE INTO iv_history (symbol, iv, timestamp) VALUES (?, ?, ?)'
          ).bind(symbol, atmIv, now).run();
          console.log(`[IV Snapshot] ${symbol}: ${atmIv.toFixed(2)}%`);
          results.push({ symbol, atm_iv: atmIv, status: 'ok' });
        } catch (e) {
          // Treat unique conflicts as skipped
          console.warn(`[IV Snapshot] ${symbol}: skipped (duplicate for day)`);
          results.push({ symbol, atm_iv: atmIv, status: 'skipped' });
        }
      } else {
        console.warn(`[IV Snapshot] ${symbol}: no ATM IV found`);
        results.push({ symbol, atm_iv: null, status: 'no_atm_iv' });
      }
      
    } catch (err) {
      console.error(`[IV Snapshot] ${symbol} error:`, err);
      results.push({ symbol, atm_iv: null, status: 'error' });
    }
  }
  
  const successful = results.filter(r => r.status === 'ok').length;
  
  return c.json({
    timestamp: now,
    date: new Date(now).toISOString().split('T')[0],
    total: UNIVERSE.length,
    successful,
    results
  });
});

export default app;

