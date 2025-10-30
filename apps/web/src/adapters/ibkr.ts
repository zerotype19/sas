// IBKR Broker Adapter
// Client-side adapter for calling IBKR broker endpoints via Worker proxy

const BASE = '/api/broker';

export interface Quote {
  symbol: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: number;
}

export interface OptionChainRequest {
  symbol: string;
  exchange?: string;
  currency?: string;
  right?: 'C' | 'P';
  strike?: number;
  expiry?: string;
}

export interface OptionChainItem {
  symbol: string;
  expiry: string;
  strike: number;
  right: 'C' | 'P';
  multiplier: number;
  exchange: string;
}

export interface PlaceOrderRequest {
  symbol: string;
  assetType?: 'STK' | 'OPT';
  quantity: number;
  side: 'BUY' | 'SELL';
  orderType: 'MKT' | 'LMT' | 'STP' | 'STP_LMT';
  limitPrice?: number;
  stopPrice?: number;
  tif?: 'DAY' | 'GTC' | 'IOC' | 'FOK';
  option?: {
    expiry: string;
    strike: number;
    right: 'C' | 'P';
    multiplier?: number;
    exchange?: string;
  };
}

export interface OrderResponse {
  orderId: number;
  status: string;
}

export interface Position {
  symbol: string;
  assetType: 'STK' | 'OPT';
  quantity: number;
  avgPrice: number;
  marketPrice: number | null;
  unrealizedPnl: number | null;
  expiry?: string;
  strike?: number;
  right?: 'C' | 'P';
}

export interface AccountSummary {
  accountId: string;
  cash: number;
  equity: number;
  buyingPower: number | null;
  excessLiquidity: number | null;
}

/**
 * Get real-time quote for a symbol
 */
export async function getQuote(symbol: string, exchange = 'SMART'): Promise<Quote> {
  const response = await fetch(`${BASE}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, exchange })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Quote failed (${response.status}): ${error}`);
  }
  
  return response.json();
}

/**
 * Get option chain for a symbol
 */
export async function getOptionChain(request: OptionChainRequest): Promise<OptionChainItem[]> {
  const response = await fetch(`${BASE}/optionChain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Option chain failed (${response.status}): ${error}`);
  }
  
  return response.json();
}

/**
 * Place an order
 */
export async function placeOrder(request: PlaceOrderRequest): Promise<OrderResponse> {
  const response = await fetch(`${BASE}/placeOrder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Order failed (${response.status}): ${error}`);
  }
  
  return response.json();
}

/**
 * Get all positions
 */
export async function getPositions(): Promise<Position[]> {
  try {
    const response = await fetch(`${BASE}/positions`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : (data.positions ?? []);
  } catch {
    return [];
  }
}

/**
 * Get account summary
 */
export async function getAccount(): Promise<AccountSummary> {
  const response = await fetch(`${BASE}/account`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Account failed (${response.status}): ${error}`);
  }
  
  return response.json();
}

