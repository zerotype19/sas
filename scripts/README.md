# SAS Helper Scripts

Quick monitoring and debugging tools for the SAS multi-strategy system.

## 📋 Scripts Overview

### 1. `monitor-strategies.sh` - Real-time Strategy Monitor
**Purpose:** Check strategy engine health and view current proposals.

```bash
./scripts/monitor-strategies.sh
```

**Output:**
- Worker health status
- Strategy breakdown by phase
- Top 10 proposals by score
- Current timestamp

**When to Use:**
- After market open to see if strategies are generating proposals
- To verify all phases are working (1, 2, 3)
- Quick sanity check during trading hours

---

### 2. `check-data.sh` - Data Health Check
**Purpose:** Verify D1 tables have recent data.

```bash
./scripts/check-data.sh
```

**Output:**
- Option quotes count (last 10 min)
- IV history count (last 24h)
- Market data count (last hour)
- Proposals count (last 24h)
- Strategy distribution

**When to Use:**
- Troubleshooting "no proposals" issues
- Verifying ingestion is working
- Checking data freshness

---

### 3. `view-proposals.sh` - Proposal Viewer
**Purpose:** Display recent proposals in readable format.

```bash
./scripts/view-proposals.sh      # Default: 10 most recent
./scripts/view-proposals.sh 20   # Show 20 most recent
```

**Output:**
- Tabular view of recent proposals
- Detailed view of latest proposal (with legs)
- Score, R/R, POP, status for each

**When to Use:**
- Reviewing what the system is proposing
- Checking proposal quality
- Debugging specific strategies

---

## 🚀 Quick Start

### First Time Setup
```bash
cd /Users/kevinmcgovern/sas
chmod +x scripts/*.sh
```

### Morning Routine (Market Open)
```bash
# 1. Check health & data
./scripts/check-data.sh

# 2. View strategy output
./scripts/monitor-strategies.sh

# 3. Review proposals
./scripts/view-proposals.sh
```

### During Trading Hours
```bash
# Quick check every hour
watch -n 3600 ./scripts/monitor-strategies.sh

# Or manually when needed
./scripts/monitor-strategies.sh
```

---

## 🔧 Customization

### Change Worker URL
Edit each script and update:
```bash
WORKER_URL="https://your-worker-domain.workers.dev"
```

### Change Database Name
Edit `check-data.sh` and `view-proposals.sh`:
```bash
DB_NAME="your-d1-database-name"
```

### Adjust Timeframes
In each script, modify the SQL queries:
```sql
-- 10 minutes → 30 minutes
WHERE timestamp > strftime('%s','now')*1000 - 1800000;

-- 24 hours → 7 days
WHERE created_at > strftime('%s','now')*1000 - 604800000;
```

---

## 📊 Example Output

### monitor-strategies.sh
```
╔══════════════════════════════════════════════════════════════╗
║           SAS Multi-Strategy Monitor                         ║
╚══════════════════════════════════════════════════════════════╝

🏥 Health Check...
✅ Worker: ONLINE

🎯 Running Strategy Analysis...
Symbols Analyzed: 10
Candidates Found: 15

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Strategy Breakdown:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1 (Existing):
  ✓ BULL_PUT_CREDIT • SPY • Score: 73 • Legs: 2
  ✓ LONG_CALL • AAPL • Score: 65 • Legs: 1

Phase 2 (Bearish):
  ✓ BEAR_CALL_CREDIT • META • Score: 68 • Legs: 2
  ✓ LONG_PUT • TSLA • Score: 62 • Legs: 1

Phase 3 (Advanced):
  ✓ IRON_CONDOR • NVDA • Score: 71 • Legs: 4
  ✓ CALENDAR_CALL • QQQ • Score: 66 • Legs: 2
```

### check-data.sh
```
╔══════════════════════════════════════════════════════════════╗
║           SAS Data Health Check                              ║
╚══════════════════════════════════════════════════════════════╝

📊 Option Quotes (last 10 min):
   1247

📈 IV History (last 24h):
   480

💹 Market Data (last hour):
   60

📋 Proposals (last 24h):
   42

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Recent Proposals by Strategy:
BULL_PUT_CREDIT | 12 | 71.5
LONG_CALL | 10 | 64.2
BEAR_CALL_CREDIT | 8 | 67.8
LONG_PUT | 6 | 61.3
IRON_CONDOR | 4 | 72.0
CALENDAR_CALL | 2 | 65.5
```

---

## 🐛 Troubleshooting

### Script Won't Run
```bash
# Make sure it's executable
chmod +x scripts/monitor-strategies.sh

# Check if wrangler is installed
which wrangler

# Check if jq is installed
which jq
brew install jq  # If not installed
```

### "Command not found: wrangler"
```bash
# Install wrangler globally
npm install -g wrangler

# Or use pnpm
pnpm add -g wrangler
```

### D1 Commands Timeout
```bash
# Increase timeout (if needed)
wrangler d1 execute sas-proposals --remote --env production \
  --timeout 30000 \
  --command "SELECT ..."
```

---

## 📝 Adding New Scripts

Template for new monitoring script:
```bash
#!/bin/bash
# Description of what this script does

WORKER_URL="https://sas-worker-production.kevin-mcgovern.workers.dev"
DB_NAME="sas-proposals"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Your Script Title                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Your logic here

echo ""
echo "🕐 $(date '+%Y-%m-%d %H:%M:%S ET')"
```

Make executable:
```bash
chmod +x scripts/your-new-script.sh
```

---

**Need help?** Check the main documentation:
- `GO_LIVE_RUNBOOK.md` - Full go-live guide
- `DEPLOYMENT_SUMMARY.md` - Deployment details
- `STRATEGY_EXPANSION_STATUS.md` - Strategy documentation

