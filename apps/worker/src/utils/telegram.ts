import type { Bindings } from '../env';

/**
 * Send a message to Telegram
 */
export async function sendTelegram(text: string, env: Bindings): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    console.log('Telegram not configured, skipping alert');
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram send failed:', error);
      return false;
    }

    console.log('Telegram message sent successfully');
    return true;
  } catch (error) {
    console.error('Telegram error:', error);
    return false;
  }
}

/**
 * Format a proposal as a Telegram message (legacy)
 */
export function formatProposalMessage(proposal: any, webUrl?: string): string {
  const emoji = proposal.action === 'BUY' ? '🟢' : '🔴';
  const actionLabel = proposal.action === 'BUY' ? 'LONG' : 'SHORT';
  
  let message = `${emoji} <b>New ${actionLabel} Signal</b>\n\n`;
  message += `<b>Symbol:</b> ${proposal.symbol}\n`;
  message += `<b>Strategy:</b> ${proposal.strategy}\n`;
  message += `<b>Entry:</b> $${proposal.entry_price?.toFixed(2) || '—'}\n`;
  message += `<b>Target:</b> $${proposal.target_price?.toFixed(2) || '—'}\n`;
  message += `<b>Stop:</b> $${proposal.stop_price?.toFixed(2) || '—'}\n`;
  message += `<b>Score:</b> ${proposal.score?.toFixed(2) || '—'}\n\n`;
  message += `<i>${proposal.rationale || 'No rationale provided'}</i>`;

  if (webUrl) {
    message += `\n\n<a href="${webUrl}/proposals">View in Dashboard →</a>`;
  }

  return message;
}

/**
 * Format a Phase 2B proposal with legs, R/R, POP
 */
export function formatProposalMsg(p: any): string {
  // Header with entry type
  const hdr = p.entry_type === 'CREDIT_SPREAD' ? '🟠 Credit Spread' : '🟢 Long Call';
  
  // Price label
  const px = p.entry_type === 'CREDIT_SPREAD' 
    ? `Credit: $${p.entry_price}` 
    : `Debit: $${p.entry_price}`;
  
  // Parse and format legs
  const legs = (() => {
    try {
      return JSON.parse(p.legs_json || '[]');
    } catch {
      return [];
    }
  })()
    .map((l: any) => `  ${l.side} ${l.type} ${l.strike} • ${l.expiry}`)
    .join('\n');

  // Build message
  let msg = `${hdr} • <b>${p.symbol}</b>\n`;
  msg += `Strategy: ${p.strategy}\n`;
  msg += `${px}  |  Target: $${p.target_price}  |  Stop: $${p.stop_price}\n`;
  msg += `Qty: ${p.qty}  |  R/R: ${p.rr ?? '—'}  |  POP: ${p.pop ?? '—'}%  |  Score: ${p.score ?? '—'}\n\n`;
  
  if (legs) {
    msg += `<b>Legs:</b>\n${legs}\n\n`;
  }
  
  msg += `<i>${p.rationale}</i>\n\n`;
  msg += `<a href="https://sas-web.pages.dev/proposals?id=${p.id}">Quick Approve (Phase 3) →</a>`;

  return msg;
}

