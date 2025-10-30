import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Bindings } from './env';
import { tryBuildProposal } from './sas';
import { sendSlack } from './alerts/slack';
import { sendTelegramPosition } from './alerts/telegram';
import { checkGuardrails } from './risk';
import ibkrRoutes from './routes/ibkr';
import ingestMarket from './routes/ingestMarket';
import ingestOptions from './routes/ingestOptions';
import searchOpportunities from './routes/searchOpportunities';
import strategyEvaluate from './routes/strategyEvaluate';
import strategyRun from './routes/strategyRun';
import propose from './routes/propose';
import proposals from './routes/proposals';
import execute from './routes/execute';

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for local dev
app.use('/*', cors());

// Health check endpoint
app.get('/health', (c) => c.json({ 
  ok: true, 
  time: Date.now(),
  service: 'sas-worker',
  version: '1.0.0'
}));

// Mount IBKR broker routes
app.route('/', ibkrRoutes);

// Mount market data routes
app.route('/ingest/market', ingestMarket);
app.route('/ingest/options', ingestOptions);
app.route('/search/opportunities', searchOpportunities);

// Mount strategy and proposal routes
app.route('/strategy/evaluate', strategyEvaluate);
app.route('/strategy/run', strategyRun);
app.route('/propose', propose);
app.route('/proposals', proposals);
app.route('/execute', execute);

// Validation schemas
const SignalSchema = z.object({
  symbol: z.string(),
  asof: z.string(),
  iv30: z.number(),
  rv20: z.number(),
  skew_slope: z.number().optional(),
  skew_z: z.number(),
  momentum: z.number(),
  term_slope: z.number().optional(),
  metadata: z.any().optional()
});

const ApproveSchema = z.object({
  proposal_id: z.string(),
  qty: z.number().int().positive()
});

// Health check
app.get('/', (c) => {
  return c.json({ 
    service: 'SAS Worker', 
    version: '1.0.0',
    env: c.env.APP_ENV 
  });
});

