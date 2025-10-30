import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RiskBar } from '../components/RiskBar';

type Position = {
  id: string;
  symbol: string;
  bias: string;
  qty: number;
  entry_debit: number;
  opened_at: string;
  state: string;
};

export default function Dashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPositions();
  }, []);

  async function fetchPositions() {
    try {
      const res = await fetch('/api/positions?state=open');
      const data = await res.json();
      setPositions(data);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalAtRisk = positions.reduce((sum, p) => sum + (p.qty * p.entry_debit * 100), 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
        <p className="text-gray-600">Overview of your SAS portfolio</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-md p-6">
          <div className="text-sm text-gray-600 mb-1">Open Positions</div>
          <div className="text-3xl font-bold">{positions.length}</div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6">
          <div className="text-sm text-gray-600 mb-1">Capital at Risk</div>
          <div className="text-3xl font-bold">${totalAtRisk.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6">
          <div className="text-sm text-gray-600 mb-1">Account Equity</div>
          <div className="text-3xl font-bold">$100,000</div>
        </div>
      </div>

      <RiskBar currentRisk={totalAtRisk} maxRisk={20000} />

      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Open Positions</h3>
          <Link to="/positions" className="text-sm text-blue-600 hover:text-blue-800">
            View All →
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No open positions</div>
        ) : (
          <div className="space-y-3">
            {positions.map((pos) => (
              <Link
                key={pos.id}
                to={`/positions/${pos.id}`}
                className="block p-4 border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="font-mono text-lg font-semibold">{pos.symbol}</div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      pos.bias === 'bullish' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {pos.bias}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">{pos.qty} contracts @ ${pos.entry_debit}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(pos.opened_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Recent Proposals</h3>
          <Link to="/proposals" className="text-sm text-blue-600 hover:text-blue-800">
            View All →
          </Link>
        </div>
        <div className="text-center py-8 text-gray-500">
          Check the Proposals page for new opportunities
        </div>
      </div>
    </div>
  );
}

