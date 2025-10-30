// Core domain types for SAS system

export type Signal = {
  id: string;
  asof: string;
  symbol: string;
  skew_z: number;
  iv30: number;
  rv20: number;
  iv_rv_spread: number;
  momentum: number;
  term_slope?: number;
  regime?: string;
  source?: any;
};

export type Bias = 'bullish' | 'bearish';

export type Leg = {
  type: 'C' | 'P';
  strike: string | number;
  delta?: number;
  exp: string;
};

export type Proposal = {
  id: string;
  created_at: string;
  symbol: string;
  bias: Bias;
  dte: number;
  long_leg: Leg;
  short_leg: Leg;
  width: number;
  debit: number;
  max_profit: number;
  rr: number;
  filters: {
    skew_z: number;
    iv_rv_spread: number;
    momentum: number;
    vix?: number;
  };
  status: 'pending' | 'approved' | 'skipped';
  strategy_version: string;
};

export type PositionRules = {
  tp_pct: number;
  sl_pct: number;
  time_stop_dte: number;
};

export type Position = {
  id: string;
  opened_at: string;
  proposal_id: string;
  symbol: string;
  bias: Bias;
  qty: number;
  entry_debit: number;
  dte: number;
  rules: PositionRules;
  state: 'open' | 'closed';
};

export type PnL = {
  id?: number;
  position_id: string;
  asof: string;
  mid_price: number;
  unrealized: number;
  notes?: string;
};

export type Guardrail = {
  k: string;
  v: string;
};

