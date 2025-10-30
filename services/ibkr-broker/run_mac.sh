#!/usr/bin/env bash
set -euo pipefail

# IBKR Broker Service runner for Mac mini
# This script is called by launchd

export IB_HOST=${IB_HOST:-127.0.0.1}
export IB_PORT=${IB_PORT:-7497}   # 7497 paper, 7496 live
export IB_CLIENT_ID=${IB_CLIENT_ID:-20}  # Use 20 (avoid conflicts)
export IB_MKT_DATA_TYPE=${IB_MKT_DATA_TYPE:-3}  # 1=real-time, 3=delayed

INSTALL_DIR="${HOME}/ibkr-broker"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting IBKR Broker Service..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Date/Time:        $(date)"
echo "  IB_HOST:          $IB_HOST"
echo "  IB_PORT:          $IB_PORT"
echo "  IB_CLIENT_ID:     $IB_CLIENT_ID"
echo "  IB_MKT_DATA_TYPE: $IB_MKT_DATA_TYPE (1=real-time, 3=delayed)"
echo "  Install Dir:      $INSTALL_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change to install directory
cd "$INSTALL_DIR"

# Activate virtual environment
if [ ! -d ".venv" ]; then
    echo "ERROR: Virtual environment not found at $INSTALL_DIR/.venv"
    echo "Run setup_mac_mini.sh first"
    exit 1
fi

source .venv/bin/activate

# Start FastAPI with uvicorn
exec uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8081 \
    --loop asyncio

