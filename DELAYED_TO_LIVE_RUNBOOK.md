# SAS: Mock → Delayed → Live Data Runbook

**Status**: IV/RV analytics 100% deployed, IVR working with 60-day backfill  
**Current Mode**: MOCK (synthetic data)  
**Next Step**: Switch to delayed/live when ready

---

## ✅ What's Working NOW (MOCK Mode)

| Component | Status | Data Source |
|-----------|--------|-------------|
| Stock quotes | ✅ Working | Mock (random walk) |
| Option quotes + greeks | ✅ Working | Mock (calculated) |
| Daily price history | ✅ Working | Mock (60 days) |
| **RV20 calculation** | ✅ **Real** | Computed from mock prices |
| **IV/RV ratios** | ✅ **Real** | Computed from mock chain |
| **Skew spreads** | ✅ **Real** | OTM vs ATM IV/RV |
| **IVR (60-day)** | ✅ **Real** | 600 rows backfilled |
| **Strategy scoring** | ✅ **Real** | IV/RV edge integrated |
| **Proposals** | ✅ Working | Full pipeline tested |
| **IV/RV metrics table** | ✅ Populated | 10+ symbols with metrics |

### Verification Queries

```bash
# Check IV/RV metrics are populating
wrangler d1 execute sas-proposals --remote --command "
SELECT symbol, ROUND(rv20,1) rv20, ROUND(atm_ivrv_ratio,3) atm_ratio,
       ROUND(call_skew_ivrv_spread,4) c_skew, ROUND(put_skew_ivrv_spread,4) p_skew
FROM volatility_metrics ORDER BY created_at DESC LIMIT 10;"

# Check IVR is working (iv_history has data)
wrangler d1 execute sas-proposals --remote --command "
SELECT symbol, COUNT(*) n, ROUND(AVG(iv),1) avg_iv,
       date(MIN(timestamp)/1000, 'unixepoch') start_date,
       date(MAX(timestamp)/1000, 'unixepoch') end_date
FROM iv_history GROUP BY symbol ORDER BY symbol;"
```

**Expected**: 10 symbols × 60 days = 600 rows, IVR showing in proposals (40-70% range)

---

## 🔄 SWITCH TO DELAYED DATA (Do This Now)

Delayed data = **15-minute delayed quotes** from IBKR (no subscription needed for paper accounts)

### Step 1: Update Mac Mini Broker

SSH into your Mac mini and update the broker environment:

```bash
# Stop the current broker
launchctl stop com.gekkoworks.ibkr-broker

# Edit the service file
nano ~/ibkr-broker/run.sh

# Update these lines:
export IB_MKT_DATA_TYPE=3      # 3 = delayed (was mock)
export MARKET_DATA_MODE=live   # live (was mock)

# Save and restart
launchctl start com.gekkoworks.ibkr-broker

# Verify it restarted
tail -f ~/ibkr-broker/broker.out.log
```

**Expected log**: `Connected to IB Gateway ... Market data type: 3 (delayed)`

### Step 2: Sanity Check Broker Locally

```bash
# Test stock quote (should return real delayed price)
curl -s "http://127.0.0.1:8081/quote" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}' | jq

# Expected: {"symbol":"AAPL","price":230.45,"timestamp":...}

# Test option quotes (should return real greeks, may take 1-2s)
curl -s "http://127.0.0.1:8081/options/quotes" \
  -H "Content-Type: application/json" \
  -d '{
    "contracts": [
      {"symbol":"AAPL","expiry":"2025-12-19","strike":230,"right":"C","exchange":"SMART"}
    ]
  }' | jq '.quotes[0] | {strike, delta, iv, mid}'

# Expected: {"strike":230,"delta":0.52,"iv":28.5,"mid":8.35}
```

### Step 3: Test Through Worker (CF Access)

```bash
# Stock quote via Worker
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/broker/quote" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL"}' | jq

# Option quotes via Worker
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/options?symbol=AAPL" | jq '.count'

# Expected: 300-900 quotes depending on chain size
```

### Step 4: Run Full Strategy Pass (Delayed Data)

```bash
# This will:
# 1. Fetch delayed option quotes from IBKR
# 2. Fetch delayed daily history
# 3. Compute RV20 from real prices
# 4. Compute IV/RV metrics from real chain
# 5. Generate proposals with IV/RV edge scoring

curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true" | jq '{
  count, 
  symbols_analyzed,
  sample: .candidates[0:2] | map({symbol, strategy, score, ivr, debit: .debit, credit: .credit})
}'
```

