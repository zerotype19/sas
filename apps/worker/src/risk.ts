// Risk management and guardrails

import type { Bindings } from './env';

export type GuardrailCheck = {
  allowed: boolean;
  reason?: string;
};

/**
 * Check if a proposed trade passes all guardrails.
 * 
 * Guardrails checked:
 * 1. Max open positions
 * 2. Max equity at risk (% of account)
 * 3. Per-trade risk (% of account)
 * 4. Per-ticker cooldown (via KV)
 * 5. Liquidity requirements (placeholder)
 * 
 * @param env - Worker bindings
 * @param proposal - Proposal to check
 * @param qty - Quantity of contracts
 * @returns GuardrailCheck with allowed flag and reason if blocked
 */
export async function checkGuardrails(
  env: Bindings,
  proposal: any,
  qty: number
): Promise<GuardrailCheck> {
  try {
    // Fetch guardrail values from D1
    const guardrails = await env.DB.prepare(
      `SELECT k, v FROM guardrails`
    ).all();
    
    const guards: Record<string, string> = {};
    for (const row of (guardrails.results ?? [])) {
      guards[row.k as string] = row.v as string;
    }
    
    const maxPositions = parseInt(guards.max_positions || '5');
    const maxEquityAtRiskPct = parseFloat(guards.max_equity_at_risk_pct || '20');
    const riskPerTradePct = parseFloat(guards.risk_per_trade_pct || '2.5');
    
    // Get account equity from env
    const accountEquity = parseFloat(env.ACCOUNT_EQUITY || '100000');
    
    // 1. Check max open positions
    const openCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM positions WHERE state='open'`
    ).first();
    
    const currentOpenPositions = (openCount?.cnt as number) || 0;
    
    if (currentOpenPositions >= maxPositions) {
      return {
        allowed: false,
        reason: `Max open positions reached (${currentOpenPositions}/${maxPositions})`
      };
    }
    
    // 2. Check per-trade risk
    const tradeRisk = proposal.debit * qty * 100;
    const maxTradeRisk = accountEquity * (riskPerTradePct / 100);
    
    if (tradeRisk > maxTradeRisk) {
      return {
        allowed: false,
        reason: `Trade risk $${tradeRisk.toFixed(0)} exceeds ${riskPerTradePct}% of equity ($${maxTradeRisk.toFixed(0)})`
      };
    }
    
    // 3. Check total equity at risk
    const openPositions = await env.DB.prepare(
      `SELECT qty, entry_debit FROM positions WHERE state='open'`
    ).all();
    
    let currentEquityAtRisk = 0;
    for (const pos of (openPositions.results ?? [])) {
      currentEquityAtRisk += (pos.qty as number) * (pos.entry_debit as number) * 100;
    }
    
    const newTotalAtRisk = currentEquityAtRisk + tradeRisk;
    const maxEquityAtRisk = accountEquity * (maxEquityAtRiskPct / 100);
    
    if (newTotalAtRisk > maxEquityAtRisk) {
      return {
        allowed: false,
        reason: `Total equity at risk $${newTotalAtRisk.toFixed(0)} would exceed ${maxEquityAtRiskPct}% cap ($${maxEquityAtRisk.toFixed(0)})`
      };
    }
    
    // 4. Check per-ticker cooldown (e.g., no same ticker within 7 days)
    const cooldownDays = 7;
    const cooldownKey = `cooldown:${proposal.symbol}`;
    const lastTrade = await env.KV.get(cooldownKey);
    
    if (lastTrade) {
      return {
        allowed: false,
        reason: `Ticker ${proposal.symbol} is in cooldown (${cooldownDays} days since last trade)`
      };
    }
    
    // All checks passed - set cooldown
    await env.KV.put(cooldownKey, new Date().toISOString(), {
      expirationTtl: cooldownDays * 86400
    });
    
    return { allowed: true };
  } catch (error) {
    console.error('Guardrail check error:', error);
    // Fail safe - deny on error
    return {
      allowed: false,
      reason: `Guardrail check failed: ${error}`
    };
  }
}

/**
 * Get current risk metrics for dashboard display
 */
export async function getRiskMetrics(env: Bindings) {
  try {
    const accountEquity = parseFloat(env.ACCOUNT_EQUITY || '100000');
    
    const openCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM positions WHERE state='open'`
    ).first();
    
    const openPositions = await env.DB.prepare(
      `SELECT qty, entry_debit FROM positions WHERE state='open'`
    ).all();
    
    let totalEquityAtRisk = 0;
    for (const pos of (openPositions.results ?? [])) {
      totalEquityAtRisk += (pos.qty as number) * (pos.entry_debit as number) * 100;
    }
    
    return {
      open_positions: openCount?.cnt || 0,
      equity_at_risk: totalEquityAtRisk,
      equity_at_risk_pct: (totalEquityAtRisk / accountEquity) * 100,
      account_equity: accountEquity
    };
  } catch (error) {
    console.error('Risk metrics error:', error);
    return null;
  }
}

