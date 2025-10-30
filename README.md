# SAS (Skew Advantage System)

> Automated options trading system built on Cloudflare Workers + D1 + KV + Queues + Pages (React + Tailwind)

## Overview

SAS is a comprehensive system that:
- **Ingests** volatility signals from Xynth
- **Analyzes** signals using proprietary SAS filters (skew Z-score, IV-RV spread, momentum)
- **Generates** options spread proposals (vertical spreads)
- **Alerts** via Slack/Email with one-click review links
- **Enforces** risk guardrails (position limits, equity caps, per-ticker cooldown)
- **Journals** complete lifecycle: signal → proposal → position → P/L marks

## Architecture

```
[Xynth Signal] → POST /ingest/xynth → [D1: signals] → [Queue]
                                              ↓
                                      [SAS Rules Engine]
                                              ↓
                                    [D1: proposals] → Slack Alert
                                              ↓
                         [Review UI] → Approve → [D1: positions]
                                              ↓
                               Cron (EOD) → [D1: pnl marks]
```

## Project Structure

```
sas/
├── apps/
│   ├── worker/          # Cloudflare Worker (API + Queue + Cron)
│   │   ├── src/
│   │   │   ├── worker.ts      # Main HTTP handler
│   │   │   ├── queue.ts       # Queue consumer
│   │   │   ├── cron.ts        # Scheduled tasks
│   │   │   ├── sas.ts         # SAS rules engine
│   │   │   ├── risk.ts        # Guardrails
│   │   │   └── alerts/        # Slack/Email
│   │   ├── migrations/        # D1 SQL migrations
│   │   └── wrangler.toml      # CF config
│   └── web/             # React + Tailwind UI
│       ├── src/
│       │   ├── pages/         # Dashboard, Proposals, Positions
│       │   └── components/    # ProposalCard, RiskBar
│       └── vite.config.ts
└── packages/
    └── shared/          # TypeScript types
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Setup

1. **Clone and install dependencies:**

```bash
cd sas
corepack enable
pnpm install
```

2. **Create Cloudflare resources:**

```bash
# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create sas_db
# Copy the database_id and update apps/worker/wrangler.toml

# Create KV namespace
wrangler kv:namespace create KV
# Copy the id and update apps/worker/wrangler.toml

# Create Queue (automatically created on first deploy)
```

3. **Update `apps/worker/wrangler.toml`:**

Replace placeholders:
- `database_id = "YOUR_D1_ID"`
- `id = "YOUR_KV_ID"`

4. **Run migrations:**

```bash
cd apps/worker
wrangler d1 execute sas_db --local --file=migrations/001_init.sql
wrangler d1 execute sas_db --file=migrations/001_init.sql
```

5. **Set secrets:**

```bash
cd apps/worker
wrangler secret put XYNTH_API_KEY
wrangler secret put SLACK_WEBHOOK_URL
# Optional: wrangler secret put SENDGRID_API_KEY
```

### Local Development

**Terminal 1 - Worker:**
```bash
pnpm dev:worker
# Worker runs on http://localhost:8787
```

**Terminal 2 - Web UI:**
```bash
pnpm dev:web
# UI runs on http://localhost:5173
```

### Test the System

1. **Ingest a test signal:**

```bash
curl -X POST http://localhost:8787/ingest/xynth \
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

2. **Check proposals:**

Visit http://localhost:5173/proposals or:

```bash
curl http://localhost:8787/review
```

3. **Approve a proposal:**

Use the web UI or:

```bash
curl -X POST http://localhost:8787/act/approve \
  -H "Content-Type: application/json" \
  -d '{"proposal_id": "prop_SPY_...", "qty": 5}'
```

4. **View positions:**

Visit http://localhost:5173/positions or:

```bash
curl http://localhost:8787/positions
```

## Deployment

### Deploy Worker

```bash
cd apps/worker
wrangler deploy
```

### Deploy Web UI

```bash
cd apps/web
pnpm build

# Deploy to Cloudflare Pages
wrangler pages deploy dist --project-name=sas-web
```

