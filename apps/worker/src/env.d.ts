// Cloudflare Worker environment bindings

export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  INGEST_QUEUE: Queue;
  
  // Secrets
  XYNTH_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
  SENDGRID_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  
  // Config vars
  APP_ENV: string;
  ALERT_CHANNEL: string;
  RISK_MAX_POSITIONS: string;
  RISK_MAX_EQUITY_AT_RISK_PCT: string;
  RISK_PER_TRADE_PCT: string;
  XYNTH_API_BASE: string;
  ACCOUNT_EQUITY: string;
  
  // IBKR Broker config
  IBKR_BROKER_BASE?: string;
  TRADING_MODE?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  
  // Worker URLs
  WORKER_BASE_URL?: string;
};

export type Env = {
  Bindings: Bindings;
};

