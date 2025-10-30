import { useEffect, useState } from 'react';

type IBKRPosition = {
  symbol: string;
  assetType: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number | null;
  unrealizedPnl: number | null;
  expiry?: string;
  strike?: number;
  right?: string;
};

export default function Positions() {
  const [positions, setPositions] = useState<IBKRPosition[]>([]);
  const [loading, setLoading] = useState(true);
  // Soft-fail UX: no hard error surface

  useEffect(() => {
    fetchPositions();
  }, []);

  async function fetchPositions() {
    setLoading(true);
    // no-op: we don't surface hard errors
    try {
      const res = await fetch('/api/broker/positions');
      const ok = res.ok;
      const data = ok ? await res.json() : { positions: [] };
      const list = Array.isArray(data) ? data : (data.positions ?? []);
      setPositions(list);
      // If not ok, do not treat as error; show empty state
    } catch (err: any) {
      console.error('Failed to fetch positions:', err);
      // Soft-fail: surface hint instead of hard error
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2">Positions</h2>
          <p className="text-gray-600">Live positions from your IBKR account</p>
        </div>
        
        <button
          onClick={fetchPositions}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading positions...</div>
        ) : positions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No open positions
            <p className="text-sm mt-2">Broker may be unavailable or paper-only; syncing soon.</p>
            <button
              onClick={fetchPositions}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Symbol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Market Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  P&L
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {positions.map((pos, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-mono font-semibold">{pos.symbol}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      pos.assetType === 'OPT' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {pos.assetType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={pos.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                      {pos.quantity > 0 ? '+' : ''}{pos.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${pos.avgPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pos.marketPrice ? `$${pos.marketPrice.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {pos.unrealizedPnl !== null ? (
                      <span className={pos.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                    {pos.assetType === 'OPT' && pos.expiry && (
                      <div>
                        {pos.expiry} {pos.strike} {pos.right}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

