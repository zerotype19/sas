# 📱 SAS Day 1 Operations Guide

**Quick Reference for Market Open - Nov 1, 2024**

Keep this open on your phone/second monitor. No fluff, just actions and decision points.

---

## 🌅 PRE-OPEN SANITY (5 min - Do Once)

```bash
cd /Users/kevinmcgovern/sas

# 1. Engine status
./scripts/monitor-strategies.sh

# 2. Data health  
./scripts/check-data.sh

# 3. Proposals (will be empty pre-market - OK)
./scripts/view-proposals.sh
```

**✅ Good:**
- Scripts run without errors
- Worker health: ONLINE
- SAS_PHASE: 3

**❌ Fix:**
```bash
# If permission denied
chmod +x scripts/*.sh

# If wrangler not found
which wrangler  # Should be installed
```

---

## 🎯 FIRST SESSION (9:35-10:00 AM ET)

### Step 1: Wait for Data (9:35 AM)
Wait 5 minutes after open for quotes to populate.

### Step 2: Check Strategy Output (9:40 AM)
```bash
./scripts/monitor-strategies.sh
```

**What You Want to See:**

✅ **Phase 1 (Existing):**
```
✓ LONG_CALL • AAPL • Score: 65
✓ BULL_PUT_CREDIT • SPY • Score: 73
```

✅ **Phase 2 (Bearish - NEW):**
```
✓ LONG_PUT • TSLA • Score: 62
✓ BEAR_CALL_CREDIT • META • Score: 68
```

✅ **Phase 3 (Advanced - NEW):**
```
✓ IRON_CONDOR • NVDA • Score: 71 • Legs: 4
✓ CALENDAR_CALL • QQQ • Score: 66 • Legs: 2
```

### Step 3: UI Check (9:45 AM)
Open: https://sas-web.pages.dev/proposals

**Verify:**
- [ ] Green badges (≥70) are GREEN
- [ ] Yellow badges (50-69) are YELLOW
- [ ] Legs render correctly (1/2/4 legs)
- [ ] Calendar shows different expiries

