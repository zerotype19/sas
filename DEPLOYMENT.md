# Deployment Guide

Complete step-by-step deployment instructions for SAS.

## Pre-Deployment Checklist

- [ ] Cloudflare account created
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Logged in to Cloudflare (`wrangler login`)
- [ ] Xynth API key obtained
- [ ] Slack webhook URL configured
- [ ] Account equity amount decided

## Step 1: Create Cloudflare Resources

### 1.1 Create D1 Database

```bash
cd apps/worker
wrangler d1 create sas_db
```

**Output:**
```
✅ Successfully created DB 'sas_db'

[[d1_databases]]
binding = "DB"
database_name = "sas_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` and update `apps/worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sas_db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 1.2 Create KV Namespace

```bash
wrangler kv:namespace create KV
```

**Output:**
```
✅ Successfully created KV namespace 'KV'

[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Update `apps/worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_ID_HERE"
```

### 1.3 Queue Setup

Queue `sas-ingest` will be automatically created on first worker deployment. Verify in `wrangler.toml`:

```toml
[[queues.producers]]
binding = "INGEST_QUEUE"
queue = "sas-ingest"

[[queues.consumers]]
queue = "sas-ingest"
max_batch_size = 25
max_retries = 3
```

## Step 2: Run Database Migrations

### 2.1 Local Migration (for testing)

```bash
wrangler d1 execute sas_db --local --file=migrations/001_init.sql
```

### 2.2 Production Migration

```bash
wrangler d1 execute sas_db --file=migrations/001_init.sql
```

### 2.3 Verify Tables

```bash
wrangler d1 execute sas_db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Expected output:
```
signals
proposals
positions
pnl
guardrails
```

## Step 3: Configure Secrets

### 3.1 Set Xynth API Key

```bash
wrangler secret put XYNTH_API_KEY
# Paste your API key when prompted
```

### 3.2 Set Slack Webhook URL

```bash
wrangler secret put SLACK_WEBHOOK_URL
# Paste your Slack incoming webhook URL
```

**How to create Slack webhook:**
1. Go to https://api.slack.com/apps
2. Create new app → From scratch
3. Select "Incoming Webhooks" → Activate
4. "Add New Webhook to Workspace"
5. Copy webhook URL

### 3.3 (Optional) Set SendGrid API Key

```bash
wrangler secret put SENDGRID_API_KEY
```

### 3.4 Verify Secrets

```bash
wrangler secret list
```

## Step 4: Configure Environment Variables

Edit `apps/worker/wrangler.toml`:

```toml
[vars]
APP_ENV = "production"
ALERT_CHANNEL = "slack"
RISK_MAX_POSITIONS = "5"
RISK_MAX_EQUITY_AT_RISK_PCT = "20"
RISK_PER_TRADE_PCT = "2.5"
XYNTH_API_BASE = "https://api.xynth.ai"
ACCOUNT_EQUITY = "100000"  # Your actual account size
```

## Step 5: Deploy Worker

```bash
cd apps/worker
wrangler deploy
```

**Output:**
```
✅ Successfully deployed worker
URL: https://sas-worker.YOUR_SUBDOMAIN.workers.dev
```

### 5.1 Test Deployment

```bash
curl https://sas-worker.YOUR_SUBDOMAIN.workers.dev
```

Expected:
```json
{"service":"SAS Worker","version":"1.0.0","env":"production"}
```

### 5.2 Test Signal Ingestion

```bash
curl -X POST https://sas-worker.YOUR_SUBDOMAIN.workers.dev/ingest/xynth \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "SPY",
    "asof": "2025-10-29T14:45:00Z",
    "iv30": 0.28,
    "rv20": 0.18,
    "skew_z": -2.5,
    "momentum": 0.62
  }'
```

Check Slack for alert!

## Step 6: Deploy Web UI

### Option A: Cloudflare Pages (via CLI)

```bash
cd apps/web

# Build production assets
pnpm build

# Deploy to Pages
wrangler pages deploy dist --project-name=sas-web
```

**Output:**
```
✅ Successfully deployed to Cloudflare Pages
URL: https://sas-web.pages.dev
```

### Option B: Cloudflare Pages (via GitHub)

1. Push code to GitHub
2. Go to Cloudflare dashboard → Pages → Create a project
3. Connect to your GitHub repo
4. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `cd apps/web && pnpm build`
   - **Build output directory**: `apps/web/dist`
5. Environment variables:
   - `VITE_API_URL`: `https://sas-worker.YOUR_SUBDOMAIN.workers.dev`

### 6.1 Update API Proxy

If your web UI needs to call the worker from a different domain, update `apps/web/vite.config.ts` for production:

```typescript
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || 'http://127.0.0.1:8787'
    )
  }
});
```

And update fetch calls in components to use `import.meta.env.VITE_API_URL`.

## Step 7: Configure Xynth Webhook

