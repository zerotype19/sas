# IBKR Quick Start

## 1️⃣ Setup IB Gateway

1. Download IB Gateway from Interactive Brokers
2. Login with **Paper Trading** credentials
3. **When prompted:** Select **"Use Delayed Market Data"** (until subscription active)
4. Configure:
   - Configuration → API → Settings
   - Enable API: ✓
   - Socket Port: **7497** (paper) / 7496 (live)
   - Trusted IPs: Add **127.0.0.1**
   - Read-Only API: **Uncheck**
   - Market Data: Enable **"Use Delayed Market Data"**
   - Click OK and restart

## 2️⃣ Start IBKR Service

```bash
cd services/ibkr-broker
bash setup.sh
bash run.sh
```

Service runs on **http://localhost:8081**

## 3️⃣ Test Everything

```bash
cd services/ibkr-broker
bash test.sh
```

Expected output:
```
✓ Broker health
✓ Account
✓ Positions
✓ Quote (AAPL)
✓ Option Chain
```

## 🔗 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/broker` | GET | Health check |
| `/broker/quote` | POST | Get real-time quote |
| `/broker/optionChain` | POST | Get option chain |
| `/broker/placeOrder` | POST | Place order |
| `/broker/positions` | GET | Get positions |
| `/broker/account` | GET | Get account summary |

## 🧪 Quick Tests

### Get Quote
```bash
curl -X POST https://sas-worker.kevin-mcgovern.workers.dev/broker/quote \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}'
```

### Get Account
```bash
curl https://sas-worker.kevin-mcgovern.workers.dev/broker/account
```

### Get Positions
```bash
curl https://sas-worker.kevin-mcgovern.workers.dev/broker/positions
```

### Option Chain (filtered)
```bash
curl -X POST https://sas-worker.kevin-mcgovern.workers.dev/broker/optionChain \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "expiry": "2025-12-19",
    "right": "C"
  }'
```

### Place Paper Order (CAREFUL!)
```bash
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

## 🐛 Troubleshooting

### "Connection refused"
- ✓ IB Gateway running?
- ✓ Port 7497 open?
- ✓ API enabled in settings?

### "No market data permissions"
**If using delayed data (default):**
- ✓ Enable "Use Delayed Market Data" in IB Gateway
- ✓ Restart IB Gateway
- ✓ Restart microservice

**After December 1st subscription:**
- ✓ Set `IB_MKT_DATA_TYPE=1` for real-time
- ✓ See `services/ibkr-broker/DELAYED_DATA.md`

### "Pacing violation"
- ✓ Reduce request frequency
- ✓ IB has rate limits

### "Read-only mode"
- ✓ Uncheck "Read-Only API" in IB Gateway
- ✓ Restart IB Gateway

### "Service unavailable (503)"
- ✓ IBKR service running? (`bash run.sh`)
- ✓ Check logs in terminal

## 🚀 Production (VM + Tunnel)

For production without laptop:

1. Deploy to Ubuntu VM
2. Setup Cloudflare Tunnel
3. Update `wrangler.toml`:
```toml
IBKR_BROKER_BASE = "https://ibkr-broker.yourdomain.com"
CF_ACCESS_CLIENT_ID = "your_token"
CF_ACCESS_CLIENT_SECRET = "your_secret"
```

## ✅ Success Criteria

- [ ] `bash setup.sh` passes smoke test
- [ ] `bash test.sh` shows all ✓
- [ ] Account shows non-zero equity
- [ ] Positions returns array
- [ ] Quote returns numbers
- [ ] Web UI loads positions

## 📱 From Web UI

```typescript
import { getQuote, getPositions, getAccount } from './adapters/ibkr';

// In any component
const quote = await getQuote('AAPL');
const positions = await getPositions();
const account = await getAccount();
```

## 🎯 Current Status

**Worker:** ✅ Deployed with IBKR routes  
**Service:** ⏳ Run `bash setup.sh`  
**IB Gateway:** ⏳ Install & configure  

**URLs:**
- Worker: https://sas-worker.kevin-mcgovern.workers.dev
- Web UI: https://sas-web.pages.dev
- Local Service: http://localhost:8081

