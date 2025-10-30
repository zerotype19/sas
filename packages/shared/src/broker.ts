// Broker abstraction types for IBKR integration

export type Side = 'BUY' | 'SELL';
export type OrderType = 'MKT' | 'LMT' | 'STP' | 'STP_LMT';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC' | 'FOK';

export interface Quote {
  symbol: string;
  exchange?: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: number;
}

export interface OptionContractRequest {
  symbol: string;
  currency?: string;
  exchange?: string;
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
  side: Side;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  tif?: TimeInForce;
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

export interface IBKRPosition {
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

