import { Hono } from 'hono';
import type { Bindings } from '../env';
import { sendTelegram, formatProposalMessage, formatProposalMsg } from '../utils/telegram';
import { legsHash } from '../utils/hash';

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Create a new trading proposal
 * Stores in D1 and optionally sends Telegram alert
 */
app.post('/', async (c) => {
  const db = c.env.DB;

  if (!db) {
    return c.json({ error: 'Database not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const {
      symbol,
      strategy,
      action,
      entry_type,
      entry_price,
      target_price,
      stop_price,
      rationale,
      score,
      legs_json,
      qty,
      pop,
      rr
    } = body;

    // Validation
    if (!symbol || !strategy || !action) {
      return c.json({ error: 'Missing required fields: symbol, strategy, action' }, 400);
    }

    // Deduplication: check for existing proposal with same legs in last 24h
    const legs = (() => {
      try {
        return JSON.parse(legs_json || '[]');
      } catch {
        return [];
      }
    })();

    const dedupeKey = await legsHash(symbol, strategy, entry_type || '', legs);
    
    const duplicate = await db
      .prepare(
        `SELECT id FROM proposals
         WHERE dedupe_key = ?1 AND created_at > ?2
         LIMIT 1`
      )
      .bind(dedupeKey, Date.now() - 24 * 3600 * 1000)
      .all();

    if (duplicate.results && duplicate.results.length > 0) {
      console.log(`Duplicate proposal detected for ${symbol}, skipping`);
      return c.json({
        ok: true,
        deduped: true,
        id: duplicate.results[0].id,
        message: 'Proposal already exists (deduplicated)'
      });
    }

    // Insert into D1
    const result = await db
      .prepare(
        `INSERT INTO proposals
         (created_at, symbol, strategy, action, entry_type, entry_price, target_price, stop_price, 
          rationale, status, score, opportunity_score, legs_json, qty, pop, rr, dedupe_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
      )
      .bind(
        Date.now(),
        symbol,
        strategy,
        action,
        entry_type || null,
        entry_price || null,
        target_price || null,
        stop_price || null,
        rationale || null,
        score || 0,
        score || 0, // opportunity_score for backward compat
        legs_json || null,
        qty || null,
        pop || null,
        rr || null,
        dedupeKey
      )
      .run();

    const proposalId = result.meta.last_row_id;

    // Telegram only for high-score signals (>= 50)
    if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID && (score ?? 0) >= 50) {
      const message = formatProposalMsg({
        id: proposalId,
        symbol,
        strategy,
        action,
        entry_type,
        entry_price,
        target_price,
        stop_price,
        rationale,
        score,
        legs_json,
        qty,
        pop,
        rr
      });

      await sendTelegram(message, c.env);
    }

    return c.json({
      ok: true,
      id: proposalId,
      proposal: {
        id: proposalId,
        symbol,
        strategy,
        action,
        entry_type,
        entry_price,
        target_price,
        stop_price,
        rationale,
        score,
        legs_json,
        qty,
        pop,
        rr,
        dedupe_key: dedupeKey,
        status: 'pending',
        created_at: Date.now()
      }
    });
  } catch (error: any) {
    console.error('Propose error:', error);
    return c.json({ error: 'Failed to create proposal', message: error.message }, 500);
  }
});

export default app;

