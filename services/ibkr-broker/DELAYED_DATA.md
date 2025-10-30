# Delayed Market Data Setup

## Current Configuration: DELAYED (Until Subscription Active)

The system is configured to use **delayed market data** (15-minute delay) until you activate your real-time subscription.

---

## IB Gateway Configuration

### 1. Enable Delayed Data in IB Gateway

When you login to IB Gateway (Paper):
- You may see a prompt asking about market data
- **Select: "Use Delayed Market Data"**

If you don't see the prompt:
1. Open IB Gateway
2. Edit → Global Configuration → Market Data
3. Enable **"Use Delayed Market Data"**
4. Click OK
5. **Restart IB Gateway**

---

## Microservice Configuration

### Current Settings (Delayed)

The service defaults to **delayed data**:

```bash
# Default in run.sh
IB_MKT_DATA_TYPE=3  # 3 = delayed (15-min delay)
```

### Verify Delayed Mode

When you run `bash run.sh`, you should see:

```
Starting IBKR Broker Service...
  IB_HOST: 127.0.0.1
  IB_PORT: 7497
  IB_CLIENT_ID: 19
  IB_MKT_DATA_TYPE: 3 (1=real-time, 3=delayed)

✓ Connected to IB Gateway successfully
✓ Market data type: Delayed (3)
```

---

## Testing Delayed Data

```bash
export W=https://sas-worker.kevin-mcgovern.workers.dev

# These should work regardless of data type
curl -s $W/broker/account | jq .
curl -s $W/broker/positions | jq .

# Quote will return delayed data (15-min old)
curl -s -X POST $W/broker/quote \
  -H 'content-type: application/json' \
  -d '{"symbol":"AAPL"}' | jq .
```

**Expected Quote Response:**
```json
{
  "symbol": "AAPL",
  "bid": 150.25,
  "ask": 150.30,
  "last": 150.27,
  "timestamp": 1730233200000
}
```

Note: Values will be 15 minutes delayed but still valid for testing.

---

## Switch to Real-Time (After Subscription)

### When to Switch

After you subscribe to **US Securities & Options Value Bundle** on the 1st:

1. Subscription will activate automatically
2. Login to IB Gateway (should not prompt for delayed anymore)
3. Switch microservice to real-time mode

### How to Switch

#### Option 1: Edit run.sh (Permanent)

```bash
# Edit services/ibkr-broker/run.sh
# Change line:
export IB_MKT_DATA_TYPE=${IB_MKT_DATA_TYPE:-3}
# To:
export IB_MKT_DATA_TYPE=${IB_MKT_DATA_TYPE:-1}
```

#### Option 2: Environment Variable (Temporary)

```bash
# Set for current session
export IB_MKT_DATA_TYPE=1
bash run.sh
```

### Verify Real-Time Mode

You should see:

```
✓ Connected to IB Gateway successfully
✓ Market data type: Real-time (1)
```

Quotes will now update in real-time (no 15-min delay).

---

## Troubleshooting

### "No market data permissions"

**Cause:** IB Gateway not configured for delayed data

**Fix:**
1. Ensure "Use Delayed Market Data" is enabled in IB Gateway
2. Restart IB Gateway
3. Restart microservice: `bash run.sh`

### "Market data type: Unknown"

**Cause:** Invalid `IB_MKT_DATA_TYPE` value

**Fix:**
- Must be `1` (real-time) or `3` (delayed)
- Check `echo $IB_MKT_DATA_TYPE`

### Quotes not updating

**Delayed mode:** Expected! Quotes are 15-min old  
**Real-time mode:** Check subscription is active in Client Portal

---

## Market Data Type Reference

| Value | Type | Description | When to Use |
|-------|------|-------------|-------------|
| **1** | Real-time | Live streaming data | After subscription active |
| **3** | Delayed | 15-minute delayed | Before subscription / Paper testing |
| **4** | Delayed-Frozen | Last quote before market close | Special cases |

---

## Production VM Setup

When deploying to VM, set in systemd service:

```ini
[Service]
Environment="IB_MKT_DATA_TYPE=3"
```

Or for real-time after subscription:

```ini
[Service]
Environment="IB_MKT_DATA_TYPE=1"
```

Then reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ibkr-broker
```

---

## Current Status

✅ System configured for **DELAYED** data (IB_MKT_DATA_TYPE=3)  
📅 Switch to **REAL-TIME** after subscription activates (December 1st)  
🔄 Simply restart service with `IB_MKT_DATA_TYPE=1`

---

## Quick Reference

```bash
# Current (delayed)
bash run.sh

# After subscription (real-time)
IB_MKT_DATA_TYPE=1 bash run.sh
```

That's it! No code changes needed to switch.

