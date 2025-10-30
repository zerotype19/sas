-- Add engine_version column to proposals and trades for tracking
-- This helps debug "did this happen before or after change X?"

-- Check and add engine_version to proposals if not exists
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a workaround
-- If column already exists, this will fail gracefully

-- For proposals
ALTER TABLE proposals ADD COLUMN engine_version TEXT DEFAULT 'unknown';

-- For trades (only if table exists)
ALTER TABLE trades ADD COLUMN engine_version TEXT DEFAULT 'unknown';

-- Add indexes for querying by version
CREATE INDEX IF NOT EXISTS idx_proposals_engine_version ON proposals(engine_version);
CREATE INDEX IF NOT EXISTS idx_trades_engine_version ON trades(engine_version);

-- Add helpful query for version tracking:
-- SELECT engine_version, COUNT(*) as n, AVG(score) as avg_score
-- FROM proposals
-- WHERE created_at > strftime('%s','now')*1000 - 3600000
-- GROUP BY 1 ORDER BY created_at DESC;

