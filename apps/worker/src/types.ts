/**
 * Core types for SAS trading system
 */

export type StrategyId =
  | 'LONG_CALL'
  | 'BULL_PUT_CREDIT'
  | 'LONG_PUT'
  | 'BEAR_CALL_CREDIT'
  | 'IRON_CONDOR'
  | 'CALENDAR_CALL'
  | 'CALENDAR_PUT'; // scaffold only

export interface StrategyConfig {
  enabled: boolean;
  phase: 1 | 2 | 3;
  minScore: number;     // default 50
  maxRiskPct?: number;  // per-trade cap
}

export interface StrategyRegistry {
  [k in StrategyId]: StrategyConfig;
}

export interface ProposalLeg {
  side: 'BUY' | 'SELL';
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string; // YYYY-MM-DD
  quantity?: number;
  price?: number;
}

export interface Proposal {
  id?: number;
  strategy: StrategyId;
  symbol: string;
  action: 'BUY' | 'SELL';
  entry_type: string;
  score: number;        // 0–100
  pop?: number | null;  // 0–100
  rr?: number | null;   // reward/risk
  debit?: number | null;  // for debit structures
  credit?: number | null; // for credit structures
  entry_price?: number;
  target_price?: number;
  stop_price?: number;
  rationale?: string;
  ivr?: number | null;
  dte?: number;
  qty?: number;
  maxLoss?: number;
  legs: ProposalLeg[];
  legs_json?: string; // For DB storage
  width?: number; // For spreads
  meta?: Record<string, any>;
}

// Option chain types
export interface OptionQuote {
  symbol: string;
  expiry: string;
  strike: number;
  right: 'C' | 'P';
  bid: number | null;
  ask: number | null;
  mid: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  vega: number | null;
  theta: number | null;
  volume?: number | null;
  openInterest?: number | null;
  timestamp: number;
}

export interface OptionChain {
  symbol: string;
  quotes: OptionQuote[];
  expiries: string[];
}

// Trend analysis
export type TrendDirection = 'UP' | 'DOWN' | 'NEUTRAL';

// IV/RV metrics (from analytics module)
export interface IvrvMetrics {
  rv20: number;
  atm_iv?: number;
  atm_ivrv_ratio?: number;
  iv_premium_atm_pct?: number;
  otm_call_iv?: number;
  otm_call_ivrv_ratio?: number;
  iv_premium_otm_call_pct?: number;
  otm_put_iv?: number;
  otm_put_ivrv_ratio?: number;
  iv_premium_otm_put_pct?: number;
  call_skew_ivrv_spread?: number;
  put_skew_ivrv_spread?: number;
}

// Strategy input
export interface StrategyInput {
  symbol: string;
  chain: OptionChain;
  spot: number;
  ivRank: number | null;  // 0-100
  trend: TrendDirection;
  earningsDate?: string;
  todayISO: string;
  equity: number;
  termSkew?: { frontIV: number; backIV: number }; // For calendar spreads
  ivrvMetrics?: IvrvMetrics; // IV/RV analytics
  env?: any; // Worker environment for phase gating
}

// Strategy output
export interface StrategyOutput {
  proposals: Proposal[];
}

