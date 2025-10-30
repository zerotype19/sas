#!/usr/bin/env bash
set -euo pipefail

# Worker URL
WORKER_URL="${WORKER_URL:-https://sas-worker.kevin-mcgovern.workers.dev}"

echo "🧪 Testing IBKR endpoints via Worker"
echo "Worker URL: $WORKER_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=${4:-}
    
    echo -n "Testing $name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$WORKER_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    else
        response=$(curl -s "$WORKER_URL$endpoint" 2>&1)
    fi
    
    if echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        echo "$response" | jq . | head -20
    else
        echo -e "${RED}✗${NC}"
        echo "$response"
    fi
    echo ""
}

# Test health
echo "=== Health Check ==="
test_endpoint "Broker health" "GET" "/broker"

# Test account
echo "=== Account Summary ==="
test_endpoint "Account" "GET" "/broker/account"

# Test positions
echo "=== Positions ==="
test_endpoint "Positions" "GET" "/broker/positions"

# Test quote
echo "=== Quote (AAPL) ==="
test_endpoint "Quote" "POST" "/broker/quote" '{"symbol":"AAPL"}'

# Test option chain (filtered)
echo "=== Option Chain (AAPL, filtered) ==="
test_endpoint "Option Chain" "POST" "/broker/optionChain" \
    '{"symbol":"AAPL","expiry":"2025-12-19","right":"C"}'

# Test order (optional - commented out for safety)
echo "=== Place Order (COMMENTED OUT) ==="
echo -e "${YELLOW}⚠️  Uncomment to test paper trading${NC}"
echo "# curl -X POST $WORKER_URL/broker/placeOrder \\"
echo "#   -H 'Content-Type: application/json' \\"
echo "#   -d '{\"symbol\":\"AAPL\",\"assetType\":\"STK\",\"quantity\":1,\"side\":\"BUY\",\"orderType\":\"MKT\"}'"
echo ""

echo "=== Test Complete ==="
echo ""
echo "If all tests passed:"
echo "  ✓ IBKR Gateway is connected"
echo "  ✓ Worker proxy is working"
echo "  ✓ Endpoints are accessible"
echo ""
echo "To place a test order (paper mode):"
echo "  Uncomment the order test above or run:"
echo "  curl -X POST $WORKER_URL/broker/placeOrder \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"symbol\":\"AAPL\",\"assetType\":\"STK\",\"quantity\":1,\"side\":\"BUY\",\"orderType\":\"MKT\"}'"
echo ""

