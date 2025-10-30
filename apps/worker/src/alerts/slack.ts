// Slack notification module

import type { Bindings } from '../env';

/**
 * Send a message to Slack webhook
 */
export async function sendSlack(env: Bindings, text: string): Promise<void> {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('[Slack] No webhook URL configured, skipping alert');
    console.log('[Slack]', text);
    return;
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      console.error('[Slack] Error:', response.status, await response.text());
    } else {
      console.log('[Slack] Message sent successfully');
    }
  } catch (error) {
    console.error('[Slack] Failed to send message:', error);
  }
}

/**
 * Send a rich Block Kit message (for future enhancement)
 */
export async function sendSlackBlocks(
  env: Bindings,
  text: string,
  blocks: any[]
): Promise<void> {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('[Slack] No webhook URL configured');
    return;
  }
  
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, blocks })
    });
  } catch (error) {
    console.error('[Slack] Failed to send blocks:', error);
  }
}

