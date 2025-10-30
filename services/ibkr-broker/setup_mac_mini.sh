#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Setting up IBKR Broker Service on Mac mini..."
echo ""

# Get current user
USER_HOME=$HOME
INSTALL_DIR="$USER_HOME/ibkr-broker"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if IB Gateway is running
echo "1️⃣  Checking IB Gateway..."
if ! lsof -i :7497 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  IB Gateway doesn't appear to be running on port 7497${NC}"
    echo "   Please start IB Gateway (Paper) and configure API settings:"
    echo "   - Enable ActiveX and Socket Clients"
    echo "   - Socket Port: 7497"
    echo "   - Trusted IPs: 127.0.0.1"
    echo ""
    read -p "Press Enter when Gateway is ready..."
fi

# Check Python
echo ""
echo "2️⃣  Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found${NC}"
    echo "   Install with: brew install python3"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo -e "${GREEN}✓${NC} Found $PYTHON_VERSION"

# Create installation directory
echo ""
echo "3️⃣  Creating installation directory..."
mkdir -p "$INSTALL_DIR/app"
echo -e "${GREEN}✓${NC} Created $INSTALL_DIR"

# Copy application files
echo ""
echo "4️⃣  Copying application files..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/app/main.py" "$INSTALL_DIR/app/"
cp "$SCRIPT_DIR/run_mac.sh" "$INSTALL_DIR/run.sh"
chmod +x "$INSTALL_DIR/run.sh"
echo -e "${GREEN}✓${NC} Files copied"

# Create virtual environment
echo ""
echo "5️⃣  Setting up Python virtual environment..."
if [ ! -d "$INSTALL_DIR/.venv" ]; then
    python3 -m venv "$INSTALL_DIR/.venv"
    echo -e "${GREEN}✓${NC} Virtual environment created"
else
    echo -e "${YELLOW}→${NC} Virtual environment already exists"
fi

# Install dependencies
echo ""
echo "6️⃣  Installing dependencies..."
source "$INSTALL_DIR/.venv/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet fastapi "uvicorn[standard]" pydantic ib-insync==0.9.86
echo -e "${GREEN}✓${NC} Dependencies installed"

# Test IB Gateway connection
echo ""
echo "7️⃣  Testing IB Gateway connection..."
python3 - <<'PY' || {
    echo -e "${RED}✗ Connection test failed${NC}"
    echo "  Please check IB Gateway is running and API is enabled"
    exit 1
}
from ib_insync import IB, Stock
import sys

try:
    ib = IB()
    ib.connect('127.0.0.1', 7497, clientId=999)  # Use unique client ID for test
    ib.reqMarketDataType(3)  # Delayed data
    ticker = ib.reqMktData(Stock('AAPL', 'SMART', 'USD'))
    ib.sleep(0.5)
    
    if ticker.bid or ticker.ask or ticker.last:
        print(f"✓ AAPL quote: bid={ticker.bid}, ask={ticker.ask}, last={ticker.last}")
    else:
        print("⚠️  Connected but no market data (expected if outside market hours)")
    
    ib.disconnect()
except Exception as e:
    print(f"✗ Connection error: {e}", file=sys.stderr)
    sys.exit(1)
PY

echo -e "${GREEN}✓${NC} IB Gateway connection successful"

# Create launchd plist
echo ""
echo "8️⃣  Setting up launchd service..."
PLIST_PATH="$USER_HOME/Library/LaunchAgents/com.ibkr.broker.plist"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ibkr.broker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-lc</string>
        <string>$INSTALL_DIR/run.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/broker.out.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/broker.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>IB_HOST</key>
        <string>127.0.0.1</string>
        <key>IB_PORT</key>
        <string>7497</string>
        <key>IB_CLIENT_ID</key>
        <string>20</string>
        <key>IB_MKT_DATA_TYPE</key>
        <string>3</string>
    </dict>
</dict>
</plist>
EOF

echo -e "${GREEN}✓${NC} Created $PLIST_PATH"

# Stop existing service if running
if launchctl list | grep -q com.ibkr.broker; then
    echo ""
    echo "   Stopping existing service..."
    launchctl stop com.ibkr.broker 2>/dev/null || true
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Load and start service
echo ""
echo "9️⃣  Starting service..."
launchctl load "$PLIST_PATH"
launchctl start com.ibkr.broker
sleep 2

# Verify service is running
if launchctl list | grep -q com.ibkr.broker; then
    echo -e "${GREEN}✓${NC} Service started successfully"
else
    echo -e "${RED}✗${NC} Service failed to start"
    echo "   Check logs: tail -f $INSTALL_DIR/broker.err.log"
    exit 1
fi

# Test the service
echo ""
echo "🔟 Testing service endpoint..."
sleep 3  # Give service time to start
if curl -sf http://127.0.0.1:8081/ > /dev/null; then
    echo -e "${GREEN}✓${NC} Service is responding"
else
    echo -e "${YELLOW}⚠️${NC}  Service may still be starting..."
    echo "   Check logs: tail -f $INSTALL_DIR/broker.out.log"
fi

# Print success message
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ IBKR Broker Service Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📍 Service Details:"
echo "   • Location: $INSTALL_DIR"
echo "   • Endpoint: http://127.0.0.1:8081"
echo "   • Status: Running (auto-restart enabled)"
echo ""
echo "📊 Monitor Service:"
echo "   • Status:  launchctl list | grep ibkr"
echo "   • Logs:    tail -f $INSTALL_DIR/broker.out.log"
echo "   • Errors:  tail -f $INSTALL_DIR/broker.err.log"
echo ""
echo "🔧 Manage Service:"
echo "   • Stop:    launchctl stop com.ibkr.broker"
echo "   • Start:   launchctl start com.ibkr.broker"
echo "   • Restart: launchctl stop com.ibkr.broker && launchctl start com.ibkr.broker"
echo "   • Unload:  launchctl unload $PLIST_PATH"
echo ""
echo "🧪 Test Locally:"
echo "   curl http://127.0.0.1:8081/ | jq ."
echo "   curl http://127.0.0.1:8081/account | jq ."
echo ""
echo "📚 Next Steps:"
echo "   1. Set up Cloudflare Tunnel (see MAC_MINI_SETUP.md)"
echo "   2. Configure Cloudflare Access"
echo "   3. Update Worker configuration"
echo "   4. Deploy and test end-to-end"
echo ""

