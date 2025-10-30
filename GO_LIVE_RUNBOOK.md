# 🚀 SAS Multi-Strategy Go-Live Runbook

**Your Production Setup:**
- **Worker:** https://sas-worker-production.kevin-mcgovern.workers.dev
- **Web UI:** https://sas-web.pages.dev
- **D1 Database:** `sas-proposals`
- **Current Phase:** 3 (All strategies enabled)

---

## 1️⃣ PRE-FLIGHT: Confirm Configuration (2 min)

### Check Current Settings
```bash
# View production configuration
cd /Users/kevinmcgovern/sas/apps/worker
grep -A 15 "env.production.vars" wrangler.toml
```

**Expected Output:**
```toml
SAS_PHASE = "3"           ✅ All strategies enabled
TRADING_MODE = "paper"    ✅ Safe mode
ACCOUNT_EQUITY = "100000" ✅ $100k for sizing
```

### Current Guardrails (Already Set)
```bash
# In your code: apps/worker/src/strategies/*.ts
RISK_FRACTION = 0.005     # 0.5% of equity per trade
MAX_CONTRACTS = 5         # Max 5 contracts
MAX_NOTIONAL = 10000      # Max $10k per position
```

✅ **These are already configured correctly in your deployment.**

---

## 2️⃣ DEPLOY (Skip - Already Done!)

✅ Worker v2.0 deployed (b0fe5807)  
✅ Phase 3 active  
✅ Health check passing  

**If you need to redeploy:**
```bash
cd /Users/kevinmcgovern/sas/apps/worker
wrangler deploy --env production
```

---

## 3️⃣ SMOKE TESTS (Now - Pre-Market)

### A. Health Check
```bash
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/health | jq .
```
**Expected:**
```json
{
  "ok": true,
  "service": "sas-worker",
  "version": "1.0.0"
}
```

### B. Strategy Engine (Empty Pre-Market is OK)
```bash
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run | jq .
```
**Expected Pre-Market:**
```json
{
  "timestamp": ...,
  "count": 0,
  "proposals": [],
  "message": "No option quotes available."
}
```

✅ **Both tests passing as of 11:20 PM ET**

---

## 4️⃣ CRON VERIFICATION (Already Active)

Your crons are **already configured and deployed:**
```bash
# View active cron triggers
wrangler deployments list --env production | head -10
```

**Active Schedules:**
- ✅ `*/15 * * * 1-5` - Every 15 min (market data ingestion)
- ✅ `45 13 * * 1-5` - 9:45 AM ET (auto-proposals)
- ✅ `45 16 * * 1-5` - 12:45 PM ET (auto-proposals)
- ✅ `45 19 * * 1-5` - 3:45 PM ET (auto-proposals)

---

## 🌅 MARKET-OPEN PLAYBOOK (First Session - Nov 1, 9:30 AM ET)

### A. Force Manual Analysis (9:35-9:40 AM)

Wait 5-10 minutes after open for quotes to populate, then:

```bash
curl -s "https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run" \
  | jq '.candidates[] | {symbol, strategy, score, pop, rr, legs: (.legs|length), dte}'
```

**What to Look For:**

✅ **Phase 1 Strategies:**
```json
{"symbol":"AAPL","strategy":"LONG_CALL","score":65,"legs":1}
{"symbol":"SPY","strategy":"BULL_PUT_CREDIT","score":73,"legs":2}
```

✅ **Phase 2 Strategies (NEW):**
```json
{"symbol":"TSLA","strategy":"LONG_PUT","score":62,"legs":1}
{"symbol":"META","strategy":"BEAR_CALL_CREDIT","score":68,"legs":2}
```

✅ **Phase 3 Strategies (NEW):**
```json
{"symbol":"NVDA","strategy":"IRON_CONDOR","score":71,"legs":4}
{"symbol":"QQQ","strategy":"CALENDAR_CALL","score":66,"legs":2,"note":"mixed expiries"}
```

---

### B. Data Sanity Checks (D1)

#### Check Recent Option Quotes
```bash
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT COUNT(*) AS quotes_10m
FROM option_quotes
WHERE timestamp > strftime('%s','now')*1000 - 600000;
"
```
**Expected:** > 100 rows (if ingestion working)

#### Check Fresh Proposals
```bash
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT strategy, symbol, score, 
       datetime(created_at/1000, 'unixepoch') as created
FROM proposals
ORDER BY created_at DESC
LIMIT 20;
"
```
**Expected:** Mix of strategies from last hour

