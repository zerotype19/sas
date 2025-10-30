# SAS Operational Playbook

Daily operational procedures for running the SAS system.

## Daily Routine

### Morning Pre-Market (8:30 AM ET)

1. **Check Overnight Alerts**
   - Review Slack for any system errors or warnings
   - Verify last cron run completed successfully

2. **Review Dashboard**
   - Navigate to https://sas-web.pages.dev
   - Check open positions count
   - Verify equity at risk within limits
   - Note any positions approaching time stop (≤10 DTE)

3. **Check for New Proposals**
   - Navigate to /proposals
   - Review any pending opportunities
   - Note: New proposals typically arrive at 9:45 AM, 12:45 PM, 3:45 PM ET

### During Market Hours

#### 9:45 AM ET - First Scan

**Trigger:** Slack notification "📊 SAS Proposal: [SYMBOL]"

**Action:**
1. Click Slack link → Opens proposal in UI
2. Review proposal card:
   - Skew Z-score (should be ≤ -2)
   - IV-RV spread (should be ≥ 25%)
   - Momentum direction matches bias
   - R/R ratio (target ≥ 1.5)
   - DTE (typically 45 days)
3. Check current market conditions:
   - VIX level (prefer elevated)
   - Ticker news/events
   - Overall market direction
4. Decide:
   - **Approve:** Select quantity (default 5), click "Approve"
   - **Skip:** Click "Skip" to dismiss

**Decision Framework:**
- ✓ Approve if: All filters pass, no major news, RR ≥ 1.5
- ✗ Skip if: Earnings within DTE, position already held in same ticker, market conditions unfavorable

#### 12:45 PM ET - Midday Scan

Same process as 9:45 AM scan.

#### 3:45 PM ET - Closing Scan

Same process as above. Consider:
- Less time to review vs. morning
- End-of-day volatility patterns
- Weekend risk (on Fridays)

### End of Day (4:00 PM ET)

1. **Review Today's Actions**
   - Check if any approvals were made
   - Verify positions opened correctly
   - Review any guardrail blocks (investigate why)

2. **Position Check**
   - Navigate to /positions
   - For each open position:
     - Note current P/L (from latest mark)
     - Check days remaining to expiration
     - Note any approaching TP/SL levels

3. **Prepare for Tomorrow**
   - Mental note of equity at risk %
   - Note how many position slots remain
   - Review calendar for upcoming events (FOMC, CPI, etc.)

### Weekly Review (Friday Afternoon)

1. **Performance Metrics**
   - Total positions opened this week
   - Win rate (TP hits vs. SL hits)
   - Average hold time
   - Total P/L (realized + unrealized)

2. **System Health**
   - Review error logs in Cloudflare dashboard
   - Check D1 database size
   - Verify all cron jobs ran successfully (15 runs/week)

3. **Adjustments**
   - Consider tweaking guardrails if too restrictive/loose
   - Review skipped proposals (were they good opportunities?)
   - Adjust default quantity if needed

## Alert Response Procedures

### 🎯 Take Profit Alert (TP +50%)

**Alert:** "🎯 *TP Hit*: SPY (pos_SPY_...) +50.2%"

**Action:**
1. Open position detail: /positions/[id]
2. Check current mid price
3. Decide:
   - **Full Close:** Exit entire position, lock in profit
   - **Partial Close:** Close 3 of 5 contracts, let 2 run
   - **Hold:** Ignore alert if thesis still intact

4. **To close (manual for v1):**
   - Execute close at broker
   - Update SAS database:
   ```bash
   wrangler d1 execute sas_db --command \
     "UPDATE positions SET state='closed' WHERE id='pos_SPY_...'"
   ```
   - Or add note for next version's close endpoint

### 🛑 Stop Loss Alert (SL -50%)

**Alert:** "🛑 *SL Hit*: AAPL (pos_AAPL_...) -51.3%"

**Action:**
1. Review position immediately
2. Check if loss is due to:
   - Overall market move (consider holding if temporary)
   - Ticker-specific news (close immediately)
   - IV collapse (expected; decide based on remaining time)
3. If closing:
   - Execute at broker
   - Update SAS state to 'closed'
   - Document reason in notes

### ⏰ Time Stop Alert (<10 DTE)

**Alert:** "⏰ *Time Stop*: IWM (pos_IWM_...) - 9 DTE remaining"

