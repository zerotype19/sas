import { useEffect, useState } from 'react';

type Account = {
  accountId: string;
  cash: number;
  equity: number;
  buyingPower: number | null;
  excessLiquidity: number | null;
};

type Position = {
  symbol: string;
  assetType: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number | null;
  unrealizedPnl: number | null;
};

export default function IBKRDashboard() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      
      // Fetch account
      const accountRes = await fetch('/api/broker/account');
      if (!accountRes.ok) throw new Error(`Account: ${accountRes.status}`);
      const accountData = await accountRes.json();
      setAccount(accountData);

      // Fetch positions
      const positionsRes = await fetch('/api/broker/positions');
      if (!positionsRes.ok) throw new Error(`Positions: ${positionsRes.status}`);
      const positionsData = await positionsRes.json();
      
      // Handle both array and error responses
      if (Array.isArray(positionsData)) {
        setPositions(positionsData);
      } else if (positionsData.detail) {
        console.warn('Positions error:', positionsData.detail);
        setPositions([]);
      } else {
        setPositions([]);
      }
      
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">Error</h3>
        <p className="text-red-600">{error}</p>
        <button 
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2">Account Dashboard</h2>
        <p className="text-gray-600">Live data from Interactive Brokers • Paper Trading Mode</p>
      </div>

      {/* Account Summary */}
      {account && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="text-sm text-gray-600 mb-1">Account</div>
            <div className="text-lg font-mono">{account.accountId}</div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="text-sm text-gray-600 mb-1">Cash</div>
            <div className="text-3xl font-bold">${account.cash.toLocaleString()}</div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="text-sm text-gray-600 mb-1">Equity</div>
            <div className="text-3xl font-bold">${account.equity.toLocaleString()}</div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="text-sm text-gray-600 mb-1">Buying Power</div>
            <div className="text-3xl font-bold">
              ${account.buyingPower?.toLocaleString() || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Positions */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Positions</h3>
          <button 
            onClick={fetchData}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            🔄 Refresh
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No open positions
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr className="text-left text-sm text-gray-600">
                  <th className="pb-3">Symbol</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3 text-right">Quantity</th>
                  <th className="pb-3 text-right">Avg Price</th>
                  <th className="pb-3 text-right">Market Price</th>
                  <th className="pb-3 text-right">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {positions.map((pos, idx) => (
                  <tr key={idx} className="text-sm">
                    <td className="py-3 font-mono font-semibold">{pos.symbol}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        pos.assetType === 'STK' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {pos.assetType}
                      </span>
                    </td>
                    <td className="py-3 text-right">{pos.quantity}</td>
                    <td className="py-3 text-right">${pos.avgPrice.toFixed(2)}</td>
                    <td className="py-3 text-right">
                      {pos.marketPrice ? `$${pos.marketPrice.toFixed(2)}` : '-'}
                    </td>
                    <td className={`py-3 text-right font-semibold ${
                      (pos.unrealizedPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {pos.unrealizedPnl ? `$${pos.unrealizedPnl.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-xl font-semibold mb-4">System Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Worker</span>
            <span className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Connected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">IBKR Service</span>
            <span className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Connected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">IB Gateway</span>
            <span className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              {account?.accountId || 'Connected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Market Data</span>
            <span className="flex items-center">
              <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
              Delayed (15-min)
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Real-time available starting Nov 1st after subscription activation
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/proposals"
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
          >
            📋 View Proposals
          </a>
          <a
            href="/positions"
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-center font-medium"
          >
            📊 Manage Positions
          </a>
          <button
            onClick={fetchData}
            className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
}