#### Strategy Distribution
```bash
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT strategy, COUNT(*) as count, AVG(score) as avg_score
FROM proposals
WHERE created_at > strftime('%s','now')*1000 - 86400000
GROUP BY strategy
ORDER BY count DESC;
"
```
**Expected:** All 6 active strategies represented (if market conditions allow)

---

### C. UI Spot Check

Open: **https://sas-web.pages.dev/proposals**

#### Verify Rendering:

**2-Leg Structures (Credit/Debit Spreads):**
```
Bull Put Credit Spread • SPY • Score 73
Legs:
  SELL PUT 480 • 2025-12-19
  BUY  PUT 475 • 2025-12-19
```

**4-Leg Structure (Iron Condor):**
```
Iron Condor • NVDA • Score 71
Legs:
  SELL CALL 550 • 2025-12-19
  BUY  CALL 555 • 2025-12-19
  SELL PUT  530 • 2025-12-19
  BUY  PUT  525 • 2025-12-19
```

**Mixed Expiry (Calendar):**
```
Calendar Call Spread • QQQ • Score 66
Legs:
  SELL CALL 450 • 2025-11-15  ← Front month
  BUY  CALL 450 • 2025-12-19  ← Back month
```

#### Check Score Colors:
- ✅ Score ≥70: **Green badge**
- ✅ Score 50-69: **Yellow badge**

---

## ✅ GOOD vs ❌ NOT GOOD

### ✅ **Good (Expected)**

- Proposals appear within 10-15 min of market open
- Mix of strategies based on market:
  - **Bullish:** LONG_CALL, BULL_PUT_CREDIT
  - **Bearish:** LONG_PUT, BEAR_CALL_CREDIT
  - **Neutral:** IRON_CONDOR (if range-bound)
  - **Vol Expansion:** CALENDAR_CALL (if term structure positive)
- POP and R/R populated (except calendars may omit POP)
- Scores clustered 55-80 (typical range)
- Some ≥70 in green (high-quality setups)

### ❌ **Not Good → Troubleshooting**

#### Problem: No Proposals at All
```bash
# Check if quotes are flowing
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT COUNT(*) FROM option_quotes WHERE timestamp > strftime('%s','now')*1000-600000;
"
```
- **If 0:** Ingestion issue (check broker connection, tunnel health)
- **If >0:** Check strategy scoring thresholds

#### Problem: Only Phase 1 Strategies (Long Call + Bull Put)
```bash
# Verify Phase setting
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run | jq .debug
```
- **Fix:** Confirm `SAS_PHASE="3"` in wrangler.toml production vars
- **Then:** Redeploy worker

#### Problem: No Iron Condors
**Possible Reasons:**
1. Trend not NEUTRAL (currently all symbols return NEUTRAL, so unlikely)
2. Within 7 days of earnings (check symbols)
3. Delta symmetry too strict (±0.22 target)
4. IV Rank outside 20-60 range

**Quick Test - Relax Filters:**
```typescript
// In apps/worker/src/strategies/ironCondor.ts
const CONFIG = {
  IVR_SWEET_SPOT: [10, 80] as [number, number],  // Was [20, 60]
  SYMMETRY_TOLERANCE: 0.08,  // Was 0.05
};
```

#### Problem: No Calendar Spreads
**Possible Reasons:**
1. Term structure not positive enough (requires backIV > frontIV by 2+ pts)
2. Missing front (14-21 DTE) or back (45-75 DTE) expiries
3. IV data missing from option quotes

**Quick Test - Lower Threshold:**
```typescript
// In apps/worker/src/strategies/calendarCall.ts
const CONFIG = {
  MIN_TERM_SKEW_PTS: 0.5,  // Was 2.0 - more lenient
};
```

---

## 🔧 REAL-TIME MONITORING

### Watch Logs Live
```bash
wrangler tail --env production
```
Press `Ctrl+C` to stop.

### Quick Strategy Summary
```bash
# Create this helper script
cat > /tmp/sas-summary.sh << 'EOF'
#!/bin/bash
echo "=== SAS Strategy Summary ==="
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run \
  | jq -r '.candidates[] | "\(.strategy) • \(.symbol) • Score: \(.score) • Legs: \(.legs|length)"' \
  | sort -t'•' -k3 -rn
EOF

chmod +x /tmp/sas-summary.sh
/tmp/sas-summary.sh
```

### Monitor Telegram Alerts
- Check your Telegram for alerts (score ≥50)
- Should see formatted messages with legs, R/R, POP

