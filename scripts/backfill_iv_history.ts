#!/usr/bin/env tsx
/**
 * Backfill iv_history with 60 days of realistic ATM IV snapshots
 * 
 * Usage:
 *   npx tsx scripts/backfill_iv_history.ts
 * 
 * This generates deterministic mock IV history using:
 * - Base IV = 30% ± symbol-specific noise
 * - Sine wave cycle (~20 days) for mean reversion
 * - Small daily randomness (±2%)
 */

const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'META', 'GOOGL', 'NFLX'];
const DAYS = 60;
const BASE_IV = 30.0; // 30% baseline

interface IvHistoryRow {
  symbol: string;
  iv: number;
  timestamp: number;
}

function generateIvHistory(symbol: string, days: number): IvHistoryRow[] {
  const rows: IvHistoryRow[] = [];
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  // Symbol-specific base offset (-5% to +5%)
  const seed = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const symbolOffset = ((seed % 10) - 5) * 1.0; // -5% to +5%
  
  for (let i = days - 1; i >= 0; i--) {
    const timestamp = now - (i * oneDayMs);
    
    // Sine wave for mean reversion (~20 day cycle)
    const cycle = Math.sin((i / 20) * Math.PI * 2) * 3.0; // ±3%
    
    // Small daily noise (±2%)
    const dailyNoise = (Math.random() - 0.5) * 4.0; // ±2%
    
    // Combine: base + symbol offset + cycle + noise
    const iv = Math.max(10, Math.min(60, BASE_IV + symbolOffset + cycle + dailyNoise));
    
    rows.push({
      symbol,
      iv: Math.round(iv * 100) / 100, // Round to 2 decimals
      timestamp
    });
  }
  
  return rows;
}

function generateSqlInserts(rows: IvHistoryRow[]): string {
  const values = rows.map(r => 
    `('${r.symbol}', ${r.iv}, ${r.timestamp})`
  ).join(',\n  ');
  
  return `INSERT INTO iv_history (symbol, iv, timestamp) VALUES\n  ${values};`;
}

async function main() {
  console.log('🔄 Generating 60-day IV history for', SYMBOLS.length, 'symbols...\n');
  
  const allRows: IvHistoryRow[] = [];
  
  for (const symbol of SYMBOLS) {
    const rows = generateIvHistory(symbol, DAYS);
    allRows.push(...rows);
    
    const avgIv = rows.reduce((sum, r) => sum + r.iv, 0) / rows.length;
    const minIv = Math.min(...rows.map(r => r.iv));
    const maxIv = Math.max(...rows.map(r => r.iv));
    
    console.log(`${symbol}: ${rows.length} rows | avg=${avgIv.toFixed(1)}% | range=${minIv.toFixed(1)}-${maxIv.toFixed(1)}%`);
  }
  
  console.log('\n📊 Total rows:', allRows.length);
  console.log('\n📝 SQL Insert Statement:\n');
  console.log('--- Copy this to wrangler d1 execute ---\n');
  console.log(generateSqlInserts(allRows));
  console.log('\n✅ Done!');
}

main();

