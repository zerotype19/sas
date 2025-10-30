-- Market Data Table for SAS Search Layer
CREATE TABLE IF NOT EXISTS market_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  bid REAL,
  ask REAL,
  last REAL,
  volume INTEGER,
  iv REAL,
  expiry TEXT,
  strike REAL,
  right TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_symbol_time
ON market_data (symbol, timestamp DESC);

-- Proposals Table
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  rationale TEXT,
  status TEXT DEFAULT 'pending',
  avg_price REAL,
  range_pct REAL,
  opportunity_score REAL
);

CREATE INDEX IF NOT EXISTS idx_proposals_status
ON proposals (status, created_at DESC);

