-- Migration: Add volatility_metrics table for IV/RV analytics
-- Created: 2024-10-30

CREATE TABLE IF NOT EXISTS volatility_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  asof_date TEXT NOT NULL,
  expiry TEXT NOT NULL,
  rv20 REAL NOT NULL,
  atm_iv REAL,
  otm_call_iv REAL,
  otm_put_iv REAL,
  atm_ivrv_ratio REAL,
  otm_call_ivrv_ratio REAL,
  otm_put_ivrv_ratio REAL,
  iv_premium_atm_pct REAL,
  iv_premium_otm_call_pct REAL,
  iv_premium_otm_put_pct REAL,
  call_skew_ivrv_spread REAL,
  put_skew_ivrv_spread REAL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  UNIQUE(symbol, asof_date, expiry)
);

CREATE INDEX IF NOT EXISTS idx_vol_metrics_symbol_date 
  ON volatility_metrics(symbol, asof_date DESC);

