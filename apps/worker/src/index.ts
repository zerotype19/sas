// Main worker exports

import app from './worker';
import queueModule from './queue';
import cronModule from './cron';
import type { Bindings } from './env';

export default {
  // Main HTTP handler
  fetch: app.fetch.bind(app),
  
  // Queue consumer
  async queue(batch: MessageBatch<string>, env: Bindings, ctx: ExecutionContext) {
    return queueModule.queue(batch, env);
  },
  
  // Scheduled cron
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    return cronModule.scheduled(event, env, ctx);
  }
};

