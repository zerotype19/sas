# ✅ Today's Validation Checklist (Mock Mode)

**Date:** October 30, 2025, 10:45 AM EST  
**Mode:** MOCK  
**Status:** All systems operational

---

## 🎯 Core System Validation (COMPLETE)

### ✅ 1. Strategy Engine
```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true" | jq '.count'
```
**Result:** 20 proposals generated  
**Status:** ✅ PASS

### ✅ 2. Options Data Pipeline
```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/ingest/options?force=true" | jq '.totalQuotes'
```
**Result:** 936 option quotes stored in D1  
**Status:** ✅ PASS

### ✅ 3. Proposals Endpoint
```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/proposals" | jq 'length'
```
**Result:** 1 proposal available (ID: 14)  
**Status:** ✅ PASS

### ✅ 4. D1 Storage
```bash
wrangler d1 execute sas-proposals --env production --remote \
  --command "SELECT COUNT(*) as total FROM option_quotes;"
```
**Result:** 936 rows  
**Status:** ✅ PASS

---

## 🎨 UI Validation (TODO)

### Step 1: View Proposals Page
```bash
open https://sas-web.pages.dev/proposals
```

**Expected:**
- 1 proposal card visible
- Symbol: AAPL
- Strategy: LONG_PUT
- Score: 77
- Status: pending
- "Approve & Route (Paper)" button visible

**Checklist:**
- [ ] Proposal card renders
- [ ] Score badge shows 77 (tradable color)
- [ ] Legs table shows 1 leg (BUY PUT 385)
- [ ] Rationale displays
- [ ] Time shows relative + absolute
- [ ] No console errors

### Step 2: Test Approve Flow
**Action:** Click "Approve & Route (Paper)"

**Expected:**
- [ ] Button shows loading state
- [ ] Order routes to IBKR (paper mode)
- [ ] Status updates to "submitted" or "filled"
- [ ] Success message/toast appears
- [ ] D1 `trades` table gets new row

**Test Command:**
```bash
# Check if trade was recorded
wrangler d1 execute sas-proposals --env production --remote \
  --command "SELECT * FROM trades ORDER BY timestamp DESC LIMIT 1;"
```

---

## 📱 Telegram Alert Validation (TODO)

### Manual Test
```bash
# Trigger alert for high-score proposal
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/test-telegram" | jq
```

**Expected in Telegram:**
- Message received in configured chat
- Contains: Symbol, Strategy, Score, Legs, Entry/Target/Stop
- "Quick Approve" link (placeholder for now)

**Checklist:**
- [ ] Message received
- [ ] Formatting correct
- [ ] All key details present
- [ ] Score ≥ 50 (alert threshold)

---

## 🔬 Optional Integration Tests

### A. Mock vs Live Comparison (Nov 1st)
Create a side-by-side test to validate real data matches expected patterns:

```typescript
// apps/worker/__tests__/integration/mockVsLive.test.ts
describe('Mock vs Live Data Comparison', () => {
  it('should have similar IV distributions', async () => {
    // Fetch mock quotes
    const mockQuotes = await fetchOptionsQuotes('AAPL', 'mock');
    
    // Fetch live quotes (Nov 1st)
    const liveQuotes = await fetchOptionsQuotes('AAPL', 'live');
    
    // Compare distributions
    expect(mockQuotes.length).toBeGreaterThan(0);
    expect(liveQuotes.length).toBeGreaterThan(0);
    
    // IV should be in similar ranges (0.15-0.60)
    const mockIVs = mockQuotes.map(q => q.iv).filter(Boolean);
    const liveIVs = liveQuotes.map(q => q.iv).filter(Boolean);
    
    expect(Math.max(...mockIVs)).toBeLessThan(0.80);
    expect(Math.max(...liveIVs)).toBeLessThan(0.80);
  });
  
  it('should have monotonic delta curves', async () => {
    const quotes = await fetchOptionsQuotes('SPY', 'live');
    const calls = quotes.filter(q => q.right === 'C').sort((a, b) => a.strike - b.strike);
    
    // Delta should decrease as strike increases (for calls)
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].delta).toBeLessThanOrEqual(calls[i-1].delta);
    }
  });
});
```

### B. Paper Order Placement Test
Verify paper orders still work with live data:

