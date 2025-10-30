# Phase B1: Infrastructure & Greeks - CHECKPOINT

## ✅ Completed

### **1. D1 Migration** ✓
- **File:** `apps/worker/migrations/003_strategy_tables.sql`
- **Applied:** Yes (production D1)
- **Tables Created:**
  - `iv_history` - IV samples for IV Rank calculation
  - `option_quotes` - Greeks cache (7-day retention)
  - `trades` - Execution tracking (Phase 3)
- **Columns Added to `proposals`:**
  - `entry_type` - Strategy type (CREDIT_SPREAD, DEBIT_CALL)
  - `legs_json` - Multi-leg structure
  - `qty` - Position size
  - `pop` - Probability of profit
  - `rr` - Risk/reward ratio
  - `dedupe_key` - Deduplication hash

### **2. Worker Helper Utilities** ✓
- **File:** `apps/worker/src/utils/options.ts`
- **Functions:**
  - `ivRank()` - Calculate IV percentile from history
  - `pickNearestDTE()` - Select optimal expiry
  - `mid()` - Calculate mid price from bid/ask
  - `pctBidAsk()` - Spread quality check
  - `blackScholesDelta()` - Delta fallback when greeks missing
  - `calculateDTE()` - Days to expiration
  - `hashLegs()` - Deduplication hashing
  - `createDedupeKey()` - Full dedupe key generator
  - `isDuplicate()` - Check for existing proposals

---

## ⏳ **Waiting on You: Mac Mini IBKR Service Update**

### **Action Required:**

1. **Apply the patch:**
   - See: `IBKR_MAC_MINI_PATCH.md`
   - Add `/options/quotes` endpoint to `~/ibkr-broker/app/main.py`
   - Takes ~5 minutes

2. **Restart service:**
   ```bash
   pkill -f "uvicorn app.main"
   cd ~/ibkr-broker
   source .venv/bin/activate
   IB_CLIENT_ID=22 uvicorn app.main:app --host 127.0.0.1 --port 8081 --loop asyncio > broker.out.log 2> broker.err.log &
   disown
   ```

3. **Test locally:**
   ```bash
   curl -X POST http://127.0.0.1:8081/options/quotes \
     -H 'content-type: application/json' \
     -d '{
       "contracts": [
         {"symbol": "AAPL", "expiry": "2025-12-19", "strike": 200.0, "right": "P"}
       ]
     }' | jq .
   ```

   **Expected (market closed):**
   ```json
   {
     "quotes": [{
       "symbol": "AAPL",
       "expiry": "2025-12-19",
       "strike": 200.0,
       "right": "P",
       "bid": null,
       "ask": null,
       "mid": null,
       "iv": null,
       "delta": null,
       ...
     }]
   }
   ```

4. **Test through tunnel:**
   ```bash
   curl -X POST https://ibkr-broker.gekkoworks.com/options/quotes \
     -H 'content-type: application/json' \
     -d '{
       "contracts": [
         {"symbol": "AAPL", "expiry": "2025-12-19", "strike": 200.0, "right": "P"}
       ]
     }' | jq .
   ```

---

## 📊 **Phase B1 Status**

| Component | Status | Location |
|-----------|--------|----------|
| D1 Tables | ✅ Complete | Production D1 |
| Worker Helpers | ✅ Complete | `apps/worker/src/utils/options.ts` |
| IBKR Greeks Endpoint | ⏳ **Waiting** | Mac mini patch |
| Worker Proxy | ⏳ Pending | Phase B2 |
| Strategy Engine | ⏳ Pending | Phase B2 |

---

## 🚀 **Next: Phase B2 (After Mac Mini Update)**

Once `/options/quotes` is working on Mac mini:

1. **Worker IBKR Proxy** - Add `/broker/options/quotes` route
2. **Strategy Engine** - Implement `/strategy/run`:
   - Bull Put Credit Spreads (DTE 30-45, delta -0.25)
   - Long Call Momentum (DTE 30-60, delta 0.65)
   - IV Rank filtering
   - Position sizing (0.5% risk per trade)
   - Deduplication
3. **Testing** - Synthetic chains + real delayed data

---

## 💡 **Current System State**

```
✅ Mac mini: Running (IB Gateway connected)
✅ D1: Phase 2B tables created
✅ Worker: Helper utils ready
⏳ IBKR Service: Needs /options/quotes endpoint
🔜 Strategy Engine: Ready to build once greeks available
```

---

## 📝 **When You're Ready**

Reply with:
- "**Mac mini updated**" - I'll proceed to Phase B2
- Or paste any errors you encountered

---

**Estimated Time:** Phase B1 = ✅ Done | Your action = ~5-10 minutes | Phase B2 = ~1.5 hours

