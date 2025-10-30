/**
 * Hash utilities for proposal deduplication
 * Uses stable JSON stringification + SHA-256
 */

/**
 * Stable stringify: sort object keys recursively
 * Ensures same object always produces same hash
 */
function stable(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stable);
  }
  if (obj && typeof obj === 'object') {
    const out: any = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => (out[k] = stable(obj[k])));
    return out;
  }
  return obj;
}

/**
 * Generate SHA-256 hex digest from string
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate stable hash for option legs
 * Used for proposal deduplication
 * 
 * @param symbol - Stock symbol
 * @param strategy - Strategy name
 * @param entryType - Entry type (CREDIT_SPREAD, DEBIT_CALL, etc.)
 * @param legs - Array of leg objects
 * @returns SHA-256 hex hash
 */
export async function legsHash(
  symbol: string,
  strategy: string,
  entryType: string,
  legs: any[]
): Promise<string> {
  const base = {
    symbol,
    strategy,
    entryType,
    legs: stable(legs),
  };
  return sha256Hex(JSON.stringify(base));
}

