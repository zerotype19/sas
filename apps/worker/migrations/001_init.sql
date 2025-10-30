-- SAS Database Schema v1

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  asof TEXT NOT NULL,
  symbol TEXT NOT NULL,
  skew_z REAL NOT NULL,
  iv30 REAL NOT NULL,
  rv20 REAL NOT NULL,
  iv_rv_spread REAL NOT NULL,
  momentum REAL NOT NULL,
  term_slope REAL,
  regime TEXT,
  source JSON
);

CREATE INDEX IF NOT EXISTS idx_signals_asof ON signals(asof);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bias TEXT NOT NULL,
  dte INTEGER NOT NULL,
  long_leg TEXT NOT NULL,
  short_leg TEXT NOT NULL,
  width REAL NOT NULL,
  debit REAL NOT NULL,
  max_profit REAL NOT NULL,
  rr REAL NOT NULL,
  filters JSON NOT NULL,
  status TEXT NOT NULL,
  strategy_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  opened_at TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bias TEXT NOT NULL,
  qty INTEGER NOT NULL,
  entry_debit REAL NOT NULL,
  dte INTEGER NOT NULL,
  rules JSON NOT NULL,
  state TEXT NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

CREATE INDEX IF NOT EXISTS idx_positions_state ON positions(state);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);

CREATE TABLE IF NOT EXISTS pnl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id TEXT NOT NULL,
  asof TEXT NOT NULL,
  mid_price REAL NOT NULL,
  unrealized REAL NOT NULL,
  notes TEXT,
  FOREIGN KEY (position_id) REFERENCES positions(id)
);

CREATE INDEX IF NOT EXISTS idx_pnl_position ON pnl(position_id);
CREATE INDEX IF NOT EXISTS idx_pnl_asof ON pnl(asof);

CREATE TABLE IF NOT EXISTS guardrails (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

INSERT OR IGNORE INTO guardrails(k, v) VALUES
  ("max_positions", "5"),
  ("max_equity_at_risk_pct", "20"),
  ("risk_per_trade_pct", "2.5"),
  ("min_liquidity_rank", "1");

