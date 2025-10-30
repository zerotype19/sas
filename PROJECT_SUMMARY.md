# SAS Project Summary

## 🎯 Mission

Automate the discovery, evaluation, and execution of options spread trades based on volatility skew and momentum signals.

## 📊 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         XYNTH API                               │
│              (Signal Source - IV, RV, Skew, Momentum)           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CLOUDFLARE WORKER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  POST /ingest/xynth  →  [D1: signals]  →  [Queue]       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           SAS RULES ENGINE                               │   │
│  │  • Skew Z ≤ -2                                           │   │
│  │  • IV-RV Spread ≥ 25%                                    │   │
│  │  • Momentum → Bias                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         [D1: proposals]  →  SLACK ALERT                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REACT WEB UI                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Dashboard  |  Proposals  |  Positions                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  APPROVE (with guardrails)  →  [D1: positions]          │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CRON (3x/day)                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Mark-to-Market  →  [D1: pnl]  →  TP/SL/Time Alerts    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗️ Architecture Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Worker** | Cloudflare Workers + Hono | HTTP API, Queue consumer, Cron handler |
| **Database** | Cloudflare D1 (SQLite) | Signals, Proposals, Positions, P/L marks |
| **Cache** | Cloudflare KV | Deduplication, Cooldowns |
| **Queue** | Cloudflare Queues | Async signal processing |
| **Web UI** | React + Tailwind + Vite | Dashboard, Proposal review, Position tracking |
| **Alerts** | Slack Webhooks | Real-time notifications |
| **Hosting** | Cloudflare Pages | Static web hosting with CDN |

## 📁 Project Structure

```
sas/
├── apps/
│   ├── worker/                    # Cloudflare Worker
│   │   ├── src/
│   │   │   ├── worker.ts          # Main HTTP routes
│   │   │   ├── queue.ts           # Queue consumer (signal → proposal)
│   │   │   ├── cron.ts            # Scheduled mark-to-market
│   │   │   ├── sas.ts             # SAS rules engine
│   │   │   ├── risk.ts            # Guardrails enforcement
│   │   │   ├── alerts/
│   │   │   │   ├── slack.ts       # Slack integration
│   │   │   │   └── email.ts       # Email (future)
│   │   │   ├── env.d.ts           # TypeScript bindings
│   │   │   └── index.ts           # Export all handlers
│   │   ├── migrations/
│   │   │   └── 001_init.sql       # D1 schema
│   │   ├── wrangler.toml          # Cloudflare config
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                       # React Web UI
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx  # Overview & metrics
│       │   │   ├── Proposals.tsx  # Pending opportunities
│       │   │   ├── Positions.tsx  # Position list
│       │   │   └── PositionDetail.tsx  # P/L history
│       │   ├── components/
│       │   │   ├── ProposalCard.tsx    # Proposal display
│       │   │   └── RiskBar.tsx         # Equity at risk gauge
│       │   ├── main.tsx           # App entry
│       │   └── index.css          # Tailwind imports
│       ├── index.html
│       ├── vite.config.ts         # Dev proxy config
│       ├── tailwind.config.js
│       └── package.json
│
├── packages/
│   └── shared/                    # Shared TypeScript types
│       ├── src/
│       │   ├── types.ts           # Domain types
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── README.md                      # Main documentation
├── QUICKSTART.md                  # 15-min setup guide
├── DEPLOYMENT.md                  # Production deployment steps
├── TESTING.md                     # QA scenarios & test plan
├── PLAYBOOK.md                    # Daily operations manual
├── package.json                   # Root workspace config
├── tsconfig.base.json             # Shared TypeScript config
└── .gitignore
```

## 🔄 Data Flow

### 1. Signal Ingestion
```
Xynth → POST /ingest/xynth → Validate → Dedupe (KV) → D1 signals → Queue
```

### 2. Proposal Generation
```
Queue → Fetch signal → Apply filters → Build proposal → D1 proposals → Slack alert
```

