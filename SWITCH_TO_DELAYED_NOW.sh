#!/bin/bash
# SAS: Switch from MOCK to DELAYED data (2-minute change)
#
# Run this on your Mac mini to enable real delayed market data from IBKR

set -e

echo "🔄 Switching SAS to DELAYED market data mode..."
echo ""

# Step 1: Stop broker
echo "1️⃣ Stopping broker service..."
launchctl stop com.gekkoworks.ibkr-broker
sleep 2

# Step 2: Backup current config
echo "2️⃣ Backing up run.sh..."
cp ~/ibkr-broker/run.sh ~/ibkr-broker/run.sh.backup.$(date +%s)

# Step 3: Update config
echo "3️⃣ Updating configuration..."
sed -i '' 's/export MARKET_DATA_MODE=mock/export MARKET_DATA_MODE=live/' ~/ibkr-broker/run.sh

# Verify IB_MKT_DATA_TYPE is set to 3 (delayed)
if ! grep -q "export IB_MKT_DATA_TYPE=3" ~/ibkr-broker/run.sh; then
  echo "⚠️  Warning: IB_MKT_DATA_TYPE not set to 3 (delayed)"
  echo "   Adding: export IB_MKT_DATA_TYPE=3"
  sed -i '' '/export IB_CLIENT_ID/a\
export IB_MKT_DATA_TYPE=3
' ~/ibkr-broker/run.sh
fi

# Step 4: Restart broker
echo "4️⃣ Restarting broker service..."
launchctl start com.gekkoworks.ibkr-broker
sleep 3

# Step 5: Test locally
echo "5️⃣ Testing broker (local)..."
QUOTE_TEST=$(curl -s "http://127.0.0.1:8081/quote" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}' 2>/dev/null || echo '{"error":"timeout"}')

if echo "$QUOTE_TEST" | grep -q '"symbol"'; then
  echo "   ✅ Broker responding: $QUOTE_TEST"
else
  echo "   ⚠️  Broker not responding yet (may need 10-15s to connect to IB Gateway)"
  echo "   Check logs: tail -f ~/ibkr-broker/broker.out.log"
fi

echo ""
echo "✅ Configuration updated!"
echo ""
echo "📋 Next Steps:"
echo "   1. Verify broker logs: tail -f ~/ibkr-broker/broker.out.log"
echo "   2. Test via Worker: curl https://sas-worker-production.kevin-mcgovern.workers.dev/broker/quote -H 'Content-Type: application/json' -d '{\"symbol\":\"AAPL\"}'"
echo "   3. Run strategy pass: curl https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true"
echo ""
echo "📖 Full guide: see DELAYED_TO_LIVE_RUNBOOK.md"
echo ""
echo "🔙 Rollback: mv ~/ibkr-broker/run.sh.backup.* ~/ibkr-broker/run.sh && launchctl restart com.gekkoworks.ibkr-broker"

