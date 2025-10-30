// Email notification module (SendGrid)

import type { Bindings } from '../env';

/**
 * Send email via SendGrid (future implementation)
 */
export async function sendEmail(
  env: Bindings,
  subject: string,
  body: string
): Promise<void> {
  const apiKey = env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.log('[Email] No SendGrid API key configured');
    return;
  }
  
  // TODO: Implement SendGrid email sending
  console.log('[Email] Would send:', subject, body);
}

