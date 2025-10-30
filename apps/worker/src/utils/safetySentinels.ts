/**
 * Safety Sentinels - Circuit Breakers and Risk Guards
 */

import { CIRCUIT_BREAKER, HEAT_CAP } from '../config/thresholds';
import type { Bindings } from '../env';

interface RejectEvent {
  strategy: string;
  timestamp: number;
  reason: string;
}

/**
 * Circuit Breaker: Auto-disable strategy if too many rejects in short window
 */
export class CircuitBreaker {
  private rejects: Map<string, RejectEvent[]> = new Map();

  recordReject(strategy: string, reason: string) {
    if (!CIRCUIT_BREAKER.ENABLED) return;

    const now = Date.now();
    const events = this.rejects.get(strategy) || [];
    
    // Add new reject
    events.push({ strategy, timestamp: now, reason });
    
    // Keep only events within window
    const windowMs = CIRCUIT_BREAKER.REJECT_WINDOW_MINUTES * 60 * 1000;
    const filtered = events.filter(e => now - e.timestamp < windowMs);
    
    this.rejects.set(strategy, filtered);
    
    // Check if threshold exceeded
    if (filtered.length >= CIRCUIT_BREAKER.MAX_REJECTS_PER_WINDOW) {
      console.error(`[CIRCUIT_BREAKER] Strategy ${strategy} tripped! ${filtered.length} rejects in ${CIRCUIT_BREAKER.REJECT_WINDOW_MINUTES}m`);
      return true; // Circuit tripped
    }
    
    return false;
  }

  isTripped(strategy: string): boolean {
    if (!CIRCUIT_BREAKER.ENABLED) return false;

    const events = this.rejects.get(strategy) || [];
    const now = Date.now();
    const windowMs = CIRCUIT_BREAKER.REJECT_WINDOW_MINUTES * 60 * 1000;
    const recent = events.filter(e => now - e.timestamp < windowMs);
    
    return recent.length >= CIRCUIT_BREAKER.MAX_REJECTS_PER_WINDOW;
  }

  getStatus(): Record<string, { rejects: number; tripped: boolean }> {
    const status: Record<string, { rejects: number; tripped: boolean }> = {};
    
    for (const [strategy, events] of this.rejects.entries()) {
      const now = Date.now();
      const windowMs = CIRCUIT_BREAKER.REJECT_WINDOW_MINUTES * 60 * 1000;
      const recent = events.filter(e => now - e.timestamp < windowMs);
      
      status[strategy] = {
        rejects: recent.length,
        tripped: recent.length >= CIRCUIT_BREAKER.MAX_REJECTS_PER_WINDOW,
      };
    }
    
    return status;
  }
}

/**
 * Heat Cap: Block new proposals if portfolio risk exceeds threshold
 */
export async function checkHeatCap(env: Bindings): Promise<{ allowed: boolean; currentRisk: number; reason?: string }> {
  if (!HEAT_CAP.ENABLED) {
    return { allowed: true, currentRisk: 0 };
  }

  try {
    // Query active positions from D1
    const result = await env.DB.prepare(`
      SELECT SUM(CAST(json_extract(meta, '$.maxLoss') AS REAL) * qty) as total_risk
      FROM trades
      WHERE status IN ('pending', 'submitted', 'acknowledged', 'filled')
        AND created_at > ?
    `).bind(Date.now() - 24 * 60 * 60 * 1000).first(); // Last 24h

    const totalRisk = (result?.total_risk as number) || 0;
    const equity = parseFloat(env.ACCOUNT_EQUITY || '100000');
    const riskPct = (totalRisk / equity) * 100;

    if (riskPct > HEAT_CAP.MAX_PORTFOLIO_RISK_PCT) {
      return {
        allowed: false,
        currentRisk: riskPct,
        reason: `Portfolio risk ${riskPct.toFixed(1)}% exceeds heat cap ${HEAT_CAP.MAX_PORTFOLIO_RISK_PCT}%`,
      };
    }

    return { allowed: true, currentRisk: riskPct };
  } catch (err) {
    console.error('[HEAT_CAP] Error checking portfolio risk:', err);
    // Fail open to not block trading on query errors
    return { allowed: true, currentRisk: 0 };
  }
}

/**
 * Global circuit breaker instance
 */
export const globalCircuitBreaker = new CircuitBreaker();

/**
 * Log sentinel status
 */
export function logSentinelStatus() {
  if (!CIRCUIT_BREAKER.ENABLED && !HEAT_CAP.ENABLED) {
    return;
  }

  const status = globalCircuitBreaker.getStatus();
  const tripped = Object.entries(status).filter(([_, s]) => s.tripped);

  if (tripped.length > 0) {
    console.warn('[SENTINELS] Circuit breakers tripped:', tripped.map(([s]) => s).join(', '));
  }

  console.log('[SENTINELS] Status:', {
    circuit_breaker: CIRCUIT_BREAKER.ENABLED ? 'active' : 'disabled',
    heat_cap: HEAT_CAP.ENABLED ? 'active' : 'disabled',
    tripped_strategies: tripped.length,
  });
}

