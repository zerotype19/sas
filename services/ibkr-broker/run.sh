#!/usr/bin/env bash
set -euo pipefail

export IB_HOST=${IB_HOST:-127.0.0.1}
export IB_PORT=${IB_PORT:-7497}   # 7497 paper, 7496 live
export IB_CLIENT_ID=${IB_CLIENT_ID:-20}  # Use 20 (19 may be stuck)
export IB_MKT_DATA_TYPE=${IB_MKT_DATA_TYPE:-3}  # 1=real-time, 3=delayed (default until subscription)

echo "Starting IBKR Broker Service..."
echo "  IB_HOST: $IB_HOST"
echo "  IB_PORT: $IB_PORT"
echo "  IB_CLIENT_ID: $IB_CLIENT_ID"
echo "  IB_MKT_DATA_TYPE: $IB_MKT_DATA_TYPE (1=real-time, 3=delayed)"

exec uvicorn app.main:app --host 0.0.0.0 --port 8081 --reload --loop asyncio

