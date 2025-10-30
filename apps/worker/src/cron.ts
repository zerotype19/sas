// Cron handlers for scheduled tasks

import type { Bindings } from './env';
import { sendSlack } from './alerts/slack';
import { sendTelegramPosition } from './alerts/telegram';

/**
 * Check if current ET time is at specific minute
 */
function isETMinute(targetMinute: number): boolean {
  try {
    const etString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etDate = new Date(etString);
    return etDate.getMinutes() === targetMinute;
  } catch {
    return false;
  }
}

/**
 * Check if US market is open (Mon-Fri, 09:30-16:00 ET)
 */
function isUsMarketOpen(): boolean {
  try {
    const etString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etDate = new Date(etString);
    
    const day = etDate.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    
    const hour = etDate.getHours();
    const minute = etDate.getMinutes();
    const time = hour * 100 + minute;
    
    return time >= 930 && time < 1600;
  } catch {
    return false;
  }
}

/**
 * Daily mark-to-market for open positions.
 * 
 * This runs on scheduled triggers (3x/day during market hours).
 * For each open position:
 * 1. Fetch current mid price (placeholder for now)
 * 2. Calculate unrealized P/L
 * 3. Check if TP/SL/TimeStop rules are triggered
 * 4. Write PnL mark to database
 * 5. Send alerts for rule triggers
 */
