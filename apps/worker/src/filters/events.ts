/**
 * Event-based filters for trading strategies
 */

/**
 * Check if we should block trading due to upcoming earnings
 * @param earningsDate - ISO date string of earnings announcement
 * @param todayISO - Current date ISO string
 * @param windowDays - Days before/after earnings to block (default 7)
 * @returns true if within earnings window (should block)
 */
export function blockForEarnings(
  earningsDate: string | undefined,
  todayISO: string,
  windowDays = 7
): boolean {
  if (!earningsDate) return false;
  
  try {
    const today = new Date(todayISO);
    const earnings = new Date(earningsDate);
    
    const diffMs = Math.abs(+earnings - +today);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    return diffDays <= windowDays;
  } catch {
    // Invalid date - don't block
    return false;
  }
}

/**
 * Check if we're in a blackout period for options trading
 * Common blackout windows: FOMC, major economic releases
 */
export function isBlackoutPeriod(todayISO: string): boolean {
  // TODO: Implement blackout calendar
  // For now, always allow trading
  return false;
}

/**
 * Check if expiration is too close to a known event
 * @param expiryISO - Option expiration date
 * @param earningsDate - Earnings announcement date
 * @param bufferDays - Minimum days between expiry and earnings
 */
export function expiryTooCloseToEarnings(
  expiryISO: string,
  earningsDate: string | undefined,
  bufferDays = 3
): boolean {
  if (!earningsDate) return false;
  
  try {
    const expiry = new Date(expiryISO);
    const earnings = new Date(earningsDate);
    
    const diffMs = Math.abs(+earnings - +expiry);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    return diffDays <= bufferDays;
  } catch {
    return false;
  }
}