```bash
# Test credit spread order
curl -s -X POST "https://sas-worker-production.kevin-mcgovern.workers.dev/execute/14" | jq
```

**Expected:**
```json
{
  "ok": true,
  "trade_id": 1,
  "status": "routed",
  "order_id": 12345,
  "message": "Order routed to IBKR (paper)"
}
```

**Checklist:**
- [ ] Order accepted by IBKR
- [ ] D1 `trades` table updated
- [ ] Proposal status changed to "submitted"
- [ ] No errors in logs

---

## 📊 Data Quality Checks

### Mock Data Characteristics
```bash
# Check IV distribution
wrangler d1 execute sas-proposals --env production --remote \
  --command "SELECT AVG(iv) as avg_iv, MIN(iv) as min_iv, MAX(iv) as max_iv FROM option_quotes WHERE iv IS NOT NULL;"
```

**Expected:**
- Avg IV: 0.25-0.40
- Min IV: ~0.15
- Max IV: ~0.80

### Delta Distribution
```bash
# Check delta ranges
wrangler d1 execute sas-proposals --env production --remote \
  --command "SELECT right, AVG(delta) as avg_delta, MIN(delta) as min_delta, MAX(delta) as max_delta FROM option_quotes GROUP BY right;"
```

**Expected:**
- Calls: avg ~0.50, range 0.05-0.95
- Puts: avg ~-0.50, range -0.95 to -0.05

---

## 🚦 Health Checks

### Broker Service (Mac mini)
```bash
# Check process
ps aux | grep "uvicorn app.main:app" | grep -v grep

# Check logs
tail -20 ~/ibkr-broker/broker.err.log | grep -E "(Mock mode|startup complete)"
```

**Expected:**
- Process running with PID 32938 (or newer)
- Logs show "Mock mode: generating"
- No errors in recent logs

### Worker
```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/health" | jq
```

**Expected:**
```json
{
  "ok": true,
  "time": 1761835335000,
  "service": "sas-worker",
  "version": "1.0.0"
}
```

### Cloudflare Tunnel
```bash
# Via Worker proxy
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/broker" | jq
```

**Expected:**
```json
{
  "service": "IBKR Broker Proxy",
  "brokerBase": "https://ibkr-broker.gekkoworks.com"
}
```

---

## 🎯 Success Criteria

### Today (Mock Mode)
- [x] Strategy engine generates proposals (20)
- [x] Options data ingested to D1 (936 quotes)
- [x] Proposals available via API (1+)
- [ ] UI displays proposals correctly
- [ ] Approve button routes paper order
- [ ] Telegram alerts fire for score ≥ 50

### Nov 1st (Live Mode)
- [ ] Broker switched to `MARKET_DATA_MODE=live`
- [ ] Real greeks flowing from IBKR
- [ ] Strategy engine using live data
- [ ] Proposals reflect real market conditions
- [ ] Paper orders executing with live prices

---

## 🐛 Troubleshooting

### No proposals in UI
```bash
# Check proposals endpoint
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/proposals" | jq

# If empty, create test proposal
curl -s -X POST "https://sas-worker-production.kevin-mcgovern.workers.dev/propose" \
  -H "Content-Type: application/json" \
  -d @test_proposal.json
```

### Broker not responding
```bash
# SSH to Mac mini
ssh kevinmcgovern@192.168.86.169

# Check service
launchctl list | grep ibkr-broker

# Restart if needed
pkill -f "uvicorn app.main:app"
cd ~/ibkr-broker && source .venv/bin/activate
MARKET_DATA_MODE=mock IB_CLIENT_ID=28 \
  nohup uvicorn app.main:app --host 127.0.0.1 --port 8081 > broker.out.log 2> broker.err.log &
```

### Strategy engine errors
```bash
# Check Worker logs in Cloudflare dashboard
# Or trigger with debug
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true" | jq '.debug'
```

---

## 📝 Notes

- **Mock data is deterministic** - Same day = same quotes
- **Proposals require manual creation** - `/strategy/run` only analyzes, doesn't persist
- **Cron jobs are scheduled** - Will auto-ingest every 15 min during market hours
- **Switch date: Nov 1st** - Remember to flip `MARKET_DATA_MODE=live`

---

**Last Updated:** October 30, 2025, 10:45 AM EST  
**Next Milestone:** UI + Telegram validation (today)  
**Future:** Live data activation (Nov 1st)