### 3. Approval Flow
```
Slack → Web UI → Review → Approve → Check guardrails → D1 positions → Success alert
```

### 4. Daily Marking
```
Cron 3x/day → Fetch open positions → Get mid prices → Calculate P/L → D1 pnl → Alerts if TP/SL/Time
```

## 🛡️ Guardrails (Risk Management)

| Guardrail | Default | Enforced At | Configurable |
|-----------|---------|-------------|--------------|
| Max Open Positions | 5 | Approval | ✓ (D1 guardrails table) |
| Max Equity at Risk % | 20% | Approval | ✓ |
| Per-Trade Risk % | 2.5% | Approval | ✓ |
| Per-Ticker Cooldown | 7 days | Approval | ✓ (KV TTL) |
| Min Liquidity Rank | 1 | Queue processing | ✓ |

## 📊 Database Schema

### signals
- id (PK), asof, symbol, skew_z, iv30, rv20, iv_rv_spread, momentum, term_slope, regime, source (JSON)

### proposals
- id (PK), created_at, symbol, bias, dte, long_leg (JSON), short_leg (JSON), width, debit, max_profit, rr, filters (JSON), status, strategy_version

### positions
- id (PK), opened_at, proposal_id (FK), symbol, bias, qty, entry_debit, dte, rules (JSON), state

### pnl
- id (PK), position_id (FK), asof, mid_price, unrealized, notes

### guardrails
- k (PK), v

## 🎨 UI Pages

### Dashboard (`/`)
- Open positions count
- Capital at risk gauge
- Recent positions preview
- Quick links to proposals

### Proposals (`/proposals`)
- Pending proposal cards
- Filters: skew_z, iv_rv_spread, momentum
- Approve/Skip actions
- Quantity selector

### Positions (`/positions`)
- Table view with filters (open/closed)
- Columns: Symbol, Bias, Qty, Entry, DTE, Opened, Actions
- Click row → Position detail

### Position Detail (`/positions/:id`)
- Position metadata
- Current mark & unrealized P/L
- P/L history table
- Rule settings (TP/SL/TimeStop)

## 🔔 Alert Types

| Alert | Trigger | Action Required |
|-------|---------|-----------------|
| 📊 New Proposal | SAS filters pass | Review & Approve/Skip |
| ✅ Approval Success | Position opened | None (info only) |
| ⚠️ Guardrail Block | Limit exceeded | Review portfolio |
| 🎯 Take Profit | +50% gain | Consider closing |
| 🛑 Stop Loss | -50% loss | Close position |
| ⏰ Time Stop | <10 DTE | Close or roll |
| ❌ System Error | Cron/Queue failure | Investigate logs |

## 🚀 Deployment Checklist

- [ ] Create Cloudflare D1 database
- [ ] Create Cloudflare KV namespace
- [ ] Update `wrangler.toml` with IDs
- [ ] Run migrations (local & prod)
- [ ] Set secrets (XYNTH_API_KEY, SLACK_WEBHOOK_URL)
- [ ] Deploy worker (`wrangler deploy`)
- [ ] Deploy web UI (`wrangler pages deploy dist`)
- [ ] Configure Xynth webhook
- [ ] Test signal ingestion
- [ ] Verify cron schedule
- [ ] Monitor first 24 hours

## 📈 Success Metrics

### System Health
- Uptime % (target: >99.5%)
- Signal processing latency (target: <1s)
- Queue backlog (target: 0)
- Cron success rate (target: 100%)

### Strategy Performance
- Proposals per day (expected: 0-5)
- Approval rate (target: 30-50%)
- Win rate (TP hits / (TP + SL)) (target: >60%)
- Average R/R achieved (target: >1.5)
- Max drawdown (limit: <15%)

