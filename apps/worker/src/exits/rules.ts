/**
 * Standardized exit rules (targets and stops) for all strategies
 */

export interface ExitLevels {
  target: number;
  stop: number;
}

/**
 * Calculate exit levels for debit strategies (Long Call/Put)
 * Default: Target = 2x debit, Stop = 0.5x debit
 */
export function debitExits(
  debit: number,
  targetMultiple = 2.0,
  stopMultiple = 0.5
): ExitLevels {
  return {
    target: +(debit * targetMultiple).toFixed(2),
    stop: +(debit * stopMultiple).toFixed(2),
  };
}

/**
 * Calculate exit levels for credit spreads
 * Default: Target = 50% credit capture, Stop = 150% of credit (or max loss)
 */
export function creditSpreadExits(
  credit: number,
  width: number,
  targetPercent = 0.50,
  stopPercent = 1.50
): ExitLevels {
  const target = +(credit * (1 - targetPercent)).toFixed(2);
  const maxLoss = width - credit;
  const stop = Math.min(
    +(credit * (1 + stopPercent)).toFixed(2),
    +(credit + maxLoss).toFixed(2)
  );
  
  return { target, stop };
}

/**
 * Calculate exit levels for Iron Condor
 * Uses the same logic as credit spreads
 */
export function condorExits(
  totalCredit: number,
  width: number,
  targetPercent = 0.50,
  stopPercent = 1.50
): ExitLevels {
  return creditSpreadExits(totalCredit, width, targetPercent, stopPercent);
}

/**
 * Calculate exit levels for Calendar spreads
 * Based on net debit paid
 * Default: Target = 25-35% net debit gain, Stop = 40-50% net debit loss
 */
export function calendarExits(
  netDebit: number,
  targetPercent = 0.30,
  stopPercent = 0.45
): ExitLevels {
  return {
    target: +(netDebit * (1 + targetPercent)).toFixed(2),
    stop: +(netDebit * (1 - stopPercent)).toFixed(2),
  };
}

/**
 * Calculate max loss for position sizing
 */
export function calculateMaxLoss(
  entryType: string,
  debit: number | null,
  credit: number | null,
  width: number | null,
  qty: number
): number {
  const multiplier = 100; // Options multiplier
  
  switch (entryType.toUpperCase()) {
    case 'DEBIT_CALL':
    case 'DEBIT_PUT':
      // Max loss = debit paid
      return debit ? debit * qty * multiplier : 0;
      
    case 'CREDIT_SPREAD':
      // Max loss = width - credit
      if (width && credit) {
        return (width - credit) * qty * multiplier;
      }
      return 0;
      
    case 'IRON_CONDOR':
      // Max loss = width - credit (worst side)
      if (width && credit) {
        return (width - credit) * qty * multiplier;
      }
      return 0;
      
    case 'CALENDAR':
      // Max loss = net debit
      return debit ? debit * qty * multiplier : 0;
      
    default:
      return 0;
  }
}

/**
 * Calculate position size based on risk budget
 * @param maxLossPerContract - Max loss per contract (in dollars, not cents)
 * @param riskBudget - Dollar amount willing to risk
 * @param maxQty - Maximum contracts to trade
 * @returns Number of contracts
 */
export function calculatePositionSize(
  maxLossPerContract: number,
  riskBudget: number,
  maxQty = 5
): number {
  if (maxLossPerContract <= 0) return 0;
  
  const qty = Math.floor(riskBudget / maxLossPerContract);
  return Math.max(1, Math.min(qty, maxQty));
}