// POST /ingest/xynth - Webhook from Xynth for new signals
app.post('/ingest/xynth', async (c) => {
  try {
    const body = await c.req.json();
    const parse = SignalSchema.safeParse(body);
    
    if (!parse.success) {
      return c.json({ 
        error: 'Invalid payload', 
        details: parse.error.flatten() 
      }, 400);
    }
    
    const sig = parse.data;
    const id = `${sig.symbol}_${sig.asof.replace(/[:.]/g, '_')}`;
    
    // Check KV for deduplication
    const existing = await c.env.KV.get(`signal:${id}`);
    if (existing) {
      return c.json({ ok: true, id, status: 'duplicate' }, 200);
    }
    
    // Store signal in D1
    const iv_rv_spread = sig.iv30 - sig.rv20;
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO signals(id, asof, symbol, skew_z, iv30, rv20, iv_rv_spread, momentum, term_slope, regime, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      sig.asof,
      sig.symbol,
      sig.skew_z,
      sig.iv30,
      sig.rv20,
      iv_rv_spread,
      sig.momentum,
      sig.term_slope ?? null,
      null,
      JSON.stringify(body)
    ).run();
    
    // Mark as seen in KV (24h TTL)
    await c.env.KV.put(`signal:${id}`, '1', { expirationTtl: 86400 });
    
    // Enqueue for proposal construction
    await c.env.INGEST_QUEUE.send(JSON.stringify({ signal_id: id }));
    
    return c.json({ ok: true, id, status: 'queued' }, 202);
  } catch (error: any) {
    console.error('Ingest error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// GET /review - List pending proposals
app.get('/review', async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      `SELECT * FROM proposals WHERE status='pending' ORDER BY created_at DESC LIMIT 50`
    ).all();
    
    const proposals = (rows.results ?? []).map((row: any) => {
      // Parse JSON fields if they exist (for backward compatibility)
      const parsed: any = { ...row };
      if (row.long_leg && typeof row.long_leg === 'string') {
        try { parsed.long_leg = JSON.parse(row.long_leg); } catch {}
      }
      if (row.short_leg && typeof row.short_leg === 'string') {
        try { parsed.short_leg = JSON.parse(row.short_leg); } catch {}
      }
      if (row.filters && typeof row.filters === 'string') {
        try { parsed.filters = JSON.parse(row.filters); } catch {}
      }
      return parsed;
    });
    
    return c.json(proposals);
  } catch (error: any) {
    console.error('Review error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// GET /proposals/:id - Get single proposal
app.get('/proposals/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT * FROM proposals WHERE id=?`
    ).bind(id).first();
    
    if (!row) {
      return c.json({ error: 'Not found' }, 404);
    }
    
    // Parse JSON fields if they exist (for backward compatibility)
    const proposal: any = { ...row };
    if (row.long_leg && typeof row.long_leg === 'string') {
      try { proposal.long_leg = JSON.parse(row.long_leg); } catch {}
    }
    if (row.short_leg && typeof row.short_leg === 'string') {
      try { proposal.short_leg = JSON.parse(row.short_leg); } catch {}
    }
    if (row.filters && typeof row.filters === 'string') {
      try { proposal.filters = JSON.parse(row.filters); } catch {}
    }
    
    return c.json(proposal);
  } catch (error: any) {
    console.error('Proposal fetch error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// POST /act/approve - Approve proposal and create position
app.post('/act/approve', async (c) => {
  try {
    const body = await c.req.json();
    const parse = ApproveSchema.safeParse(body);
    
    if (!parse.success) {
      return c.json({ 
        error: 'Invalid request', 
        details: parse.error.flatten() 
      }, 400);
    }
    
    const { proposal_id, qty } = parse.data;
    
    // Fetch proposal
    const proposal = await c.env.DB.prepare(
      `SELECT * FROM proposals WHERE id=?`
    ).bind(proposal_id).first();
    
    if (!proposal) {
      return c.json({ error: 'Proposal not found' }, 404);
    }
    
    if (proposal.status !== 'pending') {
      return c.json({ error: 'Proposal already processed', status: proposal.status }, 400);
    }
    
    // Check guardrails
    const guardCheck = await checkGuardrails(c.env, proposal as any, qty);
    if (!guardCheck.allowed) {
      // Send alert about blocked trade
      await sendSlack(c.env, `⚠️ SAS Guard: Blocked ${proposal.symbol} - ${guardCheck.reason}`);
      await sendTelegramPosition(c.env, 'guard_blocked', {
        symbol: proposal.symbol,
        reason: guardCheck.reason
      });
      return c.json({ 
        error: 'Guardrail violation', 
        reason: guardCheck.reason 
      }, 403);
    }
    
    // Create position
    const posId = `pos_${proposal_id.replace('prop_', '')}`;
    const now = new Date().toISOString();
    
    await c.env.DB.prepare(
      `INSERT INTO positions(id, opened_at, proposal_id, symbol, bias, qty, entry_debit, dte, rules, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
    ).bind(
      posId,
      now,
      proposal_id,
      proposal.symbol,
      proposal.bias,
      qty,
      proposal.debit,
      proposal.dte,
      JSON.stringify({ tp_pct: 0.5, sl_pct: -0.5, time_stop_dte: 10 })
    ).run();
    
    // Mark proposal as approved
    await c.env.DB.prepare(
      `UPDATE proposals SET status='approved' WHERE id=?`
    ).bind(proposal_id).run();
    
    // Send success alerts
    await sendSlack(
      c.env, 
      `✅ SAS: Approved ${proposal.symbol} (${proposal.bias}) x${qty} @ ${proposal.debit}`
    );
    await sendTelegramPosition(c.env, 'approved', {
      symbol: proposal.symbol,
      bias: proposal.bias,
      qty,
      debit: proposal.debit,
      position_id: posId
    });
    
    return c.json({ 
      ok: true, 
      position_id: posId,
      proposal_id,
      symbol: proposal.symbol,
      qty 
    });
  } catch (error: any) {
    console.error('Approve error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// POST /act/skip - Skip a proposal
app.post('/act/skip', async (c) => {
  try {
    const { proposal_id } = await c.req.json();
    
    if (!proposal_id) {
      return c.json({ error: 'proposal_id required' }, 400);
    }
    
    const result = await c.env.DB.prepare(
      `UPDATE proposals SET status='skipped' WHERE id=? AND status='pending'`
    ).bind(proposal_id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Proposal not found or already processed' }, 404);
    }
    
    return c.json({ ok: true, proposal_id, status: 'skipped' });
  } catch (error: any) {
    console.error('Skip error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// GET /positions - List all positions
app.get('/positions', async (c) => {
  try {
    const state = c.req.query('state') || 'open';
    
    const rows = await c.env.DB.prepare(
      `SELECT * FROM positions WHERE state=? ORDER BY opened_at DESC LIMIT 100`
    ).bind(state).all();
    
    const positions = (rows.results ?? []).map((row: any) => ({
      ...row,
      rules: JSON.parse(row.rules)
    }));
    
    return c.json(positions);
  } catch (error: any) {
    console.error('Positions fetch error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// GET /positions/:id - Get position with PnL history
app.get('/positions/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    const position = await c.env.DB.prepare(
      `SELECT * FROM positions WHERE id=?`
    ).bind(id).first();
    
    if (!position) {
      return c.json({ error: 'Not found' }, 404);
    }
    
    const pnlRows = await c.env.DB.prepare(
      `SELECT * FROM pnl WHERE position_id=? ORDER BY asof ASC`
    ).bind(id).all();
    
    return c.json({
      ...position,
      rules: JSON.parse(position.rules as string),
      pnl_history: pnlRows.results ?? []
    });
  } catch (error: any) {
    console.error('Position fetch error:', error);
    return c.json({ error: 'Internal error', message: error.message }, 500);
  }
});

// Export main handler
export default app;

