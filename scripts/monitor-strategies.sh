#!/bin/bash
# SAS Strategy Monitor - Real-time strategy analysis

WORKER_URL="https://sas-worker-production.kevin-mcgovern.workers.dev"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           SAS Multi-Strategy Monitor                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Health check
echo "🏥 Health Check..."
HEALTH=$(curl -s "${WORKER_URL}/health")
if echo "$HEALTH" | jq -e '.ok == true' > /dev/null 2>&1; then
    echo "✅ Worker: ONLINE"
else
    echo "❌ Worker: OFFLINE"
    exit 1
fi
echo ""

# Strategy run
echo "🎯 Running Strategy Analysis..."
RESULT=$(curl -s "${WORKER_URL}/strategy/run")

COUNT=$(echo "$RESULT" | jq -r '.count // 0')
SYMBOLS=$(echo "$RESULT" | jq -r '.symbols_analyzed // 0')

echo "Symbols Analyzed: $SYMBOLS"
echo "Candidates Found: $COUNT"
echo ""

if [ "$COUNT" -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Strategy Breakdown:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Phase 1
    echo ""
    echo "Phase 1 (Existing):"
    echo "$RESULT" | jq -r '.candidates[] | select(.strategy == "LONG_CALL" or .strategy == "BULL_PUT_CREDIT") | "  ✓ \(.strategy) • \(.symbol) • Score: \(.score) • Legs: \(.legs|length)"' | sort -rn -k6
    
    # Phase 2
    echo ""
    echo "Phase 2 (Bearish):"
    echo "$RESULT" | jq -r '.candidates[] | select(.strategy == "LONG_PUT" or .strategy == "BEAR_CALL_CREDIT") | "  ✓ \(.strategy) • \(.symbol) • Score: \(.score) • Legs: \(.legs|length)"' | sort -rn -k6
    
    # Phase 3
    echo ""
    echo "Phase 3 (Advanced):"
    echo "$RESULT" | jq -r '.candidates[] | select(.strategy == "IRON_CONDOR" or .strategy == "CALENDAR_CALL") | "  ✓ \(.strategy) • \(.symbol) • Score: \(.score) • Legs: \(.legs|length)"' | sort -rn -k6
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Top 10 by Score:"
    echo "$RESULT" | jq -r '.candidates | sort_by(-.score) | .[:10][] | "  \(.score) • \(.strategy) • \(.symbol) • \(.entry_type) • R/R: \(.rr // "n/a") • POP: \(.pop // "n/a")%"'
else
    echo "ℹ️  No candidates found."
    MSG=$(echo "$RESULT" | jq -r '.message // "Unknown"')
    echo "   Message: $MSG"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🕐 $(date '+%Y-%m-%d %H:%M:%S ET')"