In your Xynth dashboard:
1. Go to Webhooks settings
2. Add webhook URL: `https://sas-worker.YOUR_SUBDOMAIN.workers.dev/ingest/xynth`
3. Set event type: Signal updates
4. Save

## Step 8: Verify Cron Schedule

Check that cron triggers are configured:

```bash
wrangler deployments list
```

Cron should show 3 triggers per weekday. To test manually:

```bash
# Trigger cron handler directly (requires custom route)
curl -X POST https://sas-worker.YOUR_SUBDOMAIN.workers.dev/cron/mark
```

## Step 9: Monitor Deployment

### 9.1 View Logs

```bash
wrangler tail
```

### 9.2 Check D1 Data

```bash
wrangler d1 execute sas_db --command "SELECT COUNT(*) FROM signals"
wrangler d1 execute sas_db --command "SELECT * FROM proposals LIMIT 5"
```

### 9.3 Cloudflare Dashboard

- Workers: https://dash.cloudflare.com → Workers & Pages
- D1: https://dash.cloudflare.com → Storage → D1
- KV: https://dash.cloudflare.com → Storage → KV
- Queues: https://dash.cloudflare.com → Queues

## Step 10: Production Readiness

### 10.1 Custom Domain (Optional)

**For Worker:**
1. Cloudflare dashboard → Workers & Pages → sas-worker → Settings → Domains
2. Add custom domain: `api.yourdomain.com`

**For Pages:**
1. Cloudflare dashboard → Pages → sas-web → Custom domains
2. Add: `sas.yourdomain.com`

### 10.2 Rate Limiting

Add rate limiting in worker:

```typescript
// In worker.ts
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis: /* KV adapter */,
  limiter: Ratelimit.slidingWindow(100, "1 h")
});
```

### 10.3 Error Monitoring

Consider adding Sentry or similar:

```bash
pnpm add @sentry/cloudflare
```

### 10.4 Backup Strategy

Set up periodic D1 backups (manual for now):

```bash
# Backup all tables
wrangler d1 execute sas_db --command "SELECT * FROM signals" --json > backup_signals.json
wrangler d1 execute sas_db --command "SELECT * FROM proposals" --json > backup_proposals.json
wrangler d1 execute sas_db --command "SELECT * FROM positions" --json > backup_positions.json
wrangler d1 execute sas_db --command "SELECT * FROM pnl" --json > backup_pnl.json
```

## Rollback Procedure

### Rollback Worker

```bash
wrangler rollback [VERSION_ID]
```

List versions:
```bash
wrangler deployments list
```

### Rollback Migration

Restore from backup:
```bash
wrangler d1 execute sas_db --file=backup_restore.sql
```

## Environment-Specific Deployments

### Development Environment

```bash
# Use separate resources for dev
wrangler d1 create sas_db_dev
wrangler kv:namespace create KV_DEV

# Update wrangler.toml with [env.dev] section
wrangler deploy --env dev
```

### Staging Environment

```bash
wrangler deploy --env staging
```

## Post-Deployment Testing

1. **Smoke Test**: Ingest test signal → verify proposal created
2. **Approval Test**: Approve proposal → verify position created
3. **Guardrail Test**: Try to exceed position limits → verify blocked
4. **Cron Test**: Wait for next cron run → verify marks written
5. **UI Test**: Navigate all pages → verify data loads

## Troubleshooting

### Issue: Queue not processing messages

**Solution:**
```bash
wrangler queues list
wrangler queues consumer add sas-ingest --script-name sas-worker
```

### Issue: CORS errors in web UI

**Solution:** Ensure worker has CORS enabled (already in `worker.ts`):
```typescript
app.use('/*', cors());
```

### Issue: Database locked

**Solution:** D1 uses SQLite; avoid concurrent writes. Queue writes instead.

### Issue: Secrets not loading

**Solution:**
```bash
wrangler secret list
# If missing, re-add:
wrangler secret put SECRET_NAME
```

## Cost Estimates

Based on Cloudflare pricing (as of 2025):

- **Workers**: Free tier (100k req/day), then $5/10M requests
- **D1**: Free tier (5GB storage, 5M reads/day), then $0.75/GB
- **KV**: Free tier (100k reads/day), then $0.50/GB
- **Queues**: Free tier (1M operations/month), then $0.40/1M
- **Pages**: Free tier (500 builds/month), unlimited bandwidth

**Estimated monthly cost for 1000 signals/day:** ~$0 (within free tier)

## Next Steps

- Monitor for 1 week
- Review proposal quality
- Adjust guardrails as needed
- Enable auto-approval (if desired)
- Integrate broker execution

---

**Deployment complete!** 🎉

Your SAS system is now live at:
- **API**: https://sas-worker.YOUR_SUBDOMAIN.workers.dev
- **Web UI**: https://sas-web.pages.dev

