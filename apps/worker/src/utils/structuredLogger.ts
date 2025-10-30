/**
 * Structured Logger - Human-readable one-line logs
 */

import { getEngineVersion } from '../config/thresholds';
import type { Proposal, ProposalLeg } from '../types';

/**
 * Log proposal generation in one line
 */
export function logProposal(proposal: Partial<Proposal> & { strategy: string; symbol: string }) {
  const {
    strategy,
    symbol,
    score,
    pop,
    rr,
    credit,
    debit,
    dte,
    ivr,
    legs,
  } = proposal;

  // Get short delta from legs
  const shortLeg = legs?.find(l => l.side === 'SELL');
  const shortDelta = (proposal as any).meta?.shortDelta || (proposal as any).meta?.delta || null;

  console.log(
    `[PROPOSAL] ${strategy} | ${symbol} | score=${score?.toFixed(0) || '?'} ` +
    `pop=${pop?.toFixed(0) || '–'}% rr=${rr?.toFixed(2) || '–'} ` +
    `${credit ? `credit=$${credit.toFixed(2)}` : ''}${debit ? `debit=$${debit.toFixed(2)}` : ''} ` +
    `dte=${dte || '?'} ivr=${ivr?.toFixed(0) || '?'} ` +
    `δ=${shortDelta?.toFixed(2) || '?'}`
  );
}

/**
 * Log order routing in one line
 */
export function logOrder(
  orderId: string,
  strategy: string,
  symbol: string,
  legs: ProposalLeg[],
  qty: number
) {
  // Format leg summary: BUY/SELL TYPE strike@expiry
  const legSummary = legs
    .map(l => `${l.side} ${l.type} ${l.strike}@${l.expiry.slice(5)}`)
    .join(' | ');

  console.log(
    `[ORDER] ${orderId} | ${strategy} | ${symbol} x${qty} | ${legSummary}`
  );
}

/**
 * Log strategy run summary
 */
export function logStrategyRun(stats: {
  duration: number;
  symbols: number;
  proposals: number;
  byStrategy: Record<string, number>;
}) {
  const strategyBreakdown = Object.entries(stats.byStrategy)
    .map(([s, n]) => `${s}:${n}`)
    .join(' ');

  console.log(
    `[RUN] ${stats.duration}ms | ${stats.symbols} symbols | ${stats.proposals} proposals | ${strategyBreakdown}`
  );
}

/**
 * Log engine startup with version
 */
export function logEngineStart() {
  const version = getEngineVersion();
  console.log(`[ENGINE] Starting SAS v${version} | phase=${process.env.SAS_PHASE || 1} | mode=${process.env.TRADING_MODE || 'paper'}`);
}

/**
 * Log circuit breaker trip
 */
export function logCircuitTrip(strategy: string, rejects: number, windowMinutes: number) {
  console.error(
    `[CIRCUIT] 🚨 ${strategy} TRIPPED | ${rejects} rejects in ${windowMinutes}m | Strategy disabled`
  );
}

/**
 * Log heat cap block
 */
export function logHeatCapBlock(currentRisk: number, maxRisk: number) {
  console.warn(
    `[HEAT_CAP] 🛑 New proposals blocked | Risk=${currentRisk.toFixed(1)}% > Max=${maxRisk}%`
  );
}

/**
 * Format log prefix with timestamp
 */
function timestamp(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

