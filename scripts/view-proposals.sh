#!/bin/bash
# SAS Proposal Viewer - Display recent proposals in readable format

DB_NAME="sas-proposals"
LIMIT="${1:-10}"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Recent SAS Proposals (Top $LIMIT)                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT 
    id,
    strategy,
    symbol,
    entry_type,
    score,
    ROUND(rr, 2) as rr,
    pop,
    qty,
    status,
    datetime(created_at/1000, 'unixepoch') as created
FROM proposals
ORDER BY created_at DESC
LIMIT $LIMIT;
" 2>/dev/null | tail -n +5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show leg details for latest proposal
echo "📝 Latest Proposal Details:"
LATEST_ID=$(wrangler d1 execute $DB_NAME --remote --env production --command "
SELECT id FROM proposals ORDER BY created_at DESC LIMIT 1;
" 2>/dev/null | tail -1 | xargs)

if [ ! -z "$LATEST_ID" ]; then
    echo ""
    wrangler d1 execute $DB_NAME --remote --env production --command "
    SELECT 
        id,
        symbol,
        strategy,
        entry_type,
        score,
        qty,
        entry_price,
        target_price,
        stop_price,
        rationale,
        legs_json
    FROM proposals
    WHERE id = $LATEST_ID;
    " 2>/dev/null | tail -n +5
else
    echo "  No proposals found."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🕐 $(date '+%Y-%m-%d %H:%M:%S ET')"
echo ""
echo "Usage: $0 [limit]"
echo "Example: $0 20  # Show top 20 proposals"

