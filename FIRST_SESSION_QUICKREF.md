# First Session Quick Reference Card
**Date:** November 1, 2025 | **Market Hours:** 9:30 AM - 4:00 PM EST

---

## ⏰ Timeline

| Time | Action | Command |
|------|--------|---------|
| **9:30 AM** | Market opens, monitor for quotes | - |
| **9:35 AM** | First manual pass | `curl https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true \| jq` |
| **9:45 AM** | First cron run (automated) | Check Telegram for alerts |
| **9:45-10:00 AM** | Review & approve 3-5 proposals | `https://sas-web.pages.dev/proposals` |
| **10:30 AM** | Second cron run | Monitor D1 for new proposals |
| **Hourly** | Automated analysis runs | :30 past each hour (10:30, 11:30, 12:30, 1:30, 2:30) |

---

## 🔗 Quick Links

| Resource | URL |
|----------|-----|
| **Web UI** | https://sas-web.pages.dev/proposals |
| **Worker API** | https://sas-worker-production.kevin-mcgovern.workers.dev |
| **Health Check** | https://sas-worker-production.kevin-mcgovern.workers.dev/health |
| **Cloudflare Dashboard** | https://dash.cloudflare.com |

---

## 📊 Key Endpoints

```bash
# Health check
curl https://sas-worker-production.kevin-mcgovern.workers.dev/health

# Force strategy run
curl https://sas-worker-production.kevin-mcgovern.workers.dev/strategy/run?force=true | jq

# Get proposals
curl https://sas-worker-production.kevin-mcgovern.workers.dev/proposals | jq

# Get account info
curl https://sas-worker-production.kevin-mcgovern.workers.dev/broker/account | jq
```

---

## 🎯 Expected Results (9:35 AM First Pass)

### Proposals
- **Count:** 5-10 proposals
- **Strategies:** Mix of 5-7 types (Long Call, Long Put, Bull Put Credit, Bear Call Credit, Iron Condor, Calendar Call/Put)
- **Scores:** Range 50-85
- **High-confidence:** At least 3 with score ≥70

### Example Output
```json
{
  "timestamp": 1761828000000,
  "count": 8,
  "proposals": [
    {
      "id": "LC-AAPL-230-2025-12-19",
      "strategy": "LONG_CALL",
      "symbol": "AAPL",
      "score": 78.5,
      "debit": 8.50,
      "pop": null,
      "rr": 2.35,
      "legs": [...]
    },
    // ... more proposals
  ]
}
```

---

## ✅ Day-1 Success Criteria

**Must achieve 5/5:**

| # | Criteria | How to Verify |
|---|----------|---------------|
| 1 | **Strategy Diversity** | `SELECT strategy, COUNT(*) FROM proposals GROUP BY 1` |
| 2 | **Quality Bar** (≥3 with score ≥70) | `SELECT COUNT(*) FROM proposals WHERE score >= 70` |
| 3 | **Order Execution** | Check D1 `trades` table, status = 'acknowledged' |
| 4 | **Low Reject Rate** (<5%) | `SELECT status, COUNT(*) FROM trades GROUP BY 1` |
| 5 | **Version Tracking** | `SELECT engine_version FROM proposals LIMIT 1` |

---

## 🗄️ Quick D1 Queries

### Strategy Mix
```sql
SELECT strategy, COUNT(*) as n, ROUND(AVG(score),1) as avg_score
FROM proposals
WHERE created_at > strftime('%s','now')*1000 - 3600000
GROUP BY 1 ORDER BY 2 DESC;
```

### Top Proposals
```sql
SELECT symbol, strategy, score, pop, rr, credit, debit
FROM proposals
WHERE score >= 70
ORDER BY score DESC LIMIT 20;
```

### Routing Health
```sql
SELECT strategy, COUNT(*) AS submitted,
  SUM(CASE WHEN status='acknowledged' THEN 1 ELSE 0 END) AS ack,
  SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rej
FROM trades
WHERE created_at > strftime('%s','now')*1000 - 1800000
GROUP BY 1;
```

### Recent Proposals
```sql
SELECT symbol, strategy, score, 
  CASE WHEN credit IS NOT NULL THEN credit ELSE debit END as premium,
  created_at
FROM proposals
WHERE created_at > strftime('%s','now')*1000 - 3600000
ORDER BY created_at DESC LIMIT 10;
```

---

## 🚨 Troubleshooting

### No Proposals Generated
```bash
# 1. Check broker connectivity
curl https://sas-worker-production.kevin-mcgovern.workers.dev/broker/account

# 2. Check market data in D1
wrangler d1 execute sas-proposals --env production \
  --command "SELECT COUNT(*) FROM market_data WHERE timestamp > strftime('%s','now')*1000 - 600000"

# 3. Check Worker logs
wrangler tail --env production
```