Or connect your GitHub repo to Cloudflare Pages for automatic deployments.

### Configure Production Secrets

```bash
cd apps/worker
wrangler secret put XYNTH_API_KEY --env production
wrangler secret put SLACK_WEBHOOK_URL --env production
```

## API Reference

### `POST /ingest/xynth`

Ingest a signal from Xynth.

**Request:**
```json
{
  "symbol": "SPY",
  "asof": "2025-10-29T14:45:00Z",
  "iv30": 0.28,
  "rv20": 0.18,
  "skew_z": -2.5,
  "momentum": 0.62
}
```

**Response:**
```json
{
  "ok": true,
  "id": "SPY_2025-10-29T14_45_00Z",
  "status": "queued"
}
```

### `GET /review`

List pending proposals.

**Response:**
```json
[
  {
    "id": "prop_SPY_...",
    "symbol": "SPY",
    "bias": "bullish",
    "dte": 45,
    "debit": 7.0,
    "rr": 1.86,
    "filters": {...},
    "status": "pending"
  }
]
```

### `POST /act/approve`

Approve a proposal and open a position.

**Request:**
```json
{
  "proposal_id": "prop_SPY_...",
  "qty": 5
}
```

**Response:**
```json
{
  "ok": true,
  "position_id": "pos_SPY_...",
  "symbol": "SPY",
  "qty": 5
}
```

### `GET /positions`

List positions (query param: `?state=open` or `?state=closed`)

### `GET /positions/:id`

Get position details with P/L history.

## SAS Rules

### Filters (Signal → Proposal)

A signal becomes a proposal if:
1. **Skew Z-score ≤ -2** (negative skew favors call spreads)
2. **IV-RV spread ≥ 0.25** (25%+ premium over realized vol)
3. **Momentum defines bias** (positive = bullish, negative = bearish)

### Guardrails (Proposal → Position)

A proposal is approved only if:
1. **Open positions < 5** (configurable)
2. **Equity at risk ≤ 20%** of account (sum of all debit * qty * 100)
3. **Per-trade risk ≤ 2.5%** of account
4. **Per-ticker cooldown** (no same ticker within 7 days)

### Position Rules

Each position has:
- **TP +50%**: Take profit alert at 50% gain
- **SL -50%**: Stop loss alert at 50% loss
- **Time Stop**: Alert when DTE ≤ 10 days

## Cron Schedule

The worker runs 3x/day during market hours (ET):
- 9:45 AM ET (13:45 UTC)
- 12:45 PM ET (16:45 UTC)
- 3:45 PM ET (19:45 UTC)

Each run:
1. Marks all open positions (fetches mid prices)
2. Calculates unrealized P/L
3. Checks if TP/SL/TimeStop triggered
4. Sends alerts via Slack

## Configuration

Edit `apps/worker/wrangler.toml`:

```toml
[vars]
RISK_MAX_POSITIONS = "5"
RISK_MAX_EQUITY_AT_RISK_PCT = "20"
RISK_PER_TRADE_PCT = "2.5"
ACCOUNT_EQUITY = "100000"
```

## Testing

### Unit Tests (TODO)

```bash
cd apps/worker
pnpm test
```

### Integration Test

See `TESTING.md` for full QA scenarios.

## Monitoring

- **Slack alerts** for new proposals, approvals, rule triggers
- **Cloudflare dashboard** for Worker logs and metrics
- **D1 dashboard** for database queries

## Troubleshooting

### Queue not processing

Check queue binding in `wrangler.toml` and ensure queue exists:
```bash
wrangler queues list
```

### Migrations not applied

```bash
wrangler d1 execute sas_db --command "SELECT * FROM guardrails"
```

### Secrets not set

```bash
wrangler secret list
```

## Roadmap

- [ ] Broker integration (Tasty/IBKR)
- [ ] Strike optimizer using real option chains
- [ ] VIX regime model
- [ ] Backtest harness
- [ ] Email alerts via SendGrid
- [ ] Position close/roll interface

## License

Proprietary - All rights reserved

## Support

For questions or issues, contact: you@yourdomain.com

