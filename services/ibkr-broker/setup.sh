#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "🚀 Setting up IBKR Broker Service..."

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.9+"
    exit 1
fi

# Create virtual environment
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "✓ Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install fastapi "uvicorn[standard]" pydantic ib-insync==0.9.86

echo ""
echo "🧪 Running smoke test..."

# Smoke test IB Gateway connection
python - <<'PY' || echo "⚠️  Smoke test failed - ensure IB Gateway is running on port 7497"
from ib_insync import IB, Stock
import os
import sys

try:
    host = os.getenv("IB_HOST", "127.0.0.1")
    port = int(os.getenv("IB_PORT", "7497"))
    
    print(f"  Connecting to {host}:{port}...")
    ib = IB()
    ib.connect(host, port, clientId=19)
    
    print("  Testing AAPL quote...")
    ticker = ib.reqMktData(Stock('AAPL', 'SMART', 'USD'))
    ib.sleep(0.5)
    
    print(f"  ✓ AAPL: bid={ticker.bid}, ask={ticker.ask}, last={ticker.last}")
    ib.disconnect()
    print("  ✓ Smoke test passed!")
except Exception as e:
    print(f"  ✗ Error: {e}", file=sys.stderr)
    sys.exit(1)
PY

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start service: bash run.sh"
echo "  2. Test endpoints: bash test.sh"
echo ""

