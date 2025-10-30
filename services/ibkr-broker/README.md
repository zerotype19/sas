# IBKR Broker Microservice

FastAPI service that wraps `ib_insync` to provide a REST API for Interactive Brokers functionality.

## Quick Start

### Prerequisites

1. **IB Gateway** or **TWS** running with:
   - Paper trading account
   - API enabled (port 7497 for paper, 7496 for live)
   - Trusted IP: `127.0.0.1`
   - Read-Only mode: **disabled**

2. **Python 3.9+**

### Setup

```bash
cd services/ibkr-broker

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e .

# Run smoke test
python app/smoke.py

# Start service
bash run.sh
```

Service runs on **http://localhost:8081**

## Configuration

Environment variables:

- `IB_HOST`: IB Gateway host (default: `127.0.0.1`)
- `IB_PORT`: IB Gateway port (default: `7497` for paper)
- `IB_CLIENT_ID`: Client ID (default: `19`)

## API Endpoints

### GET /
Health check - returns connection status

### POST /quote
Get real-time quote for a symbol

**Request:**
```json
{
  "symbol": "AAPL",
  "exchange": "SMART",
  "currency": "USD"
}
```

### POST /optionChain
Get option chain

**Request:**
```json
{
  "symbol": "AAPL",
  "exchange": "SMART",
  "currency": "USD",
  "right": "C",
  "expiry": "2025-11-21"
}
```

### POST /placeOrder
Place an order

**Stock:**
```json
{
  "symbol": "AAPL",
  "assetType": "STK",
  "quantity": 100,
  "side": "BUY",
  "orderType": "MKT"
}
```

**Option:**
```json
{
  "symbol": "AAPL",
  "assetType": "OPT",
  "quantity": 1,
  "side": "BUY",
  "orderType": "LMT",
  "limitPrice": 5.50,
  "option": {
    "expiry": "2025-11-21",
    "strike": 150,
    "right": "C",
    "multiplier": 100
  }
}
```

### GET /positions
Get all positions

### GET /account
Get account summary

## Testing

```bash
# Quote
curl -X POST http://localhost:8081/quote \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}'

# Positions
curl http://localhost:8081/positions

# Account
curl http://localhost:8081/account
```

## Troubleshooting

**"Connection refused"**
- Ensure IB Gateway is running
- Check port 7497 is accessible
- Verify API is enabled in IB Gateway settings

**"No market data permissions"**
- Subscribe to market data in IB account
- Or use delayed data (15-minute delay)

**"Pacing violation"**
- Reduce request frequency
- Add delays between requests

**"Read-only mode"**
- Disable read-only mode in IB Gateway settings
- Restart IB Gateway after changing

## Production Deployment

See main README for Cloudflare Tunnel setup to run this service on a VM without exposing it publicly.

