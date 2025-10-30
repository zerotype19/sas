// IBKR broker proxy routes
// Proxies requests from Worker to IBKR microservice

import { Hono } from 'hono';
import type { Bindings } from '../env';

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Proxy request to IBKR broker service
 */
async function proxyToBroker(
  req: Request,
  env: Bindings,
  path: string
): Promise<Response> {
  const brokerBase = env.IBKR_BROKER_BASE || 'http://127.0.0.1:8081';
  const url = `${brokerBase}${path}`;
  
  // Get request body if POST
  const body = req.method === 'POST' ? await req.text() : null;
  
  // Build headers
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  
  // Add Cloudflare Access headers if configured (for production tunnel)
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers['cf-access-client-id'] = env.CF_ACCESS_CLIENT_ID;
    headers['cf-access-client-secret'] = env.CF_ACCESS_CLIENT_SECRET;
    console.log('✓ CF Access headers added');
  } else {
    console.log('⚠️ CF Access credentials missing!', {
      hasClientId: !!env.CF_ACCESS_CLIENT_ID,
      hasClientSecret: !!env.CF_ACCESS_CLIENT_SECRET
    });
  }
  
  console.log('Proxying to:', url);
  
  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body
    });
    
    const responseText = await response.text();
    
    return new Response(responseText, {
      status: response.status,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      }
    });
  } catch (error: any) {
    console.error(`IBKR proxy error (${path}):`, error);
    return new Response(
      JSON.stringify({ error: 'Broker service unavailable', message: error.message }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }
}

// Health check
app.get('/broker', async (c) => {
  const brokerBase = c.env.IBKR_BROKER_BASE || 'http://127.0.0.1:8081';
  return c.json({ service: 'IBKR Broker Proxy', brokerBase });
});

// Quote endpoint
app.post('/broker/quote', async (c) => {
  return proxyToBroker(c.req.raw, c.env, '/quote');
});

// Option chain endpoint
app.post('/broker/optionChain', async (c) => {
  return proxyToBroker(c.req.raw, c.env, '/optionChain');
});

// Place order endpoint (with additional checks)
app.post('/broker/placeOrder', async (c) => {
  const tradingMode = c.env.TRADING_MODE || 'paper';
  
  // Extra safeguards can be added here
  if (tradingMode !== 'paper') {
    console.warn('⚠️ Placing order in NON-PAPER mode');
    // Add additional verification, approval flags, etc.
  }
  
  // Parse body for guardrails
  try {
    const body = await c.req.json();
    
    // Example: Block large orders
    const MAX_QUANTITY = 100;
    if (body.quantity > MAX_QUANTITY) {
      return c.json({
        error: 'Order blocked',
        reason: `Quantity ${body.quantity} exceeds max ${MAX_QUANTITY}`
      }, 403);
    }
    
    // Example: Compute notional and block if excessive
    const MAX_NOTIONAL = 50000;
    if (body.assetType === 'STK' && body.limitPrice) {
      const notional = body.quantity * body.limitPrice;
      if (notional > MAX_NOTIONAL) {
        return c.json({
          error: 'Order blocked',
          reason: `Notional $${notional.toFixed(0)} exceeds max $${MAX_NOTIONAL}`
        }, 403);
      }
    }
    
    // Forward to broker
    const req = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: JSON.stringify(body)
    });
    
    return proxyToBroker(req, c.env, '/placeOrder');
  } catch (error: any) {
    return c.json({ error: 'Invalid request', message: error.message }, 400);
  }
});

// Positions endpoint
app.get('/broker/positions', async (c) => {
  return proxyToBroker(c.req.raw, c.env, '/positions');
});

// Account endpoint
app.get('/broker/account', async (c) => {
  return proxyToBroker(c.req.raw, c.env, '/account');
});

// Options quotes endpoint (Phase 2B - Greeks)
app.post('/broker/options/quotes', async (c) => {
  return proxyToBroker(c.req.raw, c.env, '/options/quotes');
});

// Options order placement endpoint (Phase 3 - Execution)
app.post('/broker/options/place', async (c) => {
  return proxyToBroker(c.req.raw, c.env, '/orders/options/place');
});

export default app;

