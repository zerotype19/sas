#!/bin/bash
# SAS Data Health Check - Verify D1 tables have recent data

DB_NAME="sas-proposals"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           SAS Data Health Check                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Option quotes (last 10 minutes)
echo "📊 Option Quotes (last 10 min):"
wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT COUNT(*) AS count
FROM option_quotes
WHERE timestamp > strftime('%s','now')*1000 - 600000;
" 2>/dev/null | grep -A 1 "count" | tail -1 | xargs echo "  "

# IV History (last 24 hours)
echo ""
echo "📈 IV History (last 24h):"
wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT COUNT(*) AS count
FROM iv_history
WHERE timestamp > strftime('%s','now')*1000 - 86400000;
" 2>/dev/null | grep -A 1 "count" | tail -1 | xargs echo "  "

# Market Data (last hour)
echo ""
echo "💹 Market Data (last hour):"
wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT COUNT(*) AS count
FROM market_data
WHERE timestamp > strftime('%s','now')*1000 - 3600000;
" 2>/dev/null | grep -A 1 "count" | tail -1 | xargs echo "  "

# Proposals (last 24 hours)
echo ""
echo "📋 Proposals (last 24h):"
wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT COUNT(*) AS count
FROM proposals
WHERE created_at > strftime('%s','now')*1000 - 86400000;
" 2>/dev/null | grep -A 1 "count" | tail -1 | xargs echo "  "

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Recent proposals by strategy
echo "📊 Recent Proposals by Strategy:"
wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT strategy, COUNT(*) as count, ROUND(AVG(score), 1) as avg_score
FROM proposals
WHERE created_at > strftime('%s','now')*1000 - 86400000
GROUP BY strategy
ORDER BY count DESC;
" 2>/dev/null | tail -n +5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🕐 $(date '+%Y-%m-%d %H:%M:%S ET')"

