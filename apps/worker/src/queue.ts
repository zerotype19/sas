// Queue consumer for processing signals into proposals

import type { Bindings } from './env';
import { tryBuildProposal } from './sas';

export default {
  async queue(batch: MessageBatch<string>, env: Bindings) {
    console.log(`Processing batch of ${batch.messages.length} signals`);
    
    for (const msg of batch.messages) {
      try {
        const payload = JSON.parse(msg.body);
        const { signal_id } = payload;
        
        if (!signal_id) {
          console.error('Invalid message: missing signal_id');
          msg.ack();
          continue;
        }
        
        // Try to build proposal from signal
        const proposalId = await tryBuildProposal(env, signal_id);
        
        if (proposalId) {
          console.log(`✓ Created proposal ${proposalId} from signal ${signal_id}`);
        } else {
          console.log(`✗ Signal ${signal_id} did not pass filters`);
        }
        
        // Acknowledge message
        msg.ack();
      } catch (error) {
        console.error('Queue processing error:', error);
        // Retry on error (up to max_retries in wrangler.toml)
        msg.retry();
      }
    }
  }
};

