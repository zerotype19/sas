#!/usr/bin/env bash
set -euo pipefail

# Test script for Mac mini IBKR broker service

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

INSTALL_DIR="${HOME}/ibkr-broker"
LOCAL_URL="http://127.0.0.1:8081"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Testing IBKR Broker Service on Mac mini${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if service is running
echo "1️⃣  Checking service status..."
if launchctl list | grep -q com.ibkr.broker; then
    echo -e "   ${GREEN}✓${NC} Service is loaded in launchd"
else
    echo -e "   ${RED}✗${NC} Service is not loaded in launchd"
    echo "   Start with: launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist"
    exit 1
fi

# Check if port is listening
echo ""
echo "2️⃣  Checking if service is listening on port 8081..."
if lsof -i :8081 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Service is listening on port 8081"
else
    echo -e "   ${RED}✗${NC} Service is not listening on port 8081"
    echo "   Check logs: tail -f $INSTALL_DIR/broker.err.log"
    exit 1
fi

# Check if IB Gateway is connected
echo ""
echo "3️⃣  Checking IB Gateway connection..."
if lsof -i :7497 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} IB Gateway is listening on port 7497"
else
    echo -e "   ${YELLOW}⚠️${NC}  IB Gateway is not listening on port 7497"
    echo "   Make sure IB Gateway is running and API is enabled"
fi

# Test health endpoint
echo ""
echo "4️⃣  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -sf "$LOCAL_URL/" 2>&1)
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} Health endpoint responding"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "   ${RED}✗${NC} Health endpoint failed"
    echo "   Response: $HEALTH_RESPONSE"
fi

# Test account endpoint
echo ""
echo "5️⃣  Testing account endpoint..."
ACCOUNT_RESPONSE=$(curl -sf "$LOCAL_URL/account" 2>&1)
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} Account endpoint responding"
    echo "$ACCOUNT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "   $ACCOUNT_RESPONSE"
else
    echo -e "   ${RED}✗${NC} Account endpoint failed"
    echo "   Response: $ACCOUNT_RESPONSE"
fi

# Test quote endpoint
echo ""
echo "6️⃣  Testing quote endpoint (AAPL)..."
QUOTE_RESPONSE=$(curl -sf -X POST "$LOCAL_URL/quote" \
    -H "Content-Type: application/json" \
    -d '{"symbol":"AAPL"}' 2>&1)
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} Quote endpoint responding"
    echo "$QUOTE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "   $QUOTE_RESPONSE"
else
    echo -e "   ${YELLOW}⚠️${NC}  Quote endpoint failed (may be outside market hours)"
    echo "   Response: $QUOTE_RESPONSE"
fi

# Test positions endpoint
echo ""
echo "7️⃣  Testing positions endpoint..."
POSITIONS_RESPONSE=$(curl -sf "$LOCAL_URL/positions" 2>&1)
if [ $? -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} Positions endpoint responding"
    echo "$POSITIONS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "   $POSITIONS_RESPONSE"
else
    echo -e "   ${RED}✗${NC} Positions endpoint failed"
    echo "   Response: $POSITIONS_RESPONSE"
fi

# Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Test Summary${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Service Logs:"
echo "   • Output: tail -f $INSTALL_DIR/broker.out.log"
echo "   • Errors: tail -f $INSTALL_DIR/broker.err.log"
echo ""
echo "Service Control:"
echo "   • Status:  launchctl list | grep ibkr"
echo "   • Stop:    launchctl stop com.ibkr.broker"
echo "   • Start:   launchctl start com.ibkr.broker"
echo "   • Restart: launchctl stop com.ibkr.broker && launchctl start com.ibkr.broker"
echo ""
echo "Next: Set up Cloudflare Tunnel with deploy_tunnel.sh"
echo ""

