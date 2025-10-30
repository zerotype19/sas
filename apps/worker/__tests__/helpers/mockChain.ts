/**
 * Mock option chain builder for testing strategies
 */

import type { OptionQuote, OptionChain } from '../../src/types';

export function makeDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export interface ChainParams {
  symbol?: string;
  spot?: number;
  dteFront?: number;  // e.g., 21
  dteBack?: number;   // e.g., 60
  strikes?: number[]; // around spot
  callDelta?: number; // for ATM-ish calls
  putDelta?: number;  // for ATM-ish puts (negative)
  ivFront?: number;   // 0.20 means 20% IV
  ivBack?: number;
  strikeIncrement?: number;  // Default $5 for options
}

export function makeChain(params: ChainParams = {}): {
  chain: OptionChain;
  spot: number;
  front: string;
  back: string;
} {
  const {
    symbol = 'TEST',
    spot = 100,
    dteFront = 21,
    dteBack = 60,
    strikes = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130], // Enough strikes for $5 spreads on both sides
    callDelta = 0.5,
    putDelta = -0.5,
    ivFront = 0.25,
    ivBack = 0.30,
    strikeIncrement = 5,
  } = params;

  const front = makeDate(dteFront);
  const back = makeDate(dteBack);
  const expiries = [front, back];

  const quotes: OptionQuote[] = [];

  for (const s of strikes) {
    // Calculate realistic option prices based on moneyness
    // Using HIGH volatility environment (50-60% IV) for realistic credit spreads  
    const distanceFromATM = Math.abs(s - spot);
    const pctOTM = distanceFromATM / spot;
    
    // Calls: intrinsic value + time value (EXTREME IV = very high premiums for testing)
    const callIntrinsic = Math.max(0, spot - s);
    const callTimeValue = s <= spot 
      ? 8 + (spot - s) * 0.25  // ITM: very high time value
      : Math.max(0.80, 12 * Math.exp(-pctOTM * 5)); // OTM: very generous premiums (70-80% IV)
    const callMid = +(callIntrinsic + callTimeValue).toFixed(2);
    
    // Puts: intrinsic value + time value (EXTREME IV = very high premiums for testing)
    const putIntrinsic = Math.max(0, s - spot);
    const putTimeValue = s >= spot
      ? 8 + (s - spot) * 0.25  // ITM: very high time value  
      : Math.max(0.80, 12 * Math.exp(-pctOTM * 5)); // OTM: very generous premiums (70-80% IV)
    const putMid = +(putIntrinsic + putTimeValue).toFixed(2);

    // Calculate realistic deltas using gentler moneyness-based approximation
    // Moneyness as percentage: positive for strike > spot, negative for strike < spot
    const moneynessPercent = (s - spot) / spot;
    
    // Calls: higher delta when ITM (strike < spot), lower when OTM (strike > spot)
    // Use normalized cumulative distribution function approximation
    const callZ = -moneynessPercent * 5; // Normalize: -5 for very OTM, +5 for very ITM
    const callDeltaValue = Math.max(0.05, Math.min(0.95, 
      0.5 + 0.4 * Math.tanh(callZ)  // Smooth curve from 0.10 (OTM) to 0.90 (ITM)
    ));
    
    // Puts: higher (more negative) delta when ITM (strike > spot), lower when OTM (strike < spot)
    const putZ = moneynessPercent * 5; // Normalize: +5 for very ITM, -5 for very OTM
    const putDeltaValue = Math.min(-0.05, Math.max(-0.95,
      -0.5 - 0.4 * Math.tanh(putZ)  // Smooth curve from -0.10 (OTM) to -0.90 (ITM)
    ));

    // Front month calls
    quotes.push({
      symbol,
      strike: s,
      expiry: front,
      right: 'C',
      bid: +(callMid - 0.05).toFixed(2),
      ask: +(callMid + 0.05).toFixed(2),
      mid: callMid,
      delta: +callDeltaValue.toFixed(2),
      iv: ivFront,
      gamma: 0.02,
      vega: 0.10,
      theta: -0.02,
      volume: 500,
      openInterest: 1000,
      timestamp: Date.now(),
    });

    // Front month puts
    quotes.push({
      symbol,
      strike: s,
      expiry: front,
      right: 'P',
      bid: +(putMid - 0.05).toFixed(2),
      ask: +(putMid + 0.05).toFixed(2),
      mid: putMid,
      delta: +putDeltaValue.toFixed(2),
      iv: ivFront,
      gamma: 0.02,
      vega: 0.10,
      theta: -0.02,
      volume: 500,
      openInterest: 1000,
      timestamp: Date.now(),
    });

    // Back month calls (higher premium due to more time, higher IV, slightly higher deltas)
    const backCallDelta = Math.min(0.95, callDeltaValue + 0.05);
    const backCallMid = +(callMid * 1.3).toFixed(2); // 30% more time value
    quotes.push({
      symbol,
      strike: s,
      expiry: back,
      right: 'C',
      bid: +(backCallMid - 0.10).toFixed(2),
      ask: +(backCallMid + 0.10).toFixed(2),
      mid: backCallMid,
      delta: +backCallDelta.toFixed(2),
      iv: ivBack,
      gamma: 0.03,
      vega: 0.15,
      theta: -0.01,
      volume: 300,
      openInterest: 1200,
      timestamp: Date.now(),
    });

    // Back month puts (higher premium due to more time, higher IV, slightly higher deltas)
    const backPutDelta = Math.max(-0.95, putDeltaValue - 0.05);
    const backPutMid = +(putMid * 1.3).toFixed(2); // 30% more time value
    quotes.push({
      symbol,
      strike: s,
      expiry: back,
      right: 'P',
      bid: +(backPutMid - 0.10).toFixed(2),
      ask: +(backPutMid + 0.10).toFixed(2),
      mid: backPutMid,
      delta: +backPutDelta.toFixed(2),
      iv: ivBack,
      gamma: 0.03,
      vega: 0.15,
      theta: -0.01,
      volume: 300,
      openInterest: 1200,
      timestamp: Date.now(),
    });
  }

  return {
    chain: { symbol, quotes, expiries },
    spot,
    front,
    back,
  };
}

