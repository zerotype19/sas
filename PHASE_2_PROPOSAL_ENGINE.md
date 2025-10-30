# Phase 2: Option Chain + Proposal Engine

> **Run this AFTER** verifying market data ingestion works (see MARKET_OPEN_CHECKLIST.md)

---

## 🎯 Goal

Add option chain enrichment and automated proposal generation:
1. **Enrich** market data with IV from option chains
2. **Generate** trade proposals from top opportunities
3. **Store** proposals for review/execution
4. **Display** in web UI

---

## 📋 Prerequisites

- ✅ Phase 1 complete (market ingestion working)
- ✅ Real market data flowing into D1
- ✅ `/search/opportunities` returning ranked symbols

---

## 🔧 Step 1: Add Option Chain Enrichment

### Update `ingestMarket.ts` to include option data:

```typescript
// After fetching quote, get option chain for near-term ATM options
const optionRes = await fetch(`${brokerBase}/optionChain`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ 
    symbol: sym,
    // Get options expiring 30-45 days out
    // Filter to ATM ±10% strikes
  })
});

const options = await optionRes.json();

// Calculate average IV for ATM options
const atmOptions = options.filter(o => 
  Math.abs(o.strike - quote.last) / quote.last < 0.10
);

// Store IV in market_data table
```

### Add IV column to D1:

```sql
-- migration 003_add_iv_column.sql
ALTER TABLE market_data ADD COLUMN iv REAL;
ALTER TABLE market_data ADD COLUMN option_volume INTEGER;
```

---

## 🧮 Step 2: Enhanced Search Logic

### Update `searchOpportunities.ts` with multi-factor scoring:

```typescript
interface OpportunityMetrics {
  priceVolatility: number;  // Range % (already have)
  ivRank: number;           // IV percentile vs 30-day
  volumeSpike: number;      // Volume vs average
  momentumScore: number;    // Direction + strength
}

function calculateOpportunityScore(metrics: OpportunityMetrics): number {
  return (
    metrics.priceVolatility * 3 +    // Weight volatility heavily
    metrics.ivRank * 2 +              // High IV = premium opportunity
    metrics.volumeSpike * 1.5 +       // Volume confirms move
    metrics.momentumScore * 1         // Direction matters
  );
}
```

---

## 📝 Step 3: Create Proposal Generator

### New route: `/propose/generate`

```typescript
// apps/worker/src/routes/generateProposals.ts

app.post('/', async (c) => {
  const db = c.env.DB;
  
  // 1. Get top opportunities from search
  const opportunities = await searchTopOpportunities(db);
  
  // 2. For each opportunity, determine strategy
  const proposals = [];
  
  for (const opp of opportunities.slice(0, 5)) {
    const strategy = determineStrategy(opp);
    
    const proposal = {
      created_at: Date.now(),
      symbol: opp.symbol,
      strategy: strategy.name,
      rationale: generateRationale(opp, strategy),
      status: 'pending',
      opportunity_score: opp.score,
      expected_return: strategy.expectedReturn,
      max_risk: strategy.maxRisk,
      target_price: strategy.targetPrice,
      stop_loss: strategy.stopLoss
    };
    
    // Store in proposals table
    const result = await db.prepare(
      `INSERT INTO proposals (created_at, symbol, strategy, rationale, status, opportunity_score)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       RETURNING id`
    ).bind(
      proposal.created_at,
      proposal.symbol,
      proposal.strategy,
      proposal.rationale,
      proposal.status,
      proposal.opportunity_score
    ).run();
    
    proposals.push({ id: result.results[0].id, ...proposal });
  }
  
  return c.json({ generated: proposals.length, proposals });
});

// Strategy determination logic
function determineStrategy(opp: Opportunity): Strategy {
  if (opp.ivRank > 70 && opp.rangePct > 3) {
    return {
      name: 'SHORT_PUT_CREDIT_SPREAD',
      expectedReturn: 0.02,  // 2% return
      maxRisk: 0.05,         // 5% max loss
      // ...
    };
  }
  
  if (opp.momentumScore > 5) {
    return {
      name: 'LONG_CALL_DEBIT_SPREAD',
      // ...
    };
  }
  
  // Default: vertical spread
  return {
    name: 'NEUTRAL_IRON_CONDOR',
    // ...
  };
}

function generateRationale(opp: Opportunity, strategy: Strategy): string {
  return `${opp.symbol} shows ${opp.rangePct}% volatility with IV rank ${opp.ivRank}. 
          ${strategy.name} offers favorable risk/reward given current market conditions.
          Entry: ${strategy.entry}, Target: ${strategy.target}, Stop: ${strategy.stop}`;
}
```

---

## 📊 Step 4: Update D1 Schema for Full Proposals