### Step 5: Verify IV/RV Metrics Updated

```bash
# Check volatility_metrics table has TODAY's data
wrangler d1 execute sas-proposals --remote --command "
SELECT symbol, asof_date, ROUND(rv20,1) rv20, ROUND(atm_ivrv_ratio,3) ratio,
       datetime(created_at/1000, 'unixepoch') created
FROM volatility_metrics 
WHERE DATE(created_at/1000, 'unixepoch') = DATE('now')
ORDER BY created_at DESC;"
```

**Expected**: Fresh rows with today's date

### Step 6: Daily IV Snapshot (Auto at 4:10 PM ET)

The cron will run automatically, but you can test manually:

```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/cron/snapshot" | jq '{
  date, successful, total,
  sample: [.results[] | select(.status == "ok")] | .[0:3]
}'
```

**Expected**: `"successful": 10` (all symbols captured)

---

## 🚀 SWITCH TO REAL-TIME DATA (Nov 1st)

Once your IBKR live data subscription activates:

### On Mac Mini

```bash
# Stop broker
launchctl stop com.gekkoworks.ibkr-broker

# Edit run.sh
nano ~/ibkr-broker/run.sh

# Change this ONE line:
export IB_MKT_DATA_TYPE=1      # 1 = real-time (was 3)

# Restart
launchctl start com.gekkoworks.ibkr-broker
```

### Verify Real-Time

```bash
# Check broker log
tail -f ~/ibkr-broker/broker.out.log | grep "Market data type"

# Expected: "Market data type: 1 (real-time)"

# Test quote (should have timestamp within last few seconds)
curl -s "http://127.0.0.1:8081/quote" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"SPY"}' | jq '.timestamp'
```

---

## 🎯 Green Light Checklist

After switching to **delayed** or **live** data, verify these:

### 1. Quotes and Greeks Non-Null

```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/options?symbol=AAPL" | \
  jq '.sample[0:3] | map({strike, delta, iv, mid})'
```

✅ **Pass**: All fields have numeric values  
❌ **Fail**: `delta: null` or `iv: null` → see Troubleshooting below

### 2. Option Chain Size Realistic

```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/options?symbol=SPY" | jq '.count'
```

✅ **Pass**: 300-900 rows (depends on symbol)  
❌ **Fail**: < 50 rows → check expiries/strikes range

### 3. Volatility Metrics Fresh

```bash
wrangler d1 execute sas-proposals --remote --command "
SELECT COUNT(*) n, MAX(datetime(created_at/1000, 'unixepoch')) latest
FROM volatility_metrics
WHERE DATE(created_at/1000, 'unixepoch') = DATE('now');"
```

✅ **Pass**: `n >= 10` and `latest` is within last hour  
❌ **Fail**: `n = 0` → re-run `/strategy/run?force=true`

### 4. Proposals Generate with IV/RV Influence

```bash
# Run with flag OFF
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run" | \
  jq '.candidates[0:3] | map(.score)' > /tmp/scores_off.json

# (Requires wrangler secret to toggle ENABLE_IVRV_EDGE, or just compare MOCK vs LIVE)
```

✅ **Pass**: Scores differ when IV/RV changes  
❌ **Fail**: Identical scores → check `ENABLE_IVRV_EDGE=true` is set

### 5. Daily IV Snapshot Works

```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/cron/snapshot" | \
  jq '.successful'
```

✅ **Pass**: `10` (all symbols)  
❌ **Fail**: `0` → check broker `/options/quotes` endpoint

---

## 🔧 Troubleshooting

### Greeks Return `null` (Delayed Mode)

**Symptom**: `delta: null`, `iv: null` in option quotes

**Fixes**:
1. **Confirm streaming mode** in broker code (not snapshot):
   ```python
   ib.reqMktData(contract, genericTickList="106", snapshot=False, regulatorySnapshot=False)
   ```

2. **Wait 1-2 seconds** before canceling:
   ```python
   ib.sleep(1.5)
   ib.cancelMktData(contract)
   ```

3. **Set market data type AFTER connect**:
   ```python
   ib.connect('127.0.0.1', 7497, clientId=27)
   ib.reqMarketDataType(3)  # Must be after connect!
   ```

4. **Check IB Gateway settings**:
   - API → Settings → "Enable ActiveX and Socket Clients" ✅
   - Use delayed market data ✅ (until Nov 1st)

### IVR Still `null` After Backfill

**Symptom**: Proposals show `ivr: null`

**Check**:
```bash
wrangler d1 execute sas-proposals --remote --command "
SELECT symbol, COUNT(*) FROM iv_history GROUP BY 1;"
```