### Step 4: Paper Routing Test (9:50 AM)
**Approve 2-4 green (≥70) cards:**
- At least 1 from each type: 1-leg, 2-leg, 4-leg
- Diversify symbols (don't approve 3x AAPL)

**Check:**
```bash
./scripts/view-proposals.sh
```
Status should change from `pending` → `submitted`

---

## 🚦 INSTANT HEALTH SIGNALS

### ✅ GREEN = GOOD

**Engine:**
- Proposals appear 5-15 min after open
- Scores: 55-85 range
- Mix of strategy types present

**Routing:**
- Orders show correct legs (1/2/4)
- Status: `submitted` → `acknowledged`
- No errors in logs

**Risk:**
- Per-trade ≤ 0.5% equity
- Qty ≤ 5 contracts
- Notional ≤ $10k

### 🟡 YELLOW = INVESTIGATE

**Proposals but wrong mix:**
- Only bullish strategies → Market trending up (OK)
- Only Phase 1 strategies → Check `SAS_PHASE=3`

**Orders rejected:**
- Check IBKR connection
- Verify leg structure in D1

### 🔴 RED = TRIAGE NEEDED

**No proposals at all:**
```bash
# Check data first
./scripts/check-data.sh

# If quotes exist but no proposals:
# Temporarily lower minScore threshold
```

---

## 🔧 QUICK TRIAGE FLOW

### Problem: No Proposals At All

**Diagnosis:**
```bash
# Check option quotes
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT COUNT(*) FROM option_quotes 
WHERE timestamp > strftime('%s','now')*1000-600000;
"
```

**If count = 0:** Ingestion issue (check broker, tunnel)

**If count > 0:** Scoring too strict

**Quick Fix:**
```typescript
// apps/worker/src/config/strategies.ts
// Lower minScore temporarily
LONG_CALL: { ..., minScore: 40 },  // Was 50
```
Redeploy and retest.

---

### Problem: Only Phase 1 Strategies

**Check:**
```bash
curl https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run \
  | jq '.debug // {}'
```

**Fix:**
Verify `SAS_PHASE="3"` in wrangler.toml production vars.

```bash
cd apps/worker
grep "SAS_PHASE" wrangler.toml
# Should show: SAS_PHASE = "3"

# If wrong, edit and redeploy
wrangler deploy --env production
```

---

### Problem: No Iron Condors

**Likely Causes:**
1. Market not neutral (trending)
2. Earnings blocking (within 7 days)
3. Delta symmetry too strict
4. IVR outside 20-60 range

**Quick Test - Relax Filters:**
```typescript
// apps/worker/src/strategies/ironCondor.ts
const CONFIG = {
  IVR_SWEET_SPOT: [10, 80] as [number, number],  // Was [20,60]
  SYMMETRY_TOLERANCE: 0.08,  // Was 0.05
};
```

Redeploy, retest, then revert after confirming plumbing works.

---

### Problem: No Calendar Spreads

**Likely Causes:**
1. Term structure not positive enough
2. Missing front/back expiries
3. IV data missing

**Quick Test - Lower Threshold:**
```typescript
// apps/worker/src/strategies/calendarCall.ts
const CONFIG = {
  MIN_TERM_SKEW_PTS: 0.5,  // Was 2.0
};
```

Redeploy and retest.

---

### Problem: Order Rejections

**Check Logs:**
```bash
wrangler tail --env production
```

**Common Issues:**
- IBKR session expired → Check Mac mini broker
- Incorrect leg structure → Query D1 `trades` table
- Invalid strikes → Check option chain data

**Verify Broker:**
```bash
curl http://localhost:8081/  # On Mac mini
# Should return: {"service":"IBKR Broker Service","connected":true}
```

---

## 📊 DATA TO CAPTURE TODAY

**Critical Fields for Each Approved Proposal:**

Create tracking table or spreadsheet:
```
timestamp
symbol
strategy
score
ivr
short_delta
dte
entry_price (credit/debit)
pop
rr
target
stop
max_risk_usd
qty
status
exit_reason
pnl_usd_at_exit
pnl_pct_at_exit
```

**Why:** Enables score-band reality check within 48 hours.

**Quick Export:**
```bash
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT 
  datetime(created_at/1000, 'unixepoch') as time,
  symbol, strategy, score, ivr, dte, 
  entry_price, pop, rr, qty, status
FROM proposals
WHERE created_at > strftime('%s','now')*1000-86400000
ORDER BY created_at DESC;
" > day1_proposals.csv
```

---

## ✅ DAY-1 SUCCESS CRITERIA

**Objective Scorecard (Need 4/5 to declare success):**

- [ ] Engine emits ≥4 different strategy types
- [ ] ≥3 proposals with score ≥70 appear
- [ ] Successfully route at least one: 1-leg, 2-leg, 4-leg
- [ ] Risk guardrails enforced (check max_risk_usd in logs)
- [ ] Telemetry captured (proposals + trades in D1)

**Stretch Goal:**
- [ ] All 6 active strategies represented (market-dependent)

---

## 🎚️ SAFE KNOBS (Can Turn Today)

### Volume Control (Less Noise)
```typescript
// apps/worker/src/config/strategies.ts
export const STRATEGIES: StrategyRegistry = {
  LONG_CALL: { ..., minScore: 70 },      // Was 50
  BULL_PUT_CREDIT: { ..., minScore: 70 },// Was 50
  // Raise all to 70 for more selective
};
```

### Risk Tighter (Smaller Positions)
```typescript
// In each apps/worker/src/strategies/*.ts
const CONFIG = {
  RISK_FRACTION: 0.003,  // Was 0.005 (0.3% vs 0.5%)
  MAX_QTY: 3,            // Was 5
};
```

### Scope Smaller (Cleaner Debug)
```typescript
// apps/worker/src/routes/strategyRun.ts
// Add after line ~86:
const UNIVERSE = ['AAPL', 'SPY', 'QQQ', 'MSFT', 'NVDA'];
const symbols = symbolRows
  .map((r: any) => r.symbol)
  .filter(s => UNIVERSE.includes(s));
```

---

## 📅 72-HOUR PLAN

### Day 1 (Today)
- ✅ Validate all strategies emit
- ✅ Capture proposals + outcomes
- ✅ Verify risk guardrails

### Day 2 (Nov 2)
- Export Day 1 data
- Chart: Score band vs realized P/L
- Chart: Strategy type vs win rate
- Identify any obvious outliers

### Day 3 (Nov 3)
- **If** any strategy's ≥70 band underperforms 2 days in a row:
  - Raise that strategy's `minScore` by 5-10
  - DO NOT overfit to single outlier
- **If** trend detection seems off:
  - Plan to add basic TA (MA cross, RSI)

### Week 1 Goals
- [ ] Integrate earnings calendar (blocks iron condors)
- [ ] Add trend detection (improves bearish/neutral signals)
- [ ] Tune score thresholds based on 5-day data
- [ ] Document what works/doesn't by strategy type

---

## ⚡ EMERGENCY ROLLBACK

### Option A: Back to Phase 1
```bash
# Edit wrangler.toml
SAS_PHASE = "1"  # Only Long Call + Bull Put

# Redeploy (1 min)
cd apps/worker && wrangler deploy --env production
```

### Option B: Disable One Strategy
```typescript
// apps/worker/src/config/strategies.ts
IRON_CONDOR: { enabled: false, ... },
```
Then redeploy.

### Option C: Kill Switch (Stop All)
```bash
# Comment out cron in wrangler.toml
# [triggers]
# crons = []

# Redeploy
wrangler deploy --env production
```
Manual operations still work, but no auto-proposals.

---

## 📞 COMMAND CHEAT SHEET

```bash
# Health
curl https://sas-worker-production.kevin-mcgovern.workers.dev/health | jq .

# Strategy run
curl https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run | jq .

# Monitor (formatted)
./scripts/monitor-strategies.sh

# Data check
./scripts/check-data.sh

# View proposals
./scripts/view-proposals.sh

# Watch logs live
wrangler tail --env production

# UI
open https://sas-web.pages.dev/proposals

# Recent proposals (D1)
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT id, symbol, strategy, score, status FROM proposals 
ORDER BY created_at DESC LIMIT 10;
"

# Recent trades (D1)
wrangler d1 execute sas-proposals --remote --env production --command "
SELECT id, proposal_id, symbol, status FROM trades 
ORDER BY created_at DESC LIMIT 10;
"
```

---

## 🎯 DECISION TREE (First 30 Min)

```
START (9:35 AM)
  ↓
Run: ./scripts/monitor-strategies.sh
  ↓
Proposals found?
  ├─ YES → Check mix of strategies
  │         ├─ Mix good → ✅ APPROVE 2-4 green cards
  │         └─ Only Phase 1 → Check SAS_PHASE=3
  │
  └─ NO → Check data: ./scripts/check-data.sh
            ├─ Quotes = 0 → Fix ingestion (broker/tunnel)
            └─ Quotes > 0 → Lower minScore threshold
```

---

## 🔍 WHAT TO SCREENSHOT/LOG

**For Debugging Later:**
1. Output of `./scripts/monitor-strategies.sh` (first hour)
2. Output of `./scripts/check-data.sh` (9:35, 10:00, 12:00)
3. First proposal of each strategy type (screenshot from UI)
4. Any error messages from logs
5. First approved order payload

**Keep in a folder:** `~/sas_day1_logs/`

---

## 💬 REAL-TIME SUPPORT

**If things go sideways:**
1. Paste output of helper scripts
2. Note what you expected vs what you got
3. Share any error messages

**I'll read them like a flight engineer and tell you:**
- What's good
- What's odd
- What to tweak on the spot

---

**Status:** ✅ READY  
**Mode:** Paper (safe)  
**Phase:** 3 (all strategies)  
**Next:** Market open in ~9 hours  

**Remember:** You're validating plumbing, not optimizing performance. Day 1 success = seeing all strategy types emit and orders route correctly. Tuning comes Days 2-3.

🚀 **You got this. See you at the bell!**

