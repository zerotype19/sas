#!/usr/bin/env python3
"""
Quick smoke test for IBKR connection
Usage: python app/smoke.py
"""

from ib_insync import IB, Stock
import os
import sys

def main():
    IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
    IB_PORT = int(os.getenv("IB_PORT", "7497"))
    IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", "19"))
    
    print(f"Connecting to IB Gateway at {IB_HOST}:{IB_PORT}...")
    
    ib = IB()
    
    try:
        ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT_ID)
        print("✓ Connected successfully")
        
        # Test quote
        print("\nTesting AAPL quote...")
        ticker = ib.reqMktData(Stock('AAPL', 'SMART', 'USD'))
        ib.sleep(0.5)
        
        print(f"  Bid: {ticker.bid}")
        print(f"  Ask: {ticker.ask}")
        print(f"  Last: {ticker.last}")
        
        ib.disconnect()
        print("\n✓ Smoke test passed!")
        return 0
        
    except Exception as e:
        print(f"\n✗ Smoke test failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

