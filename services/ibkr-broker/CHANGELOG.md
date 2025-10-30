# IBKR Broker Service - Changelog

## 2025-10-29 - Delayed Market Data Support

### Added
- ✅ `IB_MKT_DATA_TYPE` environment variable
  - `3` = Delayed (default, 15-min delay)
  - `1` = Real-time (after subscription)
- ✅ Automatic market data type request on connection
- ✅ Logging of active market data mode

### Changed
- `app/main.py`: Added `ib.reqMarketDataType()` call in startup
- `run.sh`: Added `IB_MKT_DATA_TYPE` export (defaults to `3`)
- Documentation updated to reflect delayed data as default

### Migration Path

**Before December 1st (No subscription):**
```bash
# Use delayed data (15-min delay)
bash run.sh  # Uses IB_MKT_DATA_TYPE=3 by default
```

**After December 1st (Subscription active):**
```bash
# Switch to real-time
IB_MKT_DATA_TYPE=1 bash run.sh
```

No code changes required to switch modes.

---

## Why This Change?

Interactive Brokers requires a market data subscription for real-time quotes. Until the subscription is active (December 1st), the system will use **delayed market data** (15-minute delay), which is:

- ✅ Free with any IBKR account
- ✅ Legal for testing and development
- ✅ Sufficient for most trading strategies
- ✅ Easy to switch to real-time later

---

## What Works with Delayed Data?

### ✅ Fully Functional
- Account information
- Positions
- Order placement
- Option chain data
- Account balance & buying power

### ⏰ 15-Min Delayed
- Stock quotes (bid/ask/last)
- Option quotes
- Market data snapshots

### 🚀 Real-Time (After Subscription)
All of the above with live streaming data

---

## Testing Delayed Data

```bash
# Start service with delayed data
cd services/ibkr-broker
bash run.sh

# Should see in logs:
# ✓ Market data type: Delayed (3)

# Test quote
curl -X POST http://localhost:8081/quote \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL"}' | jq .

# Returns delayed data (15-min old but valid)
```

---

## Switching to Real-Time

### Method 1: Environment Variable (Temporary)
```bash
export IB_MKT_DATA_TYPE=1
bash run.sh
```

### Method 2: Edit run.sh (Permanent)
```bash
# In run.sh, change:
export IB_MKT_DATA_TYPE=${IB_MKT_DATA_TYPE:-3}
# To:
export IB_MKT_DATA_TYPE=${IB_MKT_DATA_TYPE:-1}
```

### Method 3: Production (Systemd)
```bash
# Edit /etc/systemd/system/ibkr-broker.service
# Add under [Service]:
Environment="IB_MKT_DATA_TYPE=1"

# Then:
sudo systemctl daemon-reload
sudo systemctl restart ibkr-broker
```

---

## Verification

### Check Current Mode

Look for this line in startup logs:
```
✓ Market data type: Delayed (3)
```

or

```
✓ Market data type: Real-time (1)
```

### Test Quotes

Delayed mode: Quotes will be ~15 minutes old  
Real-time mode: Quotes update live

Both modes return the same data structure.

---

## See Also

- `DELAYED_DATA.md` - Complete delayed data guide
- `README.md` - General setup instructions
- `GO_LIVE.md` - Production deployment checklist