**Action:**
1. Review position P/L
2. Decide:
   - **Close if losing:** Cut losses before theta decay accelerates
   - **Close if small profit:** Take it and move on
   - **Hold if large profit:** Let it ride to expiration
   - **Roll if still valid:** Close and open new spread at longer DTE (manual)

### ⚠️ Guardrail Violation Alert

**Alert:** "⚠️ SAS Guard: Blocked TSLA - Max open positions reached (5/5)"

**Action:**
1. Review why guardrail triggered
2. Check if intentional (i.e., portfolio full)
3. If error:
   - Verify position count in /positions
   - Check for stale positions (closed at broker but not in SAS)
   - Update database if needed
4. If legitimate:
   - Wait for position close before approving new trades

### ❌ System Error Alert

**Alert:** "❌ Cron error: [error message]"

**Action:**
1. Review error in Cloudflare logs:
   ```bash
   wrangler tail --format pretty
   ```
2. Common issues:
   - D1 timeout → Reduce query batch size
   - Quote fetch failure → Acceptable (skip mark for today)
   - Queue backup → Check queue depth in CF dashboard
3. If critical:
   - Manually trigger cron:
     ```bash
     curl -X POST https://sas-worker.YOUR_SUBDOMAIN.workers.dev/test/cron
     ```
   - Check D1 for missing marks:
     ```bash
     wrangler d1 execute sas_db --command \
       "SELECT position_id, MAX(asof) FROM pnl GROUP BY position_id"
     ```

## Position Management Strategies

### Entry Rules (Already Automated)

- Only approve proposals that pass SAS filters
- Default quantity: 5 contracts
- Adjust quantity based on:
  - High-conviction signals → 7-10 contracts
  - Uncertain conditions → 3 contracts
- Never exceed per-trade risk limit (2.5% of equity)

### Exit Rules

#### Profit-Taking Strategies

**Scenario 1: Quick Winner (+50% in <7 days)**
- Action: Close 50%, hold remaining
- Rationale: Lock in profits, let rest ride

**Scenario 2: Gradual Grind (+30% at 20 DTE)**
- Action: Hold until +50% or 10 DTE
- Rationale: Still has theta benefit

**Scenario 3: Max Profit Approaching**
- Action: Close if >80% of max profit achieved
- Rationale: Diminishing returns vs. risk

#### Loss Management

**Scenario 1: Early Loss (-50% in <7 days)**
- Action: Close immediately
- Rationale: Thesis likely wrong; preserve capital

**Scenario 2: IV Collapse Loss**
- Action: Review expected IV; hold if event-driven
- Rationale: IV may recover

**Scenario 3: Directional Loss**
- Action: Close if underlying breaks key support/resistance
- Rationale: Momentum against position

#### Time-Based Exits

**10 DTE Rule:**
- Close any position <10 DTE regardless of P/L
- Rationale: Theta decay accelerates; risk not worth reward

**21 DTE Roll:**
- For winning positions, consider rolling to next expiration
- Close current spread, open new spread at longer DTE
- Rationale: Extend duration of profitable thesis

### Adjustment Rules (Future Implementation)

**Scenario: Short strike tested, position underwater**
- **Adjustment:** Roll short strike further OTM
- **Note:** Not automated in v1; manual execution

**Scenario: Large unrealized profit, want to protect**
- **Adjustment:** Buy back short leg, let long run
- **Note:** Manual execution

## Risk Management

### Guardrails (Automated)

✓ Max 5 open positions  
✓ Max 20% equity at risk  
✓ Max 2.5% per trade  
✓ 7-day ticker cooldown

### Manual Overrides (Use Sparingly)

**To override cooldown:**
1. Delete KV key:
   ```bash
   wrangler kv:key delete --namespace-id=YOUR_KV_ID "cooldown:SPY"
   ```
2. Approve proposal immediately

**To increase position limit:**
1. Update guardrails table:
   ```bash
   wrangler d1 execute sas_db --command \
     "UPDATE guardrails SET v='7' WHERE k='max_positions'"
   ```
2. Note: Takes effect immediately

**Warning:** Use overrides only in exceptional circumstances. Document reason.

### Position Sizing Guidelines

- **Standard:** 5 contracts ($3,500 at $7 debit)
- **High Conviction:** 7 contracts
- **Reduced Risk:** 3 contracts
- **Never:** >10 contracts on single idea

