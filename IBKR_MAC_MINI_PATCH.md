# IBKR Mac Mini Service Patch - Add Greeks Endpoint

## Instructions

1. **Stop the current service:**
```bash
pkill -f "uvicorn app.main"
```

2. **Edit the file:**
```bash
cd ~/ibkr-broker
nano app/main.py  # or use your preferred editor
```

3. **Add this code AT THE END of the file (before the last line):**

```python
# ============================================================================
# PHASE 2B: Batch Option Quotes with Greeks
# ============================================================================

class OptKey(BaseModel):
    symbol: str
    expiry: str       # YYYY-MM-DD
    strike: float
    right: str        # 'C' or 'P'
    exchange: Optional[str] = "SMART"
    currency: Optional[str] = "USD"

class OptQuoteReq(BaseModel):
    contracts: List[OptKey]

@app.post("/options/quotes")
def options_quotes(req: OptQuoteReq):
    """
    Fetch option quotes with greeks for multiple contracts in batch.
    
    Request body:
    {
      "contracts": [
        {"symbol": "AAPL", "expiry": "2025-12-19", "strike": 200.0, "right": "P"},
        {"symbol": "AAPL", "expiry": "2025-12-19", "strike": 195.0, "right": "P"}
      ]
    }
    
    Response:
    {
      "quotes": [
        {
          "symbol": "AAPL", "expiry": "2025-12-19", "strike": 200.0, "right": "P",
          "bid": 5.20, "ask": 5.40, "mid": 5.30,
          "iv": 0.28, "delta": -0.25, "gamma": 0.02, "vega": 0.15, "theta": -0.05
        },
        ...
      ]
    }
    """
    try:
        out = []
        tickers = []
        contracts = []
        
        # Build contracts and request market data
        for k in req.contracts:
            # Convert YYYY-MM-DD to YYYYMMDD
            exp = k.expiry.replace("-", "")
            
            # Create IB contract
            c = Option(
                k.symbol, 
                exp, 
                float(k.strike), 
                k.right.upper(), 
                k.exchange or "SMART", 
                k.currency or "USD"
            )
            contracts.append(c)
            
            # Request market data (includes greeks)
            t = ib.reqMktData(c, "", False, False)
            tickers.append(t)
        
        # Wait for data to populate
        ib.sleep(1.5)
        
        # Extract data from tickers
        for c, t in zip(contracts, tickers):
            # Initialize values
            iv = None
            delta = None
            gamma = None
            vega = None
            theta = None
            
            # Try to get greeks from modelGreeks first
            if t.modelGreeks:
                iv = t.modelGreeks.impliedVol
                delta = t.modelGreeks.delta
                gamma = t.modelGreeks.gamma
                vega = t.modelGreeks.vega
                theta = t.modelGreeks.theta
            # Fallback to direct attributes
            elif hasattr(t, 'impliedVolatility'):
                iv = t.impliedVolatility
            
            # Calculate mid price
            mid = None
            if t.bid is not None and t.ask is not None and t.bid > 0 and t.ask > 0:
                mid = (t.bid + t.ask) / 2.0
            elif t.last is not None and t.last > 0:
                mid = t.last
            
            # Format expiry back to YYYY-MM-DD
            exp_str = c.lastTradeDateOrContractMonth
            if len(exp_str) == 8:  # YYYYMMDD
                exp_formatted = f"{exp_str[:4]}-{exp_str[4:6]}-{exp_str[6:]}"
            else:
                exp_formatted = exp_str
            
            # Build response object
            out.append({
                "symbol": c.symbol,
                "expiry": exp_formatted,
                "strike": c.strike,
                "right": c.right,
                "bid": t.bid,
                "ask": t.ask,
                "mid": mid,
                "iv": iv,
                "delta": delta,
                "gamma": gamma,
                "vega": vega,
                "theta": theta
            })
            
            # Cancel market data subscription
            ib.cancelMktData(c)
        
        return {"quotes": out}
        
    except Exception as e:
        logger.error(f"Options quotes error: {e}")
        raise HTTPException(500, f"Failed to fetch option quotes: {e}")
```

4. **Save the file** (Ctrl+O, Enter, Ctrl+X in nano)

5. **Restart the service:**
```bash
cd ~/ibkr-broker
source .venv/bin/activate
IB_CLIENT_ID=22 uvicorn app.main:app --host 127.0.0.1 --port 8081 --loop asyncio > broker.out.log 2> broker.err.log &
disown
```

6. **Test the endpoint:**
```bash
curl -X POST http://127.0.0.1:8081/options/quotes \
  -H 'content-type: application/json' \
  -d '{
    "contracts": [
      {"symbol": "AAPL", "expiry": "2025-12-19", "strike": 200.0, "right": "P"}
    ]
  }' | jq .
```

**Expected output:**
```json
{
  "quotes": [
    {
      "symbol": "AAPL",
      "expiry": "2025-12-19",
      "strike": 200.0,
      "right": "P",
      "bid": null,
      "ask": null,
      "mid": null,
      "iv": null,
      "delta": null,
      "gamma": null,
      "vega": null,
      "theta": null
    }
  ]
}
```

**Note:** Values will be `null` when market is closed. During market hours (with delayed data), you'll get real numbers.

## Troubleshooting

**If you get import errors:**
- Make sure `List` and `Optional` are imported at the top of the file:
  ```python
  from typing import List, Optional
  ```

**If the service won't start:**
- Check logs: `tail -50 ~/ibkr-broker/broker.err.log`
- Verify IB Gateway is running and connected

**To verify service is running:**
```bash
ps aux | grep uvicorn | grep -v grep
curl -s http://127.0.0.1:8081/ | jq .
```

Should return:
```json
{
  "service": "IBKR Broker Service",
  "version": "1.0.0",
  "connected": true
}
```

