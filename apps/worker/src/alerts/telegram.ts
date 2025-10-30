// Telegram notification module

import type { Bindings } from '../env';

/**
 * Send a message to Telegram using Bot API
 */
export async function sendTelegram(env: Bindings, text: string): Promise<void> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('[Telegram] No bot token or chat ID configured, skipping alert');
    console.log('[Telegram]', text);
    return;
  }
  
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Telegram] Error:', response.status, error);
    } else {
      console.log('[Telegram] Message sent successfully');
    }
  } catch (error) {
    console.error('[Telegram] Failed to send message:', error);
  }
}

/**
 * Send a formatted proposal alert to Telegram
 */
export async function sendTelegramProposal(
  env: Bindings,
  proposal: {
    id: string;
    symbol: string;
    bias: string;
    skew_z: number;
    iv_rv_spread: number;
    dte: number;
    debit: number;
    rr: number;
    max_profit: number;
  }
): Promise<void> {
  const message = `📊 *SAS Proposal: ${proposal.symbol}* (${proposal.bias})

Skew Z: ${proposal.skew_z.toFixed(2)} | IV-RV: +${(proposal.iv_rv_spread * 100).toFixed(0)}% | DTE: ${proposal.dte}
Debit: $${proposal.debit.toFixed(2)} | RR: ${proposal.rr.toFixed(2)} | Max P/L: $${proposal.max_profit.toFixed(2)}

ID: \`${proposal.id}\`

[📱 Review in Web UI](https://sas-web.pages.dev/proposals)`;

  await sendTelegram(env, message);
}

/**
 * Send position alert to Telegram
 */
export async function sendTelegramPosition(
  env: Bindings,
  type: 'approved' | 'tp_hit' | 'sl_hit' | 'time_stop' | 'guard_blocked',
  data: any
): Promise<void> {
  let message = '';
  
  switch (type) {
    case 'approved':
      message = `✅ *SAS: Approved ${data.symbol}*

${data.bias} x${data.qty} @ $${data.debit}
Position ID: \`${data.position_id}\``;
      break;
      
    case 'tp_hit':
      message = `🎯 *TP Hit: ${data.symbol}*

Position: \`${data.position_id}\`
Gain: +${(data.pct * 100).toFixed(1)}%`;
      break;
      
    case 'sl_hit':
      message = `🛑 *SL Hit: ${data.symbol}*

Position: \`${data.position_id}\`
Loss: ${(data.pct * 100).toFixed(1)}%`;
      break;
      
    case 'time_stop':
      message = `⏰ *Time Stop: ${data.symbol}*

Position: \`${data.position_id}\`
${data.dte} DTE remaining`;
      break;
      
    case 'guard_blocked':
      message = `⚠️ *SAS Guard: Blocked ${data.symbol}*

Reason: ${data.reason}`;
      break;
  }
  
  await sendTelegram(env, message);
}