### Diversification

- Max 2 positions in same sector (tech, finance, etc.)
- Vary expiration dates (avoid clustering)
- Mix bullish/bearish bias based on signals

## Troubleshooting Guide

### Issue: UI Not Loading Proposals

**Symptoms:** /proposals page empty but Slack alerts received

**Diagnosis:**
```bash
curl https://sas-worker.YOUR_SUBDOMAIN.workers.dev/review
```

**Fix:**
- If API returns data → Browser cache issue; hard refresh
- If API returns `[]` → Check proposal status in D1:
  ```bash
  wrangler d1 execute sas_db --command "SELECT status, COUNT(*) FROM proposals GROUP BY status"
  ```

### Issue: Approval Button Not Working

**Symptoms:** Click "Approve" → no response

**Diagnosis:**
- Open browser console (F12)
- Check for CORS errors or 403 responses

**Fix:**
- 403 → Likely guardrail block; check Slack for warning
- CORS → Verify worker CORS settings
- Network error → Check worker is deployed and responding

### Issue: Position Not Showing in UI

**Symptoms:** Approved proposal but position not visible

**Diagnosis:**
```bash
wrangler d1 execute sas_db --command "SELECT * FROM positions WHERE proposal_id='prop_...'"
```

**Fix:**
- If no row → Approval didn't complete; check worker logs
- If row exists → UI cache issue; refresh page

### Issue: Cron Not Running

**Symptoms:** No P/L marks in >24 hours

**Diagnosis:**
```bash
wrangler deployments list
```

**Fix:**
- Check cron schedule in wrangler.toml
- Verify time zone (cron uses UTC)
- Manually trigger:
  ```bash
  # Requires adding test endpoint
  curl -X POST https://sas-worker.YOUR_SUBDOMAIN.workers.dev/test/cron
  ```

### Issue: Slack Alerts Stopped

**Symptoms:** No alerts in 24+ hours

**Diagnosis:**
```bash
wrangler secret list
```

**Fix:**
- Verify `SLACK_WEBHOOK_URL` secret exists
- Test webhook:
  ```bash
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H "Content-Type: application/json" \
    -d '{"text":"Test from SAS"}'
  ```
- If invalid → Regenerate webhook in Slack settings
- Update secret:
  ```bash
  wrangler secret put SLACK_WEBHOOK_URL
  ```

## Maintenance Schedule

### Daily
- Review dashboard
- Respond to alerts
- Approve/skip proposals

### Weekly
- Review performance metrics
- Check system logs
- Clean up old closed positions (optional)

### Monthly
- Export positions/P&L for analysis:
  ```bash
  wrangler d1 execute sas_db --command "SELECT * FROM positions" --json > positions_backup.json
  wrangler d1 execute sas_db --command "SELECT * FROM pnl" --json > pnl_backup.json
  ```
- Review guardrail effectiveness
- Adjust strategy parameters if needed

### Quarterly
- Full system backup
- Review SAS filter performance (hit rate)
- Consider strategy enhancements

## Emergency Procedures

### Scenario: Need to Pause All Activity

**Action:**
1. Update proposal auto-approvals (future feature) to disabled
2. Skip all pending proposals
3. Post notice in Slack: "#sas-paused"

### Scenario: Database Corruption

**Action:**
1. Stop worker:
   ```bash
   wrangler delete sas-worker
   ```
2. Restore from backup (see DEPLOYMENT.md)
3. Redeploy worker
4. Reconcile positions with broker

### Scenario: Major System Upgrade

**Action:**
1. Deploy to staging first
2. Test full workflow
3. Deploy to production during market close
4. Monitor first cron run carefully

## Success Metrics to Track

### Weekly
- Proposals generated
- Approval rate (approved / total)
- Open positions
- Equity at risk %

### Monthly
- Total P/L (realized + unrealized)
- Win rate (TP hits / (TP hits + SL hits))
- Average hold time
- Average R/R achieved vs. target

### Quarterly
- System uptime %
- Alert response time
- Strategy Sharpe ratio
- Max drawdown

## Contact & Support

- **System Issues:** Check Cloudflare status page
- **Strategy Questions:** Review TESTING.md scenarios
- **Feature Requests:** Document in GitHub issues (if using)

---

**Remember:** SAS is a decision-support tool. Final trade decisions are always yours. Review each proposal critically and maintain discipline on risk management.

