/**
 * Proposals Page - Rich Cards with Legs, R/R, POP, Score
 * Phase 3: Production-ready UI with execution
 */

import { useEffect, useState, useMemo } from 'react';
import { fetchProposals, type Proposal } from '../adapters/proposals';

type Leg = { 
  side: string; 
  type: 'PUT' | 'CALL'; 
  strike: number; 
  expiry: string; 
  price?: number 
};

type ExecutionError = { id: number; message: string } | null;

export default function ProposalsPage() {
  const [data, setData] = useState<Proposal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minScore, setMinScore] = useState<number>(0);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [executing, setExecuting] = useState<number | null>(null);
  const [execError, setExecError] = useState<ExecutionError>(null);
  const [expandedRationale, setExpandedRationale] = useState<Set<number>>(new Set());

  async function approve(id: number) {
    if (!confirm('Execute this order in paper trading?')) return;
    
    setExecuting(id);
    setExecError(null);
    try {
      const res = await fetch(`/api/execute/${id}`, { method: 'POST' });
      const j = await res.json();
      
      if (j.ok) {
        // Success - refresh proposals
        const fresh = await fetchProposals('');
        setData(fresh);
      } else {
        // Show error inline on card
        setExecError({ id, message: j.error || 'Unknown error' });
      }
    } catch (e: any) {
      setExecError({ id, message: `Network error: ${e.message}` });
    } finally {
      setExecuting(null);
    }
  }

  function toggleRationale(id: number) {
    setExpandedRationale(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  useEffect(() => {
    (async () => {
      try {
        setData(await fetchProposals(''));
      } catch (e: any) {
        setErr(e?.message ?? 'Error');
      }
    })();
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data
      .filter((p) => (p.score ?? 0) >= minScore)
      .filter((p) =>
        typeFilter === 'ALL'
          ? true
          : typeFilter === 'CREDIT'
          ? p.entry_type === 'CREDIT_SPREAD'
          : p.entry_type === 'DEBIT_CALL'
      );
  }, [data, minScore, typeFilter]);

  if (err)
    return (
      <div className="p-6 max-w-md mx-auto mt-12 text-center">
        <div className="text-red-600 text-lg font-medium">⚠️ Error Loading Proposals</div>
        <div className="text-gray-600 mt-2">{err}</div>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
        >
          Retry
        </button>
      </div>
    );
  
  if (!data)
    return (
      <div className="p-6 space-y-4">
        {/* Loading skeletons */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
                <div className="h-6 w-32 bg-gray-200 rounded-full"></div>
                <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 rounded"></div>
                <div className="h-4 w-1/2 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sticky top-0 bg-gray-50 z-20 pb-3 border-b shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Proposals</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> ≥70 Strong
            </span>
            <span className="inline-flex items-center gap-1 ml-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> ≥50 Tradable
            </span>
            <span className="inline-flex items-center gap-1 ml-3">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span> &lt;50 Low
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="ALL">All types</option>
            <option value="CREDIT">Credit spreads</option>
            <option value="DEBIT">Debit calls</option>
          </select>
          <label className="text-sm flex items-center gap-2">
            Min Score
            <input
              type="number"
              className="w-20 border rounded px-3 py-1.5 text-sm"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            />
          </label>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4">
        {rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📭</div>
            <div className="text-lg font-medium text-gray-700">No proposals yet</div>
            <div className="text-sm text-gray-500 mt-2">
              {data.length === 0 
                ? "Check back after 10:30 ET when the first strategy run completes"
                : "Try adjusting your filters or lowering the minimum score"}
            </div>
          </div>
        ) : (
          rows.map((p) => {
            const legs: Leg[] = safeParseLegs(p.legs_json);
            const isCredit = p.entry_type === 'CREDIT_SPREAD';
            const hasError = execError?.id === p.id;
            const isExpanded = expandedRationale.has(p.id);
            const rationale = p.rationale || '';
            const needsTruncation = rationale.length > 200;
            
            return (
              <article
                key={p.id}
                className="rounded-xl border shadow-sm p-4 md:p-5 bg-white hover:shadow-lg transition-all duration-200 cursor-default"
              >
                {/* Header: Badges + Time */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge kind={isCredit ? 'amber' : 'emerald'}>
                      {isCredit ? 'Credit Spread' : 'Long Call'}
                    </Badge>
                    <Badge>{p.strategy.replace(/_/g, ' ')}</Badge>
                    {p.score != null && <ScoreChip score={p.score} />}
                    <span className="text-sm">•</span>
                    <span className="text-lg font-bold">{p.symbol}</span>
                  </div>
                  <div className="text-xs text-gray-500" title={new Date(p.created_at).toLocaleString()}>
                    {formatRelativeTime(p.created_at)}
                  </div>
                </div>

                {/* Metrics + Legs Grid */}
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {/* Left: Metrics */}
                  <div className="text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Action:</span>
                      <b>{p.action}</b>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-600">Qty:</span>
                      <b>{p.qty}</b>
                      <span className="text-gray-400">•</span>
                      <StatusTag status={p.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">{isCredit ? 'Credit:' : 'Debit:'}</span>
                      <b className="text-base">${fmt(p.entry_price)}</b>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Target:</span>
                      <b className="text-green-600">${fmt(p.target_price)}</b>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-600">Stop:</span>
                      <b className="text-red-600">${fmt(p.stop_price)}</b>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs">R/R:</span>
                        <b className="text-sm">{p.rr != null ? p.rr.toFixed(1) : '—'}</b>
                        {p.rr != null && p.rr > 0 && (
                          <div className="flex-1 max-w-[80px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                              style={{ width: `${Math.min(100, (p.rr / 3) * 100)}%` }}
                            ></div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs">POP:</span>
                        <b 
                          className="text-sm"
                          title={p.pop == null ? "Insufficient chain data for POP calculation" : undefined}
                        >
                          {p.pop != null ? `${Math.round(p.pop)}%` : '—'}
                        </b>
                        {p.pop != null && (
                          <div className="flex-1 max-w-[80px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                p.pop >= 70 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                                p.pop >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-600' :
                                'bg-gradient-to-r from-slate-400 to-slate-600'
                              }`}
                              style={{ width: `${p.pop}%` }}
                            ></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Legs Table */}
                  <div className="text-sm">
                    <div className="font-medium mb-2">Legs</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[360px] w-full text-xs border-collapse">
                        <thead>
                          <tr className="[&>*]:text-left [&>*]:border-b [&>*]:pb-1">
                            <th>Side</th>
                            <th>Type</th>
                            <th>Strike</th>
                            <th>Expiry</th>
                          </tr>
                        </thead>
                        <tbody>
                          {legs.map((l, i) => (
                            <tr
                              key={i}
                              className="[&>*]:py-1 [&>*]:align-top border-b last:border-0"
                            >
                              <td className={l.side === 'BUY' ? 'text-green-600' : 'text-orange-600'}>
                                {l.side}
                              </td>
                              <td className="font-medium">{l.type}</td>
                              <td>${l.strike}</td>
                              <td className="text-gray-600">{l.expiry}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Rationale */}
                {rationale && (
                  <div className="mt-3 text-xs text-gray-600 border-t pt-3">
                    <div className={`italic ${!isExpanded && needsTruncation ? 'line-clamp-2' : ''}`}>
                      {rationale}
                    </div>
                    {needsTruncation && (
                      <button
                        onClick={() => toggleRationale(p.id)}
                        className="mt-1 text-blue-600 hover:underline text-xs font-medium"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}

                {/* Execution Error (Inline) */}
                {hasError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    <b>❌ Execution Failed:</b> {execError.message}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <button
                    onClick={() => approve(p.id)}
                    disabled={executing === p.id || p.status !== 'pending'}
                    aria-label={`Approve and route ${p.symbol} ${p.strategy} to paper account`}
                    className={`px-4 py-2 rounded font-medium transition-all duration-200 flex items-center gap-2 ${
                      p.status !== 'pending'
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : executing === p.id
                        ? 'bg-gray-400 text-white cursor-wait'
                        : 'bg-black text-white hover:bg-gray-800 hover:scale-[1.02] active:bg-gray-900 active:scale-[0.98] cursor-pointer shadow-sm'
                    }`}
                  >
                    {executing === p.id && (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {executing === p.id
                      ? 'Routing...'
                      : p.status !== 'pending'
                      ? '✓ Already Routed'
                      : 'Approve & Route (Paper)'}
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 px-2">
                    <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                    Live Trading Locked
                  </span>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

// Helper: Format relative time (e.g., "5m ago")
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function safeParseLegs(s?: string) {
  try {
    return JSON.parse(s || '[]');
  } catch {
    return [];
  }
}

function fmt(n: any) {
  return Number(n).toFixed(2);
}

function Badge({
  children,
  kind,
}: {
  children: any;
  kind?: 'amber' | 'emerald';
}) {
  const cls =
    kind === 'amber'
      ? 'bg-amber-100 text-amber-900 border border-amber-200'
      : kind === 'emerald'
      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
      : 'bg-slate-100 text-slate-800 border border-slate-200';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function StatusTag({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-blue-100 text-blue-900 border-blue-200' },
    submitted: { label: 'Submitted', cls: 'bg-purple-100 text-purple-900 border-purple-200' },
    filled: { label: 'Filled', cls: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
    closed: { label: 'Closed', cls: 'bg-slate-200 text-slate-800 border-slate-300' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-900 border-red-200' },
  };
  
  const { label, cls } = statusMap[status] || { label: status, cls: 'bg-slate-100 text-slate-800 border-slate-200' };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

function ScoreChip({ score }: { score: number }) {
  const rounded = Math.round(score);
  const { cls, label } = 
    score >= 70
      ? { cls: 'bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-900 border-emerald-300 shadow-sm', label: 'Strong' }
      : score >= 50
      ? { cls: 'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-900 border-amber-300 shadow-sm', label: 'Tradable' }
      : { cls: 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 border-slate-300', label: 'Low' };
  
  return (
    <span 
      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}
      title={`Score: ${rounded} (${label})`}
    >
      {rounded}
    </span>
  );
}