### Telegram Not Firing
```bash
# Verify secrets are set in Cloudflare Dashboard:
# - TELEGRAM_BOT_TOKEN
# - TELEGRAM_CHAT_ID
```

### High Reject Rate
```sql
-- Check reject reasons
SELECT symbol, strategy, status, broker_message
FROM trades
WHERE status = 'rejected'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🛑 Emergency Kill Switches

### Disable One Strategy
```bash
cd /Users/kevinmcgovern/sas
# Edit: apps/worker/src/config/strategies.ts
# Set: STRATEGIES.STRATEGY_NAME.enabled = false
wrangler deploy --env production
```

### Disable All Strategies
```
Cloudflare Dashboard → Workers → sas-worker-production
→ Settings → Variables → Edit
→ Set SAS_PHASE = "0"
→ Save (auto-deploys)
```

### Pause Cron Jobs
```
Cloudflare Dashboard → Workers → sas-worker-production
→ Triggers → Cron Triggers
→ Disable all cron triggers
```

---

## 📈 Monitoring Commands

### Live Worker Logs
```bash
wrangler tail --env production
```

### Watch Proposals (every 30s)
```bash
watch -n 30 'curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/proposals | jq ".proposals | length"'
```

### Count by Strategy
```bash
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/proposals | \
  jq -r '.proposals | group_by(.strategy) | map({strategy: .[0].strategy, count: length}) | .[]'
```

---

## 🎨 Score Interpretation

| Score | Color | Meaning | Action |
|-------|-------|---------|--------|
| **80-100** | 🟢 Green | Excellent | High-confidence approve |
| **70-79** | 🟡 Yellow | Strong | Good approve candidate |
| **60-69** | 🟠 Orange | Tradable | Consider with caution |
| **50-59** | 🔵 Blue | Marginal | Usually skip |
| **<50** | ⚪ Gray | Poor | Auto-filtered out |

---

## 💡 Strategy Cheat Sheet

| Strategy | Entry Bias | IV Preference | Structure |
|----------|------------|---------------|-----------|
| **Long Call** | Bullish | Low (buy) | 1 leg: Buy call |
| **Long Put** | Bearish | Low (buy) | 1 leg: Buy put |
| **Bull Put Credit** | Bullish | High (sell) | 2 legs: Sell put, Buy put (lower) |
| **Bear Call Credit** | Bearish | High (sell) | 2 legs: Sell call, Buy call (higher) |
| **Iron Condor** | Neutral | Moderate | 4 legs: Sell OTM put/call spreads |
| **Calendar Call** | Bullish + Vol expansion | Positive term skew | 2 legs: Sell front call, Buy back call |
| **Calendar Put** | Bearish + Vol expansion | Positive term skew | 2 legs: Sell front put, Buy back put |

---

## 📞 Support

### Get Current Config
```bash
# Check phase
curl -s https://sas-worker-production.kevin-mcgovern.workers.dev/health | jq

# Check strategies enabled
# (requires reading src/config/strategies.ts)
```

### Restart IBKR Broker (Mac Mini)
```bash
# SSH to Mac mini
ssh user@mac-mini

# Restart service
launchctl stop com.sas.ibkr-broker
launchctl start com.sas.ibkr-broker

# Check status
launchctl list | grep ibkr-broker
```

---

## ⚙️ Current Configuration

| Setting | Value |
|---------|-------|
| **Phase** | 3 (all strategies) |
| **Mode** | paper |
| **Risk per Trade** | 0.5% of equity |
| **Max Notional** | $50,000 |
| **Max Contracts** | 5 per leg |
| **Credit Spreads Min** | 30% of width |
| **Condors Min** | 25% of width |
| **Alert Threshold** | Score ≥50 |
| **Proposal Frequency** | Hourly (:30 past hour) |
| **Cron Schedule** | `30 10-15 * * 1-5` (10:30-15:30 ET Mon-Fri) |

---

## 🎯 First Hour Checklist

- [ ] 9:30 AM: Market opens
- [ ] 9:35 AM: Force first strategy run
- [ ] 9:35 AM: Verify 5-10 proposals generated
- [ ] 9:35 AM: Check mix includes different strategies
- [ ] 9:35 AM: Verify at least 3 with score ≥70
- [ ] 9:40 AM: Open Web UI and review proposals
- [ ] 9:45 AM: Approve 3-5 high-confidence trades
- [ ] 9:45 AM: Verify Telegram alerts received
- [ ] 9:50 AM: Check D1 trades table for 'acknowledged' status
- [ ] 10:00 AM: Confirm engine_version populated
- [ ] 10:30 AM: Verify second cron run fires automatically

---

**Status:** 🟢 READY  
**Confidence:** 100%  
**Last Updated:** 2025-11-01 08:48 EST  
**Next Action:** Wait for 9:30 AM market open 🔔

