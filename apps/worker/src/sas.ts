// SAS (Skew Advantage System) Rules Engine

import type { Bindings } from './env';
import { sendSlack } from './alerts/slack';
import { sendTelegramProposal } from './alerts/telegram';

/**
 * Apply SAS filters to a signal and construct a proposal if it passes.
 * 
 * Core filters:
 * - skew_z <= -2 (negative skew, bullish setup)
 * - iv_rv_spread >= 0.25 (elevated IV vs realized)
 * - momentum defines bias (positive = bullish, negative = bearish)
 * 
 * @param env - Worker bindings
 * @param signalId - Signal ID to process
 * @returns proposal ID if created, null otherwise
 */
export async function tryBuildProposal(
  env: Bindings,
  signalId: string
): Promise<string | null> {
  try {
    // Fetch signal from D1
    const sig = await env.DB.prepare(
      `SELECT * FROM signals WHERE id=?`
    ).bind(signalId).first();
    
    if (!sig) {
      console.log(`Signal ${signalId} not found`);
      return null;
    }
    
    // Extract values
    const skew_z = sig.skew_z as number;
    const iv_rv_spread = sig.iv_rv_spread as number;
    const momentum = sig.momentum as number;
    const symbol = sig.symbol as string;
    const asof = sig.asof as string;
    
    // Apply SAS filters
    if (skew_z > -2) {
      console.log(`${symbol}: skew_z ${skew_z} > -2, rejected`);
      return null;
    }
    
    if (iv_rv_spread < 0.25) {
      console.log(`${symbol}: iv_rv_spread ${iv_rv_spread} < 0.25, rejected`);
      return null;
    }
    
    // Determine bias from momentum
    let bias: 'bullish' | 'bearish' | null = null;
    if (momentum > 0) {
      bias = 'bullish';
    } else if (momentum < 0) {
      bias = 'bearish';
    }
    
    if (!bias) {
      console.log(`${symbol}: no clear momentum bias, rejected`);
      return null;
    }
    
    // Construct proposal (placeholder strikes/debit)
    // In production, these would come from option chain data
    const dte = 45;
    const width = 20;
    const debit = 7.0; // placeholder
    const max_profit = width - debit;
    const rr = max_profit / debit;
    
    // Build leg structures
    const long_leg = {
      type: bias === 'bullish' ? 'C' : 'P',
      strike: 'ATM50Δ', // placeholder
      delta: 0.5,
      exp: addDaysToDate(new Date(asof), dte)
    };
    
    const short_leg = {
      type: bias === 'bullish' ? 'C' : 'P',
      strike: 'OTM20Δ', // placeholder
      delta: 0.2,
      exp: addDaysToDate(new Date(asof), dte)
    };
    
    const filters = {
      skew_z,
      iv_rv_spread,
      momentum,
      vix: undefined // TODO: fetch VIX from external source
    };
    
    // Generate proposal ID
    const timestamp = asof.replace(/[:.]/g, '_');
    const proposalId = `prop_${symbol}_${timestamp}`;
    
    // Insert into D1
    await env.DB.prepare(
      `INSERT OR REPLACE INTO proposals(
        id, created_at, symbol, bias, dte, 
        long_leg, short_leg, width, debit, max_profit, rr,
        filters, status, strategy_version
      ) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'sas@1.0.0')`
    ).bind(
      proposalId,
      symbol,
      bias,
      dte,
      JSON.stringify(long_leg),
      JSON.stringify(short_leg),
      width,
      debit,
      max_profit,
      rr,
      JSON.stringify(filters)
    ).run();
    
    console.log(`Created proposal ${proposalId} for ${symbol} (${bias})`);
    
    // Send alerts (both Slack and Telegram)
    const message = formatProposalAlert(symbol, bias, skew_z, iv_rv_spread, dte, debit, rr, max_profit, proposalId);
    await sendSlack(env, message);
    await sendTelegramProposal(env, {
      id: proposalId,
      symbol,
      bias,
      skew_z,
      iv_rv_spread,
      dte,
      debit,
      rr,
      max_profit
    });
    
    return proposalId;
  } catch (error) {
    console.error(`Error building proposal for ${signalId}:`, error);
    return null;
  }
}

/**
 * Format a Slack alert message for a new proposal
 */
function formatProposalAlert(
  symbol: string,
  bias: string,
  skew_z: number,
  iv_rv_spread: number,
  dte: number,
  debit: number,
  rr: number,
  max_profit: number,
  proposalId: string
): string {
  return `📊 *SAS Proposal: ${symbol}* (${bias})
  
Skew Z: ${skew_z.toFixed(2)} | IV-RV: +${(iv_rv_spread * 100).toFixed(0)}% | DTE: ${dte}
Debit: $${debit.toFixed(2)} | RR: ${rr.toFixed(2)} | Max P/L: $${max_profit.toFixed(2)}

ID: \`${proposalId}\``;
}

/**
 * Helper: Add days to a date and return ISO string
 */
function addDaysToDate(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

