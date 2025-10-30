#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Tunnel Deployment Script for Mac mini

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Cloudflare Tunnel Setup for IBKR Broker Service${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${YELLOW}⚠️  cloudflared not found. Installing...${NC}"
    brew install cloudflare/cloudflare/cloudflared
    echo -e "${GREEN}✓${NC} cloudflared installed"
else
    echo -e "${GREEN}✓${NC} cloudflared already installed"
fi

# Check if service is running
if ! curl -sf http://127.0.0.1:8081/ > /dev/null; then
    echo -e "${RED}✗${NC} IBKR broker service is not running on port 8081"
    echo "   Start it with: launchctl start com.ibkr.broker"
    exit 1
fi
echo -e "${GREEN}✓${NC} IBKR broker service is running"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1: Authenticate with Cloudflare"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will open a browser window to authenticate with Cloudflare."
read -p "Press Enter to continue..."

cloudflared tunnel login

echo ""
echo -e "${GREEN}✓${NC} Authenticated with Cloudflare"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2: Create Tunnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if tunnel already exists
TUNNEL_NAME="ibkr-broker"
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo -e "${YELLOW}→${NC} Tunnel '$TUNNEL_NAME' already exists"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    echo "Creating tunnel: $TUNNEL_NAME"
    cloudflared tunnel create $TUNNEL_NAME
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    echo -e "${GREEN}✓${NC} Created tunnel: $TUNNEL_NAME (ID: $TUNNEL_ID)"
fi

CREDENTIALS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3: Configure Tunnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get domain from user
echo "Enter your domain (e.g., example.com):"
read -p "> " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}✗${NC} Domain is required"
    exit 1
fi

HOSTNAME="ibkr-broker.$DOMAIN"

# Create config file
CONFIG_FILE="$HOME/.cloudflared/config.yml"

cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_NAME
credentials-file: $CREDENTIALS_FILE

ingress:
  - hostname: $HOSTNAME
    service: http://127.0.0.1:8081
  - service: http_status:404
EOF

echo -e "${GREEN}✓${NC} Created config file: $CONFIG_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 4: Create DNS Route"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cloudflared tunnel route dns $TUNNEL_NAME $HOSTNAME

echo -e "${GREEN}✓${NC} Created DNS route: $HOSTNAME"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 5: Start Tunnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Stop existing tunnel service if running
if brew services list | grep -q "cloudflared.*started"; then
    echo "Stopping existing tunnel service..."
    brew services stop cloudflared
fi

# Start tunnel service
brew services start cloudflared

sleep 3

# Check if tunnel is running
if brew services list | grep -q "cloudflared.*started"; then
    echo -e "${GREEN}✓${NC} Tunnel service started"
else
    echo -e "${RED}✗${NC} Failed to start tunnel service"
    echo "   Check logs: tail -f /usr/local/var/log/cloudflared.log"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 6: Test Tunnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Waiting for tunnel to establish..."
sleep 5

echo "Testing endpoint: https://$HOSTNAME/"
if curl -sf "https://$HOSTNAME/" > /dev/null; then
    echo -e "${GREEN}✓${NC} Tunnel is working!"
else
    echo -e "${YELLOW}⚠️${NC}  Tunnel may not be ready yet or requires Cloudflare Access"
    echo "   This is normal if you plan to add Cloudflare Access protection"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Cloudflare Tunnel Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📍 Tunnel Details:"
echo "   • Name:     $TUNNEL_NAME"
echo "   • ID:       $TUNNEL_ID"
echo "   • Hostname: https://$HOSTNAME"
echo "   • Service:  http://127.0.0.1:8081"
echo ""
echo "🔧 Manage Tunnel:"
echo "   • Status:   brew services list | grep cloudflared"
echo "   • Stop:     brew services stop cloudflared"
echo "   • Start:    brew services start cloudflared"
echo "   • Restart:  brew services restart cloudflared"
echo "   • Logs:     tail -f /usr/local/var/log/cloudflared.log"
echo ""
echo "📚 Next Steps:"
echo ""
echo "1️⃣  Set up Cloudflare Access (Optional but recommended):"
echo "   • Go to: https://one.dash.cloudflare.com/"
echo "   • Zero Trust → Access → Applications → Add"
echo "   • Create a Service Token and copy the Client ID/Secret"
echo ""
echo "2️⃣  Update your Worker configuration:"
echo "   • Edit apps/worker/wrangler.toml"
echo "   • Set IBKR_BROKER_BASE = \"https://$HOSTNAME\""
echo "   • Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (if using Access)"
echo ""
echo "3️⃣  Deploy Worker:"
echo "   cd /Users/kevinmcgovern/sas"
echo "   wrangler deploy --env production"
echo ""
echo "4️⃣  Test end-to-end:"
echo "   curl https://sas-worker.kevin-mcgovern.workers.dev/broker/account"
echo ""

