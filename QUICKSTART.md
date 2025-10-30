# SAS Quick Start Guide

Get up and running in 15 minutes.

## Prerequisites

- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- Cloudflare account (free tier works)
- Wrangler CLI (`npm install -g wrangler`)

## Step 1: Install Dependencies (2 min)

```bash
cd sas
corepack enable
pnpm install
```

## Step 2: Setup Cloudflare Resources (5 min)

```bash
# Login
wrangler login

# Create D1 database
wrangler d1 create sas_db
# Copy the database_id

# Create KV namespace
wrangler kv:namespace create KV
# Copy the id
```

Edit `apps/worker/wrangler.toml` and replace:
- `database_id = "YOUR_D1_ID"`
- `id = "YOUR_KV_ID"`

## Step 3: Initialize Database (1 min)

```bash
cd apps/worker
wrangler d1 execute sas_db --local --file=migrations/001_init.sql
```

## Step 4: Configure Secrets (2 min)

Create `.dev.vars` file in `apps/worker/`:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your keys:
```
XYNTH_API_KEY=your_key_here
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## Step 5: Start Development Servers (1 min)

**Terminal 1 - Worker:**
```bash
pnpm dev:worker
```

**Terminal 2 - Web UI:**
```bash
pnpm dev:web
```

## Step 6: Test the System (4 min)

### Send a Test Signal

```bash
curl -X POST http://localhost:8787/ingest/xynth \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "SPY",
    "asof": "2025-10-29T14:45:00Z",
    "iv30": 0.30,
    "rv20": 0.18,
    "skew_z": -2.5,
    "momentum": 0.65
  }'
```

**Expected:** `{"ok":true,"id":"SPY_...","status":"queued"}`

### Check Slack

You should see: "📊 *SAS Proposal: SPY* (bullish)"

### Open Web UI

Navigate to http://localhost:5173/proposals

You should see the SPY proposal card.

### Approve Proposal

1. Click "Approve" (default qty: 5)
2. Confirm success message
3. Navigate to http://localhost:5173/positions
4. See new position

## Next Steps

- Read [README.md](./README.md) for full documentation
- Read [PLAYBOOK.md](./PLAYBOOK.md) for daily operations
- See [TESTING.md](./TESTING.md) for comprehensive test scenarios
- See [DEPLOYMENT.md](./DEPLOYMENT.md) when ready to deploy to production

## Common Issues

### "database not found"
→ Run migrations: `wrangler d1 execute sas_db --local --file=migrations/001_init.sql`

### "queue not found"
→ Queues are created automatically; if error persists, check `wrangler.toml`

### "CORS error in browser"
→ Ensure worker is running on port 8787 and vite proxy is configured

### "No proposals generated"
→ Check signal met filters (skew_z ≤ -2, iv_rv_spread ≥ 0.25)

## Quick Commands Reference

```bash
# Dev
pnpm dev:worker          # Start worker locally
pnpm dev:web             # Start web UI locally

# Database
wrangler d1 execute sas_db --local --command "SELECT * FROM proposals"
wrangler d1 execute sas_db --command "SELECT * FROM positions"

# Deploy
cd apps/worker && wrangler deploy
cd apps/web && pnpm build && wrangler pages deploy dist

# Logs
wrangler tail            # Stream worker logs
```

## Test Data

Generate 10 test signals:
```bash
for i in {1..10}; do
  curl -X POST http://localhost:8787/ingest/xynth \
    -H "Content-Type: application/json" \
    -d "{\"symbol\":\"TEST$i\",\"asof\":\"2025-10-29T14:$i:00Z\",\"iv30\":0.3,\"rv20\":0.18,\"skew_z\":-2.5,\"momentum\":0.6}"
  sleep 1
done
```

---

**You're ready!** Start ingesting real signals from Xynth and let SAS find opportunities.

