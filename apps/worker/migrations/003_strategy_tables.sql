-- Phase 2B: Real Strategy Engine Tables
-- Per-symbol IV history (to compute IV Rank)
CREATE TABLE IF NOT EXISTS iv_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  iv REAL NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_iv_hist_sym_time ON iv_history(symbol, timestamp DESC);

-- Cache of option quotes with greeks for a run (ephemeral; keep 7d)
CREATE TABLE IF NOT EXISTS option_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  expiry TEXT NOT NULL,            -- YYYY-MM-DD
  strike REAL NOT NULL,
  right TEXT NOT NULL,             -- 'C' or 'P'
  bid REAL, 
  ask REAL, 
  mid REAL,
  iv REAL, 
  delta REAL, 
  gamma REAL, 
  vega REAL, 
  theta REAL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_optq_sym_exp ON option_quotes(symbol, expiry);
CREATE INDEX IF NOT EXISTS idx_optq_lookup ON option_quotes(symbol, expiry, strike, right);

-- Executed trades tracking (Phase 3)
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER,
  symbol TEXT,
  legs_json TEXT,                  -- executed legs snapshot
  qty INTEGER,
  debit_credit REAL,               -- signed (credit positive)
  status TEXT,                     -- pending|filled|closed
  created_at INTEGER,
  FOREIGN KEY(proposal_id) REFERENCES proposals(id)
);

-- Add columns to proposals for multi-leg strategies
-- (These will error if columns exist - that's OK, SQLite will skip them)
ALTER TABLE proposals ADD COLUMN entry_type TEXT;         -- 'CREDIT_SPREAD' | 'DEBIT_CALL'
ALTER TABLE proposals ADD COLUMN legs_json TEXT;          -- JSON array of legs
ALTER TABLE proposals ADD COLUMN qty INTEGER;             -- suggested quantity
ALTER TABLE proposals ADD COLUMN pop REAL;                -- probability of profit est
ALTER TABLE proposals ADD COLUMN rr REAL;                 -- risk/reward
ALTER TABLE proposals ADD COLUMN dedupe_key TEXT;         -- for deduplication
CREATE INDEX IF NOT EXISTS idx_proposals_dedupe ON proposals(dedupe_key);

