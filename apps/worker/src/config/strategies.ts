import { StrategyRegistry } from '../types';

/**
 * Strategy Registry
 * Controls which strategies are enabled and their configuration
 * Phase gating: Only strategies with phase <= SAS_PHASE will run
 */
export const STRATEGIES: StrategyRegistry = {
  // Phase 1: Existing strategies
  LONG_CALL: {
    enabled: true,
    phase: 1,
    minScore: 50,
    maxRiskPct: 0.02  // 2% max risk per trade
  },

  BULL_PUT_CREDIT: {
    enabled: true,
    phase: 1,
    minScore: 50,
    maxRiskPct: 0.02
  },

  // Phase 2: Bearish counterparts
  LONG_PUT: {
    enabled: true,
    phase: 2,
    minScore: 50,
    maxRiskPct: 0.02
  },

  BEAR_CALL_CREDIT: {
    enabled: true,
    phase: 2,
    minScore: 50,
    maxRiskPct: 0.02
  },

  // Phase 3: Advanced structures
  IRON_CONDOR: {
    enabled: true,
    phase: 3,
    minScore: 55,  // Higher bar for complex structures
    maxRiskPct: 0.02
  },

  CALENDAR_CALL: {
    enabled: true,
    phase: 3,
    minScore: 55,
    maxRiskPct: 0.02
  },

  CALENDAR_PUT: {
    enabled: false,  // Scaffold only - enable later
    phase: 3,
    minScore: 55,
    maxRiskPct: 0.02
  },
};

/**
 * Get current phase from environment
 * Defaults to phase 1 if not set
 */
export function getCurrentPhase(env?: any): number {
  // In Cloudflare Workers, use env.SAS_PHASE instead of process.env
  if (env && 'SAS_PHASE' in env) {
    return Number(env.SAS_PHASE || 1);
  }
  // Fallback for tests
  return typeof process !== 'undefined' ? Number(process.env.SAS_PHASE || 1) : 1;
}

/**
 * Check if a strategy should run based on current phase
 */
export function isStrategyAllowed(strategyPhase: number, env?: any): boolean {
  return strategyPhase <= getCurrentPhase(env);
}

/**
 * Get all enabled strategies for current phase
 */
export function getEnabledStrategies(): StrategyRegistry {
  const currentPhase = getCurrentPhase();
  const enabled: Partial<StrategyRegistry> = {};
  
  for (const [key, config] of Object.entries(STRATEGIES)) {
    if (config.enabled && config.phase <= currentPhase) {
      enabled[key as keyof StrategyRegistry] = config;
    }
  }
  
  return enabled as StrategyRegistry;
}

/**
 * One-line kill switch - set enabled=false and redeploy to disable a strategy
 * Example: LONG_CALL.enabled = false (in config above)
 * Hot-redeploy: wrangler deploy --env production
 */

