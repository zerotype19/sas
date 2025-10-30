# IBKR Integration Quick Start

## Phase 1: Local Development

### Prerequisites

1. **IB Gateway** installed (or TWS)
2. **Paper trading account** credentials
3. Python 3.9+

### Setup IB Gateway

1. Download IB Gateway from Interactive Brokers
2. Login with **paper trading** credentials
3. Configure settings:
   - **Enable API**: Configuration → API → Settings
   - **Port**: 7497 (paper) or 7496 (live)
   - **Trusted IP**: Add `127.0.0.1`
   - **Read-Only API**: **Uncheck** (to allow orders)
   - **Socket Port**: 7497

### Install IBKR Service

```bash
cd services/ibkr-broker
bash setup.sh
```

### Start IBKR Service

```bash
# Terminal 1: IB Gateway (GUI - keep open)
# Start IB Gateway and login

# Terminal 2: IBKR Broker Service
cd services/ibkr-broker
source .venv/bin/activate
bash run.sh

# Service runs on http://localhost:8081
```

### Test Smoke

```bash
cd services/ibkr-broker
source .venv/bin/activate
python app/smoke.py
```

Expected output:
```
Connecting to IB Gateway at 127.0.0.1:7497...
✓ Connected successfully

Testing AAPL quote...
  Bid: 150.25
  Ask: 150.30
  Last: 150.27

✓ Smoke test passed!
```

### Test via Worker

```bash
# Quote
curl -X POST https://sas-worker.kevin-mcgovern.workers.dev/broker/quote \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}'

# Option chain (filtered)
curl -X POST https://sas-worker.kevin-mcgovern.workers.dev/broker/optionChain \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL","expiry":"2025-12-19","right":"C"}'

# Account summary
curl https://sas-worker.kevin-mcgovern.workers.dev/broker/account

# Positions
curl https://sas-worker.kevin-mcgovern.workers.dev/broker/positions

# Place test order (PAPER ONLY!)
curl -X POST https://sas-worker.kevin-mcgovern.workers.dev/broker/placeOrder \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "assetType": "STK",
    "quantity": 1,
    "side": "BUY",
    "orderType": "MKT"
  }'
```

## Web UI Integration

The web UI can now call broker endpoints via `/api/broker/*`:

```typescript
import { getQuote, getPositions, getAccount } from './adapters/ibkr';

// Get quote
const quote = await getQuote('AAPL');

// Get positions
const positions = await getPositions();

// Get account
const account = await getAccount();
```

## Troubleshooting

### "Connection refused"
- Ensure IB Gateway is running
- Check port 7497 is listening: `lsof -i :7497`
- Verify API is enabled in settings

### "No market data permissions"
- Need market data subscription OR use delayed data
- Check account permissions in IBKR account management

### "Pacing violation"
- Reduce request frequency
- IB has rate limits on market data requests

### "Read-only mode"
- Uncheck "Read-Only API" in IB Gateway settings
- Restart IB Gateway

### "Socket port conflict"
- Another client connected to IB Gateway
- Change CLIENT_ID: `export IB_CLIENT_ID=20`

## Phase 2: Production (VM + Cloudflare Tunnel)

See main deployment guide for setting up:
1. Ubuntu VM with IB Gateway
2. Cloudflare Tunnel for secure access
3. Service tokens for authentication
4. Systemd service for auto-restart

## Current Status

✅ Worker deployed with IBKR proxy routes
✅ Broker microservice code ready
✅ Web UI adapter ready
⏳ Waiting for IB Gateway connection

**Next**: Start IB Gateway and run `bash setup.sh` to test locally.

