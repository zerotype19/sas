import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

type Position = {
  id: string;
  opened_at: string;
  symbol: string;
  bias: string;
  qty: number;
  entry_debit: number;
  dte: number;
  state: string;
  rules: any;
  pnl_history?: Array<{
    asof: string;
    mid_price: number;
    unrealized: number;
    notes?: string;
  }>;
};

export default function PositionDetail() {
  const { id } = useParams<{ id: string }>();
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchPosition();
    }
  }, [id]);

  async function fetchPosition() {
    try {
      const res = await fetch(`/api/positions/${id}`);
      const data = await res.json();
      setPosition(data);
    } catch (error) {
      console.error('Failed to fetch position:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!position) {
    return <div className="text-center py-12">Position not found</div>;
  }

  const totalCost = position.qty * position.entry_debit * 100;
  const latestPnL = position.pnl_history?.[position.pnl_history.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/positions" className="text-gray-600 hover:text-gray-900">
          ← Back
        </Link>
        <h2 className="text-3xl font-bold">{position.symbol}</h2>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          position.bias === 'bullish' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {position.bias}
        </span>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          position.state === 'open'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-gray-100 text-gray-800'
        }`}>
          {position.state}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Quantity</div>
          <div className="text-2xl font-bold">{position.qty}</div>
          <div className="text-xs text-gray-500">contracts</div>
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Entry Debit</div>
          <div className="text-2xl font-bold">${position.entry_debit.toFixed(2)}</div>
          <div className="text-xs text-gray-500">per contract</div>
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Total Cost</div>
          <div className="text-2xl font-bold">${totalCost.toLocaleString()}</div>
          <div className="text-xs text-gray-500">at entry</div>
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-600 mb-1">DTE</div>
          <div className="text-2xl font-bold">{position.dte}</div>
          <div className="text-xs text-gray-500">days to expiry</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Position Details</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-600">Position ID</dt>
            <dd className="font-mono text-xs mt-1">{position.id}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Opened</dt>
            <dd className="mt-1">{new Date(position.opened_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Take Profit</dt>
            <dd className="mt-1">+{(position.rules.tp_pct * 100).toFixed(0)}%</dd>
          </div>
          <div>
            <dt className="text-gray-600">Stop Loss</dt>
            <dd className="mt-1">{(position.rules.sl_pct * 100).toFixed(0)}%</dd>
          </div>
          <div>
            <dt className="text-gray-600">Time Stop</dt>
            <dd className="mt-1">{position.rules.time_stop_dte} DTE</dd>
          </div>
        </dl>
      </div>

      {latestPnL && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Current Mark</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600 mb-1">Mid Price</div>
              <div className="text-xl font-bold">${latestPnL.mid_price.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Unrealized P/L</div>
              <div className={`text-xl font-bold ${
                latestPnL.unrealized >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${latestPnL.unrealized.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Return %</div>
              <div className={`text-xl font-bold ${
                latestPnL.unrealized >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {((latestPnL.unrealized / totalCost) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {position.pnl_history && position.pnl_history.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold mb-4">P/L History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-right py-2 px-4">Mid Price</th>
                  <th className="text-right py-2 px-4">Unrealized</th>
                  <th className="text-left py-2 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {position.pnl_history.map((mark, i) => (
                  <tr key={i}>
                    <td className="py-2 px-4">{mark.asof}</td>
                    <td className="py-2 px-4 text-right font-mono">
                      ${mark.mid_price.toFixed(2)}
                    </td>
                    <td className={`py-2 px-4 text-right font-mono ${
                      mark.unrealized >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ${mark.unrealized.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs">
                      {mark.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