## 🛠️ Tech Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Cloudflare Workers | Latest |
| Framework | Hono | ^4.0.0 |
| Database | D1 (SQLite) | N/A |
| Cache | KV | N/A |
| Queue | Cloudflare Queues | N/A |
| Frontend | React | ^18.2.0 |
| Styling | Tailwind CSS | ^3.4.0 |
| Build | Vite | ^5.1.0 |
| Language | TypeScript | ^5.3.0 |
| Package Manager | pnpm | ^9.0.0 |
| Validation | Zod | ^3.22.0 |
| Router (FE) | React Router | ^6.22.0 |

## 💰 Cost Estimate (Monthly)

Based on moderate usage (500 signals/day, 50 positions/month):

| Service | Usage | Cost |
|---------|-------|------|
| Workers | ~500k requests/month | Free tier |
| D1 | ~1GB storage, 5M reads | Free tier |
| KV | ~100k reads/day | Free tier |
| Queues | ~500k operations | Free tier |
| Pages | Unlimited bandwidth | Free tier |
| **Total** | | **$0/month** ✅ |

Paid tier needed only if exceeding free tier limits.

## 🎓 Learning Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Documentation](https://developers.cloudflare.com/d1/)
- [Hono Framework](https://hono.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

## 📞 Support & Maintenance

### Daily
- Check dashboard for alerts
- Review proposals (3x/day)
- Respond to TP/SL/Time alerts

### Weekly
- Review performance metrics
- Check system logs
- Adjust guardrails if needed

### Monthly
- Export data for analysis
- Review filter effectiveness
- System backup

## 🔮 Future Roadmap

### v1.1 - Enhanced Positions
- [ ] Add `/positions/:id/close` endpoint
- [ ] Manual P/L override
- [ ] Position notes/tags

### v1.2 - Advanced Filtering
- [ ] VIX regime model
- [ ] Earnings calendar integration
- [ ] Liquidity scoring

### v1.3 - Broker Integration
- [ ] Tasty/IBKR paper trading
- [ ] Auto-execution toggle
- [ ] Fill reconciliation

### v2.0 - Strategy Evolution
- [ ] Iron condor support
- [ ] Ratio spreads
- [ ] Position adjustments
- [ ] Backtest engine

## 🏆 Definition of Done (v1)

✅ Signals ingested and deduplicated  
✅ Proposals created with SAS filters  
✅ Slack alerts dispatched  
✅ Approve/Skip updates database  
✅ Positions journaled  
✅ EOD marks written  
✅ TP/SL/Time alerts triggered  
✅ Guardrails enforced  
✅ UI functional and responsive  
✅ Documentation complete  
✅ Deployment automated  

## 📄 Documentation Index

| Document | Purpose | Audience |
|----------|---------|----------|
| [README.md](./README.md) | Full system docs | Developers |
| [QUICKSTART.md](./QUICKSTART.md) | 15-min setup | New users |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment | DevOps |
| [TESTING.md](./TESTING.md) | QA scenarios | QA/Testers |
| [PLAYBOOK.md](./PLAYBOOK.md) | Daily operations | Traders |
| [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) | High-level overview | Stakeholders |

## 🎉 Quick Commands

```bash
# Development
pnpm dev:worker          # Start worker locally
pnpm dev:web             # Start web UI locally

# Database
pnpm db:migrate:local    # Run migrations locally
pnpm db:migrate          # Run migrations in production

# Deployment
pnpm deploy:worker       # Deploy worker to Cloudflare
pnpm deploy:web          # Deploy web UI to Pages

# Utilities
wrangler tail            # Stream worker logs
wrangler d1 execute sas_db --command "SELECT COUNT(*) FROM signals"
```

---

## 🚦 Status: Production Ready ✅

All phases complete. System tested and documented. Ready for signal ingestion and live trading paper mode.

**Next Steps:**
1. Follow [QUICKSTART.md](./QUICKSTART.md) to get running locally
2. Test with sample signals
3. Review [PLAYBOOK.md](./PLAYBOOK.md) for operations
4. Deploy to production when confident
5. Start paper trading phase (see [TESTING.md](./TESTING.md))

**Built with ❤️ using Cloudflare Workers + React + TypeScript**

