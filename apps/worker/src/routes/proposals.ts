/**
 * Proposals API Route
 * Provides read-only access to proposals for the UI
 */

import { Hono } from 'hono';
import type { Bindings } from '../env';

const app = new Hono<{ Bindings: Bindings }>();

/**
 * GET /proposals - List all proposals (most recent first)
 */
app.get('/', async (c) => {
  const db = c.env.DB;

  if (!db) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  try {
    const rows = await db
      .prepare(
        `SELECT 
          id, created_at, symbol, strategy, action, entry_type, 
          entry_price, target_price, stop_price,
          legs_json, qty, pop, rr, score, status, rationale
        FROM proposals
        ORDER BY created_at DESC
        LIMIT 100`
      )
      .all();

    return c.json(rows.results || []);
  } catch (error: any) {
    console.error('Proposals fetch error:', error);
    return c.json(
      { error: 'Failed to fetch proposals', message: error.message },
      500
    );
  }
});

export default app;

