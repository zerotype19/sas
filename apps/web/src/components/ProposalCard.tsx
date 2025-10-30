import { useState } from 'react';

type ProposalCardProps = {
  proposal: any;
  onApprove: (id: string, qty: number) => void;
  onSkip: (id: string) => void;
};

export function ProposalCard({ proposal, onApprove, onSkip }: ProposalCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    await onApprove(proposal.id, 1); // Default qty = 1 for now
    setLoading(false);
  }

  async function handleSkip() {
    setLoading(true);
    await onSkip(proposal.id);
    setLoading(false);
  }

  // Extract fields with fallbacks for backward compatibility
  const symbol = proposal.symbol || '—';
  const strategy = proposal.strategy || proposal.strategy_version || 'Unknown';
  const score = proposal.opportunity_score || 0;
  const rationale = proposal.rationale || 'No rationale provided';
  const status = proposal.status || 'pending';
  const createdAt = proposal.created_at ? new Date(proposal.created_at).toLocaleString() : '—';

  // Optional fields from old schema
  const hasOldSchema = proposal.filters || proposal.bias || proposal.dte;
  const bias = proposal.bias || null;
  const dte = proposal.dte || null;
  const debit = proposal.debit || 0;
  const maxProfit = proposal.max_profit || 0;
  const rr = proposal.rr || 0;
  const width = proposal.width || 0;

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="font-mono text-2xl font-bold">{symbol}</div>
          {bias && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              bias === 'bullish' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {bias}
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            {strategy}
          </span>
        </div>
        <div className="text-right">
          {dte && <div className="text-sm text-gray-600">DTE {dte}</div>}
          <div className="text-xs text-gray-500">Score: {score.toFixed(2)}</div>
        </div>
      </div>

      {/* Show old schema metrics if available */}
      {hasOldSchema && proposal.filters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {proposal.filters.skew_z !== undefined && (
            <div>
              <div className="text-xs text-gray-600 mb-1">Skew Z</div>
              <div className="font-semibold">{proposal.filters.skew_z.toFixed(2)}</div>
            </div>
          )}
          {proposal.filters.iv_rv_spread !== undefined && (
            <div>
              <div className="text-xs text-gray-600 mb-1">IV-RV Spread</div>
              <div className="font-semibold">
                +{(proposal.filters.iv_rv_spread * 100).toFixed(0)}%
              </div>
            </div>
          )}
          {proposal.filters.momentum !== undefined && (
            <div>
              <div className="text-xs text-gray-600 mb-1">Momentum</div>
              <div className="font-semibold">{proposal.filters.momentum.toFixed(2)}</div>
            </div>
          )}
          {width > 0 && (
            <div>
              <div className="text-xs text-gray-600 mb-1">Width</div>
              <div className="font-semibold">${width}</div>
            </div>
          )}
        </div>
      )}

      {/* Rationale (new schema) */}
      {rationale && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-700">
          {rationale}
        </div>
      )}

      {/* Financial metrics (old schema) */}
      {hasOldSchema && debit > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Debit:</span>
            <span className="font-mono font-semibold">${debit.toFixed(2)}</span>
          </div>
          {maxProfit > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Max Profit:</span>
              <span className="font-mono font-semibold text-green-600">
                ${maxProfit.toFixed(2)}
              </span>
            </div>
          )}
          {rr > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Risk/Reward:</span>
              <span className="font-mono font-semibold">{rr.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Created: {createdAt}
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={handleApprove}
              disabled={loading || status !== 'pending'}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Processing...' : status === 'pending' ? 'Approve' : 'Approved'}
            </button>
            <button
              onClick={handleSkip}
              disabled={loading || status !== 'pending'}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Skip
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        ID: <code className="bg-gray-100 px-1 py-0.5 rounded">{proposal.id}</code>
        {' · '}
        Status: <span className={status === 'pending' ? 'text-orange-600' : 'text-gray-600'}>{status}</span>
      </div>
    </div>
  );
}