```sql
-- migration 004_enhance_proposals.sql

DROP TABLE IF EXISTS proposals;

CREATE TABLE proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  rationale TEXT,
  status TEXT DEFAULT 'pending',
  
  -- Metrics
  opportunity_score REAL,
  expected_return REAL,
  max_risk REAL,
  
  -- Trade specs
  entry_price REAL,
  target_price REAL,
  stop_loss REAL,
  contracts INTEGER DEFAULT 1,
  
  -- Options details (JSON or separate columns)
  option_legs TEXT,  -- JSON array of legs
  
  -- Execution tracking
  executed_at INTEGER,
  position_id INTEGER,
  actual_entry REAL,
  
  -- Review
  reviewed_by TEXT,
  review_notes TEXT
);

CREATE INDEX idx_proposals_status_created 
ON proposals (status, created_at DESC);
```

---

## 🎨 Step 5: Build Proposals UI

### New page: `apps/web/src/pages/Proposals.tsx`

```typescript
export default function Proposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  
  useEffect(() => {
    fetchProposals();
  }, []);
  
  async function fetchProposals() {
    const res = await fetch('/api/proposals?status=pending');
    const data = await res.json();
    setProposals(data.proposals);
  }
  
  async function approveProposal(id: number) {
    await fetch(`/api/proposals/${id}/approve`, { method: 'POST' });
    fetchProposals();
  }
  
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Trade Proposals</h2>
      
      <div className="space-y-4">
        {proposals.map(p => (
          <ProposalCard
            key={p.id}
            proposal={p}
            onApprove={() => approveProposal(p.id)}
            onReject={() => rejectProposal(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### Proposal Card Component:

```typescript
interface ProposalCardProps {
  proposal: Proposal;
  onApprove: () => void;
  onReject: () => void;
}

function ProposalCard({ proposal, onApprove, onReject }: ProposalCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold">{proposal.symbol}</h3>
          <p className="text-sm text-gray-600">{proposal.strategy}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">Score</div>
          <div className="text-2xl font-bold">{proposal.opportunity_score}</div>
        </div>
      </div>
      
      <p className="mt-4 text-gray-700">{proposal.rationale}</p>
      
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Metric label="Expected Return" value={`${(proposal.expected_return * 100).toFixed(1)}%`} />
        <Metric label="Max Risk" value={`${(proposal.max_risk * 100).toFixed(1)}%`} />
        <Metric label="R:R Ratio" value={(proposal.expected_return / proposal.max_risk).toFixed(2)} />
      </div>
      
      <div className="mt-6 flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          ✓ Approve
        </button>
        <button
          onClick={onReject}
          className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          ✗ Reject
        </button>
      </div>
    </div>
  );
}
```

---

## 🔄 Step 6: Automated Proposal Generation

### Add to cron handler:

```typescript
// In cron.ts, add daily proposal generation

if (event.cron === '45 13 * * 1-5') {  // 9:45 AM ET
  console.log('Generating daily proposals...');
  await fetch(`${env.WORKER_BASE_URL}/propose/generate`, {
    method: 'POST'
  });
}
```

---

## 🧪 Step 7: Testing Flow

```bash
# 1. Generate proposals manually
curl -X POST https://sas-worker-production.kevin-mcgovern.workers.dev/propose/generate | jq .

# 2. View proposals
curl https://sas-worker-production.kevin-mcgovern.workers.dev/proposals?status=pending | jq .

# 3. Approve a proposal
curl -X POST https://sas-worker-production.kevin-mcgovern.workers.dev/proposals/1/approve

# 4. Check Web UI
open https://sas-web.pages.dev/proposals
```

---

## 📈 Success Criteria

- [ ] Option chain data enriches market_data
- [ ] Search includes IV rank and volume metrics
- [ ] Proposal generator creates 3-5 proposals daily
- [ ] Proposals display in web UI
- [ ] Can approve/reject proposals
- [ ] Approved proposals ready for execution

---

## 🚀 Phase 3 Preview: Execution

After Phase 2, add:
- `/proposals/:id/execute` → Places order via `/broker/placeOrder`
- Position tracking in D1
- P&L monitoring
- Automated exit on TP/SL

---

## 📚 Strategy Library (Expandable)

Start with these 3 strategies, add more later:

| Strategy | When to Use | Components |
|----------|-------------|------------|
| **Short Put Credit Spread** | High IV, neutral/bullish | Sell put, buy lower put |
| **Long Call Debit Spread** | Strong momentum up | Buy call, sell higher call |
| **Iron Condor** | Low volatility, range-bound | OTM call + put spreads |

---

**Ready to implement?** Run this after confirming Phase 1 data flow works!