**Fix**: Need at least 60 rows per symbol. Re-run backfill script:
```bash
npx tsx scripts/backfill_iv_history.ts > /tmp/iv.sql
wrangler d1 execute sas-proposals --remote --file /tmp/iv.sql
```

### Sparse Data Early in Day

**Symptom**: Only a few option quotes return before 10 AM ET

**Why**: Options market makers widen spreads/reduce liquidity early

**Fix**:
- Target front-month + next-month expiries (both monthlies)
- Use ATM ± $10 strike range with $5 increments
- Run strategies after 10:30 AM ET for best data

### Cron Not Firing

**Check**:
```bash
# View recent cron logs
wrangler tail sas-worker-production --env production --format pretty
```

**Fix**: Verify `wrangler.toml` has cron triggers and they're deployed:
```bash
cd apps/worker && pnpm run deploy --env production
```

---

## 📊 Expected Behavior Changes

| Metric | MOCK | Delayed (15-min) | Real-Time |
|--------|------|------------------|-----------|
| **Stock Price** | Random walk ~$100 | Real price, 15-min old | Live tick data |
| **IV** | 30-40% static | Real IV from chain | Real IV, updated live |
| **RV20** | ~12-18% (synthetic) | Real from 20-day prices | Real from 20-day prices |
| **IV/RV Ratio** | 0.02-0.03 (low) | 0.8-1.5 typical | 0.8-1.5 typical |
| **Skew Spreads** | -0.005 to +0.005 | -0.15 to +0.25 typical | -0.15 to +0.25 typical |
| **Delta** | Calculated (B-S) | IBKR model greeks | IBKR model greeks |
| **Option Mid** | Calculated | Real bid/ask mid | Real bid/ask mid |

### Scoring Impact

With **real delayed data**, expect:
- **Credit spreads**: Scores may **decrease** (real IV/RV < mock's inflated edge)
- **Debit calls/puts**: Scores may **increase** (real skew more favorable for buyers)
- **Iron Condors**: Avg skew will be more realistic (higher = better for neutral)

---

## 🛠️ Daily IV Snapshot (Auto-Configured)

**Schedule**: 4:10 PM ET daily (after market close)  
**Cron**: `10 20 * * 1-5` (8:10 PM UTC)  
**Route**: `/cron/snapshot`

**What it does**:
1. Fetches front-month option chain for all 10 symbols
2. Finds ATM calls/puts (~50 delta)
3. Averages their IV → `atm_iv`
4. Inserts into `iv_history` table
5. Keeps IVR fresh for next day's strategies

**Manual test**:
```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/cron/snapshot" | jq
```

---

## 📝 Day-1 Success Criteria (Delayed Data)

After switching to delayed:

| Check | Target | Command |
|-------|--------|---------|
| Option quotes per symbol | 300-900 | `curl .../ingest/options?symbol=AAPL \| jq .count` |
| Greeks non-null | 100% | `jq '.sample[0].delta'` |
| IV/RV metrics today | 10+ rows | `SELECT COUNT(*) FROM volatility_metrics WHERE DATE(...)=DATE('now')` |
| Proposals generate | 10-20 | `/strategy/run \| jq .count` |
| IVR populated | 40-70% | `.candidates[0].ivr` |
| IV snapshot works | 10/10 | `/cron/snapshot \| jq .successful` |

✅ **5/6 = Success** (6/6 = perfect)

---

## 🚨 Rollback to MOCK (Emergency)

If delayed data is broken:

```bash
# On Mac mini
launchctl stop com.gekkoworks.ibkr-broker
nano ~/ibkr-broker/run.sh

# Revert these:
export IB_MKT_DATA_TYPE=3
export MARKET_DATA_MODE=mock

launchctl start com.gekkoworks.ibkr-broker
```

Everything will continue working with synthetic data.

---

## 📅 Timeline

| Date | Mode | Action |
|------|------|--------|
| **Oct 30 (TODAY)** | MOCK | ✅ IV/RV deployed, IVR backfilled |
| **Oct 30 (when ready)** | **DELAYED** | 👉 **Switch using steps above** |
| **Nov 1 (subscription active)** | **REAL-TIME** | Change `IB_MKT_DATA_TYPE=1` |

---

## 🎯 Key Takeaway

The **analytics are production-ready NOW**. Switching to delayed/live only changes the **input data**, not the computation logic. RV20, IV/RV ratios, skew spreads, and IVR calculations are all real and tested!

You're **cleared for delayed data** whenever you're ready. 🚀