export default {
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log('Running scheduled tasks', event.cron);
    
    // Run market data ingestion every 15 minutes
    if (event.cron === '*/15 * * * 1-5') {
      console.log('Running market data ingestion + strategy evaluation...');
      try {
        const workerBase = env.WORKER_BASE_URL || '';
        if (workerBase) {
          // Step 1: Ingest market data
          const ingestRes = await fetch(`${workerBase}/ingest/market`, {
            headers: { 'User-Agent': 'SAS-Cron/1.0' }
          });
          
          if (!ingestRes.ok) {
            const errorText = await ingestRes.text();
            console.error(`Ingestion failed (${ingestRes.status}):`, errorText);
            return; // Exit early on ingestion failure
          }
          
          const ingestData = await ingestRes.json();
          console.log('Market ingestion complete:', ingestData);
          
          // Handle market closed / skipped
          if (ingestData.skipped) {
            console.log('Market closed - ingestion skipped');
            return;
          }
          
          // Step 2: If data was collected, evaluate strategies
          if (ingestData.inserted && ingestData.inserted > 0) {
            console.log('Running strategy evaluation...');
            const evalRes = await fetch(`${workerBase}/strategy/evaluate`);
            
            if (!evalRes.ok) {
              console.error(`Evaluation failed (${evalRes.status})`);
              return;
            }
            
            const evalData = await evalRes.json();
            console.log(`Strategy evaluation found ${evalData.count} signals`);
            
            // Step 3: Auto-create proposals for strong signals (score > 2.0)
            if (evalData.proposals && evalData.proposals.length > 0) {
              for (const signal of evalData.proposals) {
                if (signal.score >= 2.0) {
                  console.log(`Creating proposal for ${signal.symbol} (score: ${signal.score})`);
                  const proposeRes = await fetch(`${workerBase}/propose`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(signal)
                  });
                  if (proposeRes.ok) {
                    const proposeData = await proposeRes.json();
                    console.log(`✓ Proposal created: ID ${proposeData.id}`);
                  } else {
                    console.error(`✗ Failed to create proposal for ${signal.symbol}`);
                  }
                }
              }
            }
          }
          
          // Step 4: Hourly auto-proposals (runs at :30 past the hour, 10:30-15:30 ET)
          if (isUsMarketOpen() && isETMinute(30)) {
            console.log('Running hourly strategy/run for auto-proposals...');
            
            const runRes = await fetch(`${workerBase}/strategy/run`, {
              headers: { 'User-Agent': 'SAS-Cron-Hourly/1.0' }
            });
            
            if (!runRes.ok) {
              console.error(`Strategy run failed (${runRes.status})`);
              return;
            }
            
            const runData = await runRes.json();
            const candidates = runData.candidates || [];
            console.log(`Found ${candidates.length} strategy candidates`);
            
            // Auto-create proposals for high-score candidates (>= 50)
            for (const c of candidates) {
              if ((c.score ?? 0) < 50) continue; // Quality gate
              
              // Derive entry/target/stop from entry_type
              const entry = c.entry_type === 'CREDIT_SPREAD' ? (c.credit ?? 0) : (c.debit ?? 0);
              const target = c.entry_type === 'CREDIT_SPREAD' 
                ? +(entry * 0.5).toFixed(2) 
                : +(entry * 2.0).toFixed(2);
              const stop = c.entry_type === 'CREDIT_SPREAD' 
                ? +(entry * 1.5).toFixed(2) 
                : +(entry * 0.5).toFixed(2);
              
              console.log(`Auto-proposing ${c.symbol} ${c.entry_type} (score: ${c.score})`);
              
              const proposeRes = await fetch(`${workerBase}/propose`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  symbol: c.symbol,
                  strategy: c.strategy,
                  action: c.action,
                  entry_type: c.entry_type,
                  entry_price: entry,
                  target_price: target,
                  stop_price: stop,
                  legs_json: JSON.stringify(c.legs),
                  qty: c.qty,
                  pop: c.pop,
                  rr: c.rr,
                  score: c.score,
                  rationale: c.rationale
                })
              });
              
              if (proposeRes.ok) {
                const proposeData = await proposeRes.json();
                if (proposeData.deduped) {
                  console.log(`✓ Proposal deduplicated: ID ${proposeData.id}`);
                } else {
                  console.log(`✓ Proposal created: ID ${proposeData.id}`);
                }
              } else {
                console.error(`✗ Failed to create proposal for ${c.symbol}`);
              }
            }
          }
        }
      } catch (err) {
        console.error('Market pipeline error:', err);
      }
      return; // Exit after market pipeline
    }
    
    try {
      // Fetch all open positions (for mark-to-market)
      if (!env.DB) {
        console.log('Database not configured, skipping position checks');
        return;
      }
      
      // Note: positions table doesn't exist yet (Phase 4 feature)
      // Using trades table for now
      console.log('Position management not yet implemented (Phase 4), skipping');
      return;
      
      /* Disabled until Phase 4:
      const positions = await env.DB.prepare(
        `SELECT * FROM positions WHERE state='open'`
      ).all();
      */
      
      const openPositions = positions.results ?? [];
      console.log(`Found ${openPositions.length} open positions`);
      
      if (openPositions.length === 0) {
        return;
      }
      
      const today = new Date().toISOString().split('T')[0];
      const alerts: string[] = [];
      
      for (const pos of openPositions) {
        const posId = pos.id as string;
        const symbol = pos.symbol as string;
        const qty = pos.qty as number;
        const entryDebit = pos.entry_debit as number;
        const rules = JSON.parse(pos.rules as string);
        const dte = pos.dte as number;
        
        // TODO: Fetch real mid price from quote source or Xynth
        // For now, use placeholder that simulates some profit
        const midPrice = entryDebit * 1.15; // +15% placeholder
        
        // Calculate unrealized P/L
        const unrealized = (midPrice - entryDebit) * qty * 100;
        const pctGain = ((midPrice - entryDebit) / entryDebit);
        
        // Write PnL mark
        await env.DB.prepare(
          `INSERT INTO pnl(position_id, asof, mid_price, unrealized, notes)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          posId,
          today,
          midPrice,
          unrealized,
          `Placeholder mark`
        ).run();
        
        console.log(`Marked ${posId}: ${symbol} @ ${midPrice}, P/L: ${unrealized.toFixed(2)}`);
        
        // Check rules
        if (pctGain >= rules.tp_pct) {
          const msg = `🎯 *TP Hit*: ${symbol} (${posId}) +${(pctGain * 100).toFixed(1)}%`;
          alerts.push(msg);
          await sendTelegramPosition(env, 'tp_hit', { symbol, position_id: posId, pct: pctGain });
        }
        
        if (pctGain <= rules.sl_pct) {
          const msg = `🛑 *SL Hit*: ${symbol} (${posId}) ${(pctGain * 100).toFixed(1)}%`;
          alerts.push(msg);
          await sendTelegramPosition(env, 'sl_hit', { symbol, position_id: posId, pct: pctGain });
        }
        
        // Simple DTE check (placeholder - need to calculate days remaining properly)
        if (dte <= rules.time_stop_dte) {
          const msg = `⏰ *Time Stop*: ${symbol} (${posId}) - ${dte} DTE remaining`;
          alerts.push(msg);
          await sendTelegramPosition(env, 'time_stop', { symbol, position_id: posId, dte });
        }
      }
      
      // Send consolidated alert if any rules triggered
      if (alerts.length > 0) {
        await sendSlack(env, `📈 *SAS Position Alerts*\n\n${alerts.join('\n')}`);
      }
      
      console.log('Mark-to-market complete');
    } catch (error) {
      console.error('Cron error:', error);
      await sendSlack(env, `❌ Cron error: ${error}`);
    }
  }
};

