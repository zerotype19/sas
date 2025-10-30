/**
 * Implied Volatility / Realized Volatility Metrics
 * Calculates IV/RV ratios and skew spreads for options analysis
 */

export interface OptionQuote {
  symbol: string;
  expiry: string;
  strike: number;
  right: 'C' | 'P';
  bid?: number;
  ask?: number;
  mid?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
}

export interface OptionChain {
  symbol: string;
  expiries: Set<string>;
  quotes: OptionQuote[];
}

export interface IvrvResult {
  rv20: number;
  atm_iv?: number;
  atm_ivrv_ratio?: number;
  iv_premium_atm_pct?: number;
  otm_call_iv?: number;
  otm_call_ivrv_ratio?: number;
  iv_premium_otm_call_pct?: number;
  otm_put_iv?: number;
  otm_put_ivrv_ratio?: number;
  iv_premium_otm_put_pct?: number;
  call_skew_ivrv_spread?: number;
  put_skew_ivrv_spread?: number;
}

/**
 * Select an option quote by target delta
 * @param quotes - Array of option quotes
 * @param targetDelta - Target delta value (e.g., 0.50 for ATM call, -0.50 for ATM put)
 * @param side - CALL or PUT
 * @param tolerance - Maximum delta deviation (default 0.05)
 * @returns Best matching option quote or null
 */
export function selectByDelta(
  quotes: OptionQuote[],
  targetDelta: number,
  side: 'CALL' | 'PUT',
  tolerance = 0.05
): OptionQuote | null {
  const filtered = quotes.filter(
    q => q.right === (side === 'CALL' ? 'C' : 'P') && 
         q.delta != null && 
         q.iv != null
  );
  
  if (!filtered.length) return null;

  const candidates = filtered
    .map(q => ({ q, d: Math.abs((q.delta ?? 0) - targetDelta) }))
    .filter(x => x.d <= tolerance)
    .sort((a, b) => a.d - b.d);
    
  return candidates.length ? candidates[0].q : null;
}

/**
 * Calculate comprehensive IV/RV metrics from option chain
 * @param params - Object with option chain and RV20
 * @returns IV/RV metrics including ratios and skew spreads
 */
export function calcIvrvMetrics(params: {
  chain: OptionChain;
  rv20: number;
}): IvrvResult {
  const { chain, rv20 } = params;
  
  // Use front month expiry
  const front = [...chain.expiries].sort()[0];
  const quotes = chain.quotes.filter(q => q.expiry === front);

  // Select ATM options (±0.50 delta)
  const atmCall = selectByDelta(quotes, 0.50, 'CALL', 0.10);
  const atmPut = selectByDelta(quotes, -0.50, 'PUT', 0.10);
  
  // Average ATM IV from call and put
  const atm_iv = atmCall && atmPut
    ? ((atmCall.iv ?? 0) + Math.abs(atmPut.iv ?? 0)) / 2
    : atmCall?.iv ?? (atmPut?.iv ? Math.abs(atmPut.iv) : undefined);

  // Select OTM options (±0.20 delta)
  const otmCall = selectByDelta(quotes, 0.20, 'CALL', 0.05);
  const otmPut = selectByDelta(quotes, -0.20, 'PUT', 0.05);

  const out: IvrvResult = { rv20 };
  
  // Store raw IVs
  out.atm_iv = atm_iv;
  out.otm_call_iv = otmCall?.iv;
  out.otm_put_iv = otmPut?.iv;

  // Calculate IV/RV ratios
  out.atm_ivrv_ratio = atm_iv ? atm_iv / rv20 : undefined;
  out.otm_call_ivrv_ratio = otmCall?.iv ? (otmCall.iv / rv20) : undefined;
  out.otm_put_ivrv_ratio = otmPut?.iv ? (Math.abs(otmPut.iv) / rv20) : undefined;

  // Calculate IV premium percentages
  out.iv_premium_atm_pct = atm_iv ? ((atm_iv - rv20) / rv20) * 100 : undefined;
  out.iv_premium_otm_call_pct = otmCall?.iv ? ((otmCall.iv - rv20) / rv20) * 100 : undefined;
  out.iv_premium_otm_put_pct = otmPut?.iv ? ((Math.abs(otmPut.iv) - rv20) / rv20) * 100 : undefined;

  // Calculate skew spreads (OTM vs ATM)
  out.call_skew_ivrv_spread = (out.otm_call_ivrv_ratio != null && out.atm_ivrv_ratio != null)
    ? (out.otm_call_ivrv_ratio - out.atm_ivrv_ratio) 
    : undefined;
    
  out.put_skew_ivrv_spread = (out.otm_put_ivrv_ratio != null && out.atm_ivrv_ratio != null)
    ? (out.otm_put_ivrv_ratio - out.atm_ivrv_ratio) 
    : undefined;

  return out;
}

