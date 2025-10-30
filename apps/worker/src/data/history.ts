/**
 * Historical Data Fetching
 * Fetches daily price bars from broker service
 */

interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DailyHistoryResponse {
  symbol: string;
  bars: DailyBar[];
}

/**
 * Get daily closing prices from broker
 * @param symbol - Stock symbol
 * @param nDays - Number of days of history to fetch
 * @param base - Broker base URL
 * @param headers - Request headers (including CF Access)
 * @returns Array of closing prices (most recent first)
 */
export async function getDailyCloses(
  symbol: string,
  nDays: number,
  base: string,
  headers: Record<string, string>
): Promise<number[]> {
  const url = `${base}/history/daily?symbol=${symbol}&days=${nDays}`;
  
  const r = await fetch(url, { headers });
  
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`History failed for ${symbol}: ${r.status} ${text}`);
  }
  
  const data: DailyHistoryResponse = await r.json();
  
  // Extract closes (already in reverse chronological order from broker)
  return data.bars.map(b => b.close);
}

/**
 * Get full daily bars from broker
 * @param symbol - Stock symbol
 * @param nDays - Number of days of history to fetch
 * @param base - Broker base URL
 * @param headers - Request headers (including CF Access)
 * @returns Array of daily bars (most recent first)
 */
export async function getDailyBars(
  symbol: string,
  nDays: number,
  base: string,
  headers: Record<string, string>
): Promise<DailyBar[]> {
  const url = `${base}/history/daily?symbol=${symbol}&days=${nDays}`;
  
  const r = await fetch(url, { headers });
  
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`History failed for ${symbol}: ${r.status} ${text}`);
  }
  
  const data: DailyHistoryResponse = await r.json();
  return data.bars;
}

