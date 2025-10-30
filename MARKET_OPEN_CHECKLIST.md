# Market Open Checklist - Tomorrow (Oct 30, 2025)

## 🌅 Pre-Market (Before 9:30 AM ET)

### 1. Verify Services Running

```bash
# Check Mac mini services
launchctl list | grep ibkr
lsof -i :8081
lsof -i :7497

# Check tunnel
brew services list | grep cloudflared

# Check local service
curl http://127.0.0.1:8081/
```

**Expected:** All services running and responding.

---

### 2. Manual Pre-Market Test

```bash
# Test ingestion manually
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/market | jq .
```

**Expected:** Prices should be populated (not null) after 9:30 AM ET.

---

## 📊 During Market Hours (9:30 AM - 4:00 PM ET)

### 3. Verify First Automated Ingestion

**Cron runs at:** 9:45, 10:00, 10:15, etc. (every 15 min)

Check Worker logs:
```bash
wrangler tail --env production
```

**Look for:** "Running market data ingestion..." and "Market ingestion complete"

---

### 4. Query Live Data

```bash
# Check latest data in D1
wrangler d1 execute sas-proposals \
  --command "SELECT symbol, last, timestamp, datetime(timestamp/1000, 'unixepoch') as time FROM market_data ORDER BY timestamp DESC LIMIT 10;" \
  --remote --env production
```

**Expected:** Multiple rows with real prices (non-null `last`, `bid`, `ask`).

---

### 5. Test Search Opportunities

```bash
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/search/opportunities | jq .
```

**Expected:** JSON with opportunities ranked by `rangePct` (volatility).

**Example:**
```json
{
  "timestamp": 1761774000000,
  "count": 10,
  "opportunities": [
    {
      "symbol": "TSLA",
      "avg": "245.67",
      "high": "248.90",
      "low": "243.20",
      "rangePct": "2.32",
      "dataPoints": 12,
      "score": 29.20
    }
  ]
}
```

---

## 🔍 Verification Criteria

### ✅ Success Indicators:

1. **Ingestion Working:**
   - All 10 symbols have non-null prices
   - Timestamp updates every 15 minutes
   - `inserted` count = 10, `failed` count = 0

2. **Search Working:**
   - Returns top opportunities
   - `rangePct` > 0 for most symbols
   - Symbols ranked by volatility

3. **System Health:**
   - No errors in Worker logs
   - Mac mini services stable
   - Tunnel connected

---

### ⚠️ Common Issues & Fixes:

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Null prices** | `bid/ask/last` all null | Market closed or delayed data not enabled |
| **Client ID conflict** | "Client id already in use" | Change `IB_CLIENT_ID` to 22 in run.sh |
| **Tunnel down** | 500 errors from Worker | Restart cloudflared: `brew services restart cloudflared` |
| **Mac mini sleep** | No data ingestion | Disable sleep in System Settings |

---

## 📈 Sample Queries for Analysis

### Count rows per symbol:
```bash
wrangler d1 execute sas-proposals \
  --command "SELECT symbol, COUNT(*) as count FROM market_data GROUP BY symbol ORDER BY count DESC;" \
  --remote --env production
```

### Show price ranges:
```bash
wrangler d1 execute sas-proposals \
  --command "SELECT symbol, MIN(last) as low, MAX(last) as high, (MAX(last)-MIN(last))/MIN(last)*100 as range_pct FROM market_data WHERE last IS NOT NULL GROUP BY symbol ORDER BY range_pct DESC;" \
  --remote --env production
```

### Latest data snapshot:
```bash
wrangler d1 execute sas-proposals \
  --command "SELECT symbol, last, datetime(timestamp/1000, 'unixepoch') as time FROM market_data WHERE timestamp IN (SELECT MAX(timestamp) FROM market_data GROUP BY symbol);" \
  --remote --env production
```

---

## 🚨 Emergency Procedures

### If ingestion stops:

1. **Check Mac mini:**
   ```bash
   tail -f ~/ibkr-broker/broker.err.log
   ```

2. **Restart service:**
   ```bash
   pkill -f "uvicorn app.main"
   cd ~/ibkr-broker && source .venv/bin/activate
   IB_CLIENT_ID=22 nohup uvicorn app.main:app --host 127.0.0.1 --port 8081 --loop asyncio > broker.out.log 2> broker.err.log &
   ```

3. **Manual ingestion:**
   ```bash
   curl https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/market
   ```

---

## 📞 Quick Reference

| Service | URL/Command |
|---------|-------------|
| **Ingestion** | https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/market |
| **Search** | https://sas-worker-production.kevin-mcgovern.workers.dev/search/opportunities |
| **Account** | https://sas-worker-production.kevin-mcgovern.workers.dev/broker/account |
| **Web UI** | https://sas-web.pages.dev |
| **Worker Logs** | `wrangler tail --env production` |
| **D1 Query** | `wrangler d1 execute sas-proposals --command "..." --remote --env production` |

---

## ✅ End-of-Day Checklist

After market close (4:00 PM ET):

- [ ] Review total data points collected
- [ ] Check for any errors in logs
- [ ] Verify all 10 symbols have data
- [ ] Note top opportunities from the day
- [ ] Services still running (ready for next day)

---

**First market day goal:** Collect data successfully for 6+ hours without errors.

**Next milestone:** Use this data to build Phase 2 (Option Chain + Proposals).

