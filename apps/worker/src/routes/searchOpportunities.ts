// Search Opportunities Route
// Analyzes market data to find trading opportunities

import { Hono } from 'hono';
import type { Bindings } from '../env';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
  const db = c.env.DB;

  if (!db) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  try {
    // Find symbols with biggest price movement in last 6 hours
    const { results } = await db
      .prepare(
        `SELECT symbol, 
                AVG(last) as avgLast,
                MAX(last) as high, 
                MIN(last) as low,
                COUNT(*) as dataPoints,
                (MAX(last) - MIN(last)) / MIN(last) * 100 as volRange
         FROM market_data
         WHERE timestamp > ?1
           AND last IS NOT NULL
           AND last > 0
         GROUP BY symbol
         HAVING dataPoints >= 3
         ORDER BY volRange DESC
         LIMIT 10`
      )
      .bind(Date.now() - (6 * 60 * 60 * 1000)) // Last 6 hours
      .all();

    const opportunities = (results as any[]).map((r: any) => ({
      symbol: r.symbol,
      avg: Number(r.avgLast || 0).toFixed(2),
      high: Number(r.high || 0).toFixed(2),
      low: Number(r.low || 0).toFixed(2),
      rangePct: Number(r.volRange || 0).toFixed(2),
      dataPoints: r.dataPoints,
      score: calculateScore(r)
    }));

    return c.json({
      timestamp: Date.now(),
      count: opportunities.length,
      opportunities
    });
  } catch (err: any) {
    console.error('Search error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Simple scoring function
function calculateScore(data: any): number {
  const volRange = Number(data.volRange || 0);
  const dataPoints = Number(data.dataPoints || 0);
  
  // Higher score for higher volatility and more data points
  const score = (volRange * 10) + (dataPoints * 0.5);
  
  return Number(score.toFixed(2));
}

export default app;