---

## 🧪 PAPER-ROUTING DRY RUN

### 1. Approve High-Scoring Proposals
- Open https://sas-web.pages.dev/proposals
- Click **"Approve & Route (Paper)"** on green (≥70) cards

### 2. Verify Order Submission
```bash
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT id, proposal_id, symbol, strategy, status, 
       datetime(created_at/1000, 'unixepoch') as created
FROM trades
ORDER BY created_at DESC
LIMIT 10;
"
```
**Expected:** Status = `submitted` (paper mode)

### 3. Check Broker Logs (Mac mini)
```bash
# On Mac mini
tail -f ~/ibkr-broker/broker.out.log
```
Look for order acknowledgments from IBKR.

---

## 🎚️ SAFE TWEAKS (Today)

### Raise Score Bar (More Selective)
```typescript
// In apps/worker/src/config/strategies.ts
export const STRATEGIES: StrategyRegistry = {
  LONG_CALL: { ..., minScore: 60 },  // Was 50
  IRON_CONDOR: { ..., minScore: 70 }, // Was 55
  // etc.
};
```

### Lower Risk (Smaller Positions)
```typescript
// In apps/worker/src/strategies/*.ts (all files)
const CONFIG = {
  RISK_FRACTION: 0.003,  // Was 0.005 (0.3% vs 0.5%)
  MAX_QTY: 3,            // Was 5
};
```

### Reduce Universe (Faster Validation)
```typescript
// In apps/worker/src/routes/strategyRun.ts
const UNIVERSE = ['AAPL', 'SPY', 'QQQ', 'MSFT', 'NVDA'];  // S&P 5 for testing
const symbols = symbolRows
  .map((r: any) => r.symbol)
  .filter(s => UNIVERSE.includes(s));
```

---

## 🔄 ROLLBACK PLAN (1 Minute)

### Option A: Back to Phase 1 Only
```bash
cd /Users/kevinmcgovern/sas/apps/worker
# Edit wrangler.toml: SAS_PHASE = "1"
wrangler deploy --env production
```
Result: Only Long Call + Bull Put Credit Spread

### Option B: Disable Specific Strategy
```typescript
// In apps/worker/src/config/strategies.ts
export const STRATEGIES: StrategyRegistry = {
  // ...
  IRON_CONDOR: { enabled: false, ... },  // Disable Iron Condor
  // ...
};
```
Then redeploy.

---

## 📊 DATA TO CAPTURE TODAY

Create a tracking spreadsheet or D1 table:

```sql
CREATE TABLE IF NOT EXISTS strategy_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER,
  strategy TEXT,
  symbol TEXT,
  score REAL,
  ivr REAL,
  short_delta REAL,
  dte INTEGER,
  entry_price REAL,
  pop REAL,
  rr REAL,
  outcome_1d REAL,    -- P/L after 1 day
  outcome_5d REAL,    -- P/L after 5 days
  exit_reason TEXT
);
```

This powers your first **score-band reality check**:
- Do 70-79 scores beat 60-69 scores?
- Which strategies have best POP accuracy?
- Which IV Rank ranges perform best?

---

## 🎯 FIRST-DAY SUCCESS CRITERIA

By end of first trading session (4:00 PM ET):

- ✅ At least 5 proposals generated across multiple strategies
- ✅ UI renders all structures correctly (1-leg, 2-leg, 4-leg, mixed-expiry)
- ✅ Telegram alerts received for high-scoring proposals
- ✅ At least 1 paper order submitted successfully
- ✅ No Worker errors in logs
- ✅ Score distribution looks reasonable (50-85 range)

---

## 📞 QUICK COMMANDS REFERENCE

```bash
# Health
curl https://sas-worker-production.kevin-mcgovern.workers.dev/health | jq .

# Run strategy engine
curl https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run | jq .

# Recent proposals
wrangler d1 execute sas-proposals --remote --env production --command "SELECT * FROM proposals ORDER BY created_at DESC LIMIT 5;"

# Recent trades
wrangler d1 execute sas-proposals --remote --env production --command "SELECT * FROM trades ORDER BY created_at DESC LIMIT 5;"

# Watch logs
wrangler tail --env production

# UI
open https://sas-web.pages.dev/proposals
```

---

**Status:** ✅ READY FOR MARKET OPEN  
**Next:** Nov 1, 2024, 9:30 AM ET  
**Goal:** Validate all 7 strategies with live data 🚀

