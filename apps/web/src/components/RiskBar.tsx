
type RiskBarProps = {
  currentRisk: number;
  maxRisk: number;
};

export function RiskBar({ currentRisk, maxRisk }: RiskBarProps) {
  const percentage = Math.min((currentRisk / maxRisk) * 100, 100);
  
  let barColor = 'bg-green-500';
  if (percentage > 80) {
    barColor = 'bg-red-500';
  } else if (percentage > 60) {
    barColor = 'bg-yellow-500';
  }

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Equity at Risk</h3>
        <div className="text-sm">
          <span className="font-mono font-semibold">${currentRisk.toLocaleString()}</span>
          <span className="text-gray-500"> / ${maxRisk.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
        <span>0%</span>
        <span className="font-semibold">{percentage.toFixed(1)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

