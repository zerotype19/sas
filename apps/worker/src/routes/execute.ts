/**
 * Phase 3: Order Execution
 * Approves proposals and routes orders to IBKR
 */

import { Hono } from 'hono';
import type { Bindings } from '../env';
import { sendTelegram } from '../utils/telegram';

const app = new Hono<{ Bindings: Bindings }>();

function maxNotional(env: Bindings): number {
  // Default max notional cap: $50k per position
  const hardCap = 50000;
  
  // If ACCOUNT_EQUITY is set, use percentage-based limit
  const equity = Number(env.ACCOUNT_EQUITY || 0);
  const riskPct = Number(env.RISK_MAX_EQUITY_AT_RISK_PCT || 20);
  
  if (equity > 0) {
    const pctLimit = (equity * riskPct) / 100;
    return Math.min(pctLimit, hardCap);
  }
  
  return hardCap;
}

function isPaper(env: Bindings): boolean {
  return (env.TRADING_MODE || 'paper') === 'paper';
}

/**
 * POST /execute/:id - Execute a proposal (paper trading only)
 */
app.post('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  
  if (!id || isNaN(id)) {
    return c.json({ ok: false, error: 'Invalid proposal ID' }, 400);
  }

  // Fetch proposal
  const row = await c.env.DB.prepare(
    `SELECT * FROM proposals WHERE id = ?1`
  ).bind(id).first();

  if (!row) {
    return c.json({ ok: false, error: 'Proposal not found' }, 404);
  }

  // Paper trading only
  if (!isPaper(c.env)) {
    return c.json({ 
      ok: false, 
      error: 'Live trading is disabled. Only paper trading is allowed.' 
    }, 403);
  }

  // Validate qty
  const qty = Number(row.qty || 0);
  if (!qty || qty < 1) {
    return c.json({ ok: false, error: 'Invalid quantity' }, 400);
  }

  // Guardrails: check notional
  const entryType = row.entry_type as 'CREDIT_SPREAD' | 'DEBIT_CALL';
  const limitPrice = Number(row.entry_price);
  let approxNotional = 0;

  if (entryType === 'DEBIT_CALL') {
    approxNotional = limitPrice * 100 * qty;
  } else {
    // Credit spread: max loss is (width - credit) * 100 * qty
    // Conservative: use credit as proxy
    approxNotional = Math.abs(limitPrice) * 100 * qty;
  }

  const maxAllowed = maxNotional(c.env);
  if (approxNotional > maxAllowed) {
    return c.json({ 
      ok: false, 
      error: `Order exceeds MAX_NOTIONAL guardrail ($${approxNotional.toFixed(0)} > $${maxAllowed})` 
    }, 400);
  }

  // Build payload
  const legs = JSON.parse(row.legs_json || '[]');
  const payload = {
    symbol: row.symbol,
    qty,
    entry_type: entryType,
    limit_price: Number(limitPrice.toFixed(2)),
    legs: legs.map((l: any) => ({
      side: l.side,
      type: l.type,
      expiry: l.expiry,
      strike: Number(l.strike),
    })),
    tif: 'DAY',
  };

  // Submit to broker (direct to IBKR service, not through Worker proxy)
  const brokerBase = c.env.IBKR_BROKER_BASE || 'http://127.0.0.1:8081';
  const brokerUrl = `${brokerBase}/orders/options/place`;

  console.log(`Executing proposal ${id}: ${row.symbol} ${entryType} x${qty}`);
  console.log('Broker URL:', brokerUrl);
  console.log('Broker payload:', JSON.stringify(payload, null, 2));
  
  // Build headers with CF Access credentials
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  
  // Add Cloudflare Access headers if configured (for production tunnel)
  if (c.env.CF_ACCESS_CLIENT_ID && c.env.CF_ACCESS_CLIENT_SECRET) {
    headers['cf-access-client-id'] = c.env.CF_ACCESS_CLIENT_ID;
    headers['cf-access-client-secret'] = c.env.CF_ACCESS_CLIENT_SECRET;
    console.log('✓ CF Access credentials added to request');
  } else {
    console.log('⚠️ CF Access credentials not found in environment');
  }
  
  let brokerResponse;
  let brokerRawText = '';
  try {
    const r = await fetch(brokerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    brokerRawText = await r.text();
    console.log('Broker response status:', r.status);
    console.log('Broker response body:', brokerRawText);

    // Try to parse as JSON
    try {
      brokerResponse = JSON.parse(brokerRawText);
    } catch (parseError) {
      // Not JSON - treat as error message
      console.error('Broker returned non-JSON response:', brokerRawText);
      return c.json({ 
        ok: false, 
        error: 'Broker returned invalid response', 
        details: brokerRawText.slice(0, 500) // Truncate long errors
      }, 500);
    }

    // Check if broker returned an error
    if (!r.ok || !brokerResponse.ok) {
      return c.json({
        ok: false,
        error: 'Broker rejected order',
        details: brokerResponse.error || brokerResponse.detail || brokerRawText.slice(0, 500)
      }, 500);
    }

  } catch (error: any) {
    console.error('Broker request failed:', error);
    return c.json({ 
      ok: false, 
      error: 'Failed to contact broker service', 
      details: error.message 
    }, 500);
  }

  // Persist trade
  const now = Date.now();
  const tradeStatus = brokerResponse.ok ? 'submitted' : 'rejected';
  const notional = entryType === 'DEBIT_CALL' 
    ? payload.limit_price * 100 * qty 
    : -payload.limit_price * 100 * qty;

  let tradeId: number | undefined;
  
  try {
    const ins = await c.env.DB.prepare(
      `INSERT INTO trades 
       (created_at, proposal_id, symbol, strategy, entry_type,
        legs_json, qty, limit_price, status, notional, meta_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(
      now,
      id,
      row.symbol,
      row.strategy,
      entryType,
      JSON.stringify(legs),
      qty,
      payload.limit_price,
      tradeStatus,
      notional,
      JSON.stringify({ broker: brokerResponse })
    ).run();

    tradeId = ins.meta.last_row_id as number | undefined;
    console.log('Trade inserted:', tradeId);
  } catch (dbError: any) {
    console.error('Failed to insert trade:', dbError.message);
    // Continue even if D1 insert fails
    tradeId = undefined;
  }

  // Update proposal status
  if (brokerResponse.ok) {
    await c.env.DB.prepare(
      `UPDATE proposals SET status = 'submitted' WHERE id = ?1`
    ).bind(id).run();
  }

  // Telegram notification
  if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID) {
    const emoji = brokerResponse.ok ? '✅' : '❌';
    const statusText = brokerResponse.ok ? 'submitted' : 'failed';
    const message = `${emoji} <b>Execution ${statusText}</b>\n\nProposal #${id} → Trade #${tradeId}\n<b>${row.symbol}</b> • ${row.strategy} • ${row.entry_type}\nLimit: $${payload.limit_price} • Qty: ${payload.qty}`;
    
    await sendTelegram(message, c.env);
  }

  return c.json({
    ok: brokerResponse.ok,
    trade_id: tradeId,
    broker: brokerResponse,
  });
});

export default app;

