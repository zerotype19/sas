# SAS Strategy Integrity Tests

## ✅ Test Suite Status: ALL PASSING

Last run: October 29, 2024
Tests: **11 passed**
Duration: 157ms

---

## 🎯 Purpose

Validates the **strategic integrity** of the SAS trading system by verifying:

1. **Core Math** - IV Rank, R/R, POP calculations
2. **Strategy Rules** - Credit spread & debit call eligibility
3. **Scoring Logic** - Proposal ranking aligns with strategy intent
4. **Risk Management** - Position sizing and guardrails
5. **Deduplication** - Prevents duplicate proposals

---

## 📊 Test Coverage

### Strategy Coherence (11 tests)

#### Credit Spread Validation ✅
- High IV scenario produces valid credit spread
- Credit ≥30% of width requirement
- R/R calculation accuracy (~2.2:1)
- POP calculation accuracy (~75%)
- Score calibration (≥70 for quality setups)

#### Debit Call Validation ✅
- Low IV scenario eligibility (IVR ≤40)
- Delta range validation (0.60-0.70)
- Score calibration (~45 for neutral momentum)

#### Rejection Logic ✅
- Rejects insufficient credit (<30% of width)
- Rejects high IV debit calls (IVR >40)

#### Core Math ✅
- IV Rank calculation
- Position sizing with risk limits
- Spread width and bid-ask validation

#### Deduplication ✅
- Stable hash generation for identical legs
- Different hashes for different strikes

---

## 🧪 Running Tests

### Quick Test
```bash
pnpm test
```

### From Worker Directory
```bash
cd apps/worker
pnpm test
```

### Watch Mode (for development)
```bash
cd apps/worker
pnpm test --watch
```

---

## 📈 Synthetic Test Scenarios

### Scenario 1: High-IV Credit Spread
```typescript
Symbol: AMZN
IVR: 85
Short Put: Δ=-0.25, Strike=180
Long Put: Δ=-0.10, Strike=175
Width: 5
Credit: $1.55

Expected:
- Strategy: BULL_PUT_CREDIT_SPREAD
- R/R: ~2.2:1
- POP: ~75%
- Score: ~80
- Result: ✅ PASS
```

### Scenario 2: Low-IV Debit Call
```typescript
Symbol: NVDA
IVR: 35
Call: Δ=0.65, Strike=500
Debit: $5.80

Expected:
- Strategy: LONG_CALL_MOMENTUM
- Score: ~45
- Eligible: Yes (IVR <40)
- Result: ✅ PASS
```

### Scenario 3: Rejected Credit Spread
```typescript
Symbol: AAPL
Width: 5
Credit: $1.20 (24% of width)

Expected:
- Result: REJECTED (credit <30% threshold)
- Result: ✅ PASS
```

### Scenario 4: Rejected Debit Call
```typescript
Symbol: TSLA
IVR: 65

Expected:
- Result: REJECTED (IVR >40 for debit)
- Result: ✅ PASS
```

---

## 🎓 Strategic Validation

### Score Calibration

| Strategy Type | IVR | POP/Momentum | Expected Score | Threshold | Status |
|---------------|-----|--------------|----------------|-----------|--------|
| Credit Spread | 85 | 75% | ~80 | ≥70 | ✅ PASS |
| Debit Call | 35 | 25 | ~45 | ≥40 | ✅ PASS |

### Risk Management

| Metric | Value | Validated |
|--------|-------|-----------|
| Position Size | 0.5% of equity | ✅ |
| Max Qty | 5 contracts | ✅ |
| Max Notional | $50k | ✅ |

### Eligibility Rules

| Rule | Credit Spread | Debit Call |
|------|---------------|------------|
| Min Credit | ≥30% of width | N/A |
| Max IVR | N/A | ≤40 |
| Delta Range | -0.30 to -0.20 (short) | 0.60 to 0.70 |
| Max Bid-Ask | ≤20% | ≤20% |
| DTE Range | 30-45 days | 30-60 days |

All rules: ✅ **VALIDATED**

---

## 🔄 Pre-Market Checklist

Before market open, run:

```bash
pnpm test
```

Expected output:
```
✓ tests/strategy.coherence.test.ts (11 tests)
Test Files  1 passed (1)
     Tests  11 passed (11)
```

If all tests pass, your **strategic logic is intact** and ready for live data.

---

## 📝 Adding New Tests

When adding strategies or modifying rules:

1. Add test cases to `apps/worker/tests/strategy.coherence.test.ts`
2. Run `pnpm test` to verify
3. Update this document with new scenarios

---

## 🎯 What Success Means

✅ All tests passing = Your system:
- Calculates IV Rank, R/R, and POP correctly
- Applies eligibility filters consistently
- Sizes positions per risk rules
- Scores proposals as intended
- Prevents duplicate signals

**You can trust the proposals the system generates.**

---

## 🚀 Next Steps

- [ ] Add integration tests for `/strategy/run` API
- [ ] Add contract validation tests for IBKR service
- [ ] Add UI rendering tests for proposal cards
- [ ] Add end-to-end execution tests (paper account)

---

**Last Updated:** October 29, 2024, 9:26 PM ET
**Status:** ✅ ALL SYSTEMS GO FOR MARKET OPEN
