import { Hono } from 'hono';
import type { Bindings } from '../env';

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Evaluates market data to generate trading signals
 * Strategy: Momentum breakout detection
 */
app.get('/', async (c) => {
  const db = c.env.DB;

  if (!db) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  try {
    // Get symbols that have enough data points (need at least 2 for momentum calc)
    const { results: symbols } = await db
      .prepare(
        `SELECT symbol, COUNT(*) as count
         FROM market_data
         GROUP BY symbol
         HAVING count >= 2
         ORDER BY symbol`
      )
      .all();

    const proposals: any[] = [];

    for (const row of symbols) {
      const symbol = row.symbol as string;

      // Get last 3 data points
      const { results: prices } = await db
        .prepare(
          `SELECT last, timestamp FROM market_data 
           WHERE symbol = ? AND last IS NOT NULL
           ORDER BY timestamp DESC LIMIT 3`
        )
        .bind(symbol)
        .all();

      if (prices.length < 2) continue;

      const latest = prices[0].last as number;
      const prev = prices[1].last as number;

      if (!latest || !prev || latest === 0 || prev === 0) continue;

      // Calculate momentum
      const change = ((latest - prev) / prev) * 100;
      const absChange = Math.abs(change);

      // Signal thresholds
      let action = 'HOLD';
      let strategy = 'momentum_breakout';
      let rationale = '';

      if (change > 1.5) {
        action = 'BUY';
        rationale = `${change.toFixed(2)}% upward momentum detected. Strong bullish signal.`;
      } else if (change < -1.5) {
        action = 'SELL';
        rationale = `${Math.abs(change).toFixed(2)}% downward momentum detected. Strong bearish signal.`;
      }

      if (action !== 'HOLD') {
        // Calculate entry/target/stop prices
        const entry = latest;
        const target = action === 'BUY' ? latest * 1.05 : latest * 0.95;
        const stop = action === 'BUY' ? latest * 0.98 : latest * 1.02;

        proposals.push({
          symbol,
          action,
          strategy,
          change: +change.toFixed(2),
          entry_price: +entry.toFixed(2),
          target_price: +target.toFixed(2),
          stop_price: +stop.toFixed(2),
          rationale,
          score: +absChange.toFixed(2),
          timestamp: Date.now()
        });
      }
    }

    // Sort by score (highest first)
    proposals.sort((a, b) => b.score - a.score);

    return c.json({
      timestamp: Date.now(),
      count: proposals.length,
      proposals: proposals.slice(0, 10) // Top 10 signals
    });
  } catch (error: any) {
    console.error('Strategy evaluation error:', error);
    return c.json({ error: 'Evaluation failed', message: error.message }, 500);
  }
});

export default app;

