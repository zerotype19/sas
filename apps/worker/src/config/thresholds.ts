/**
 * Strategy Thresholds - Environment-aware configuration
 * Test env uses relaxed thresholds for synthetic data
 * Production env uses strict thresholds for real trading
 * 
 * NOTE: In Cloudflare Workers, process.env is not available at module init time.
 * These must be accessed as getters or functions.
 */

function isTestEnv(): boolean {
  // Check if running in test environment (Vitest)
  try {
    return typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');
  } catch {
    return false; // In Workers runtime, process doesn't exist
  }
}

export const CREDIT_SPREAD_THRESHOLDS = {
  // Bull Put, Bear Call Credit Spreads
  get MIN_CREDIT_FRAC() {
    return isTestEnv() ? 0.20 : 0.30; // Test: 20%, Prod: 30% of width
  },
  MAX_SPREAD_PCT: 20,
};

export const IRON_CONDOR_THRESHOLDS = {
  get MIN_CREDIT_FRAC() {
    return isTestEnv() ? 0.15 : 0.25; // Test: 15%, Prod: 25% of combined width
  },
  MAX_SPREAD_PCT: 20,
  EARNINGS_BLOCK_WINDOW_DAYS: 7,
  SYMMETRY_TOLERANCE: 0.05,
};

export const DEBIT_THRESHOLDS = {
  // Long Call, Long Put, Calendars
  MAX_SPREAD_PCT: 20,
  MAX_IVR_FOR_BUYING: 40, // Don't buy when IV is too high
};

// Risk limits - these come from runtime env vars, so use getters
export function getRiskLimits(env?: any) {
  return {
    FRACTION_PER_TRADE: parseFloat(env?.RISK_PER_TRADE_PCT || '0.5') / 100,
    MAX_NOTIONAL_PER_POSITION: parseFloat(env?.MAX_NOTIONAL || '10000'),
    MAX_QTY_PER_LEG: 5,
    MAX_PORTFOLIO_RISK_PCT: parseFloat(env?.RISK_MAX_EQUITY_AT_RISK_PCT || '20'),
  };
}

// For backwards compatibility in tests
export const RISK_LIMITS = {
  get FRACTION_PER_TRADE() { return 0.005; },
  get MAX_NOTIONAL_PER_POSITION() { return 10000; },
  MAX_QTY_PER_LEG: 5,
  get MAX_PORTFOLIO_RISK_PCT() { return 20; },
};

export function getCircuitBreakerConfig(env?: any) {
  return {
    MAX_REJECTS_PER_WINDOW: 3,
    REJECT_WINDOW_MINUTES: 10,
    ENABLED: env?.TRADING_MODE === 'live', // Only in live mode
  };
}

export const CIRCUIT_BREAKER = {
  MAX_REJECTS_PER_WINDOW: 3,
  REJECT_WINDOW_MINUTES: 10,
  get ENABLED() { return false; }, // Default to disabled, override with getCircuitBreakerConfig(env)
};

export const HEAT_CAP = {
  MAX_PORTFOLIO_RISK_PCT: 10, // Stop new proposals if risk > 10%
  ENABLED: true,
};

/**
 * Get engine version for tracking
 * In Workers, this should be passed from env or set at build time
 */
export function getEngineVersion(env?: any): string {
  try {
    // Try to get from env first (Workers)
    if (env?.GIT_SHA) return env.GIT_SHA;
    if (env?.CF_PAGES_COMMIT_SHA) return env.CF_PAGES_COMMIT_SHA;
    
    // Fall back to process.env for local/test
    if (typeof process !== 'undefined') {
      return process.env.GIT_SHA || process.env.CF_PAGES_COMMIT_SHA || 'dev';
    }
  } catch {
    // Ignore errors
  }
  
  return 'unknown';
}

/**
 * Log configuration on startup
 */
export function logConfig(env?: any) {
  console.log('[CONFIG] Strategy Thresholds:', {
    env: isTestEnv() ? 'test' : 'production',
    trading_mode: env?.TRADING_MODE || 'paper',
    credit_spread_min: CREDIT_SPREAD_THRESHOLDS.MIN_CREDIT_FRAC,
    iron_condor_min: IRON_CONDOR_THRESHOLDS.MIN_CREDIT_FRAC,
    circuit_breaker: getCircuitBreakerConfig(env).ENABLED,
    heat_cap: HEAT_CAP.ENABLED,
    engine_version: getEngineVersion(env),
  });
}

