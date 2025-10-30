#!/usr/bin/env python3
"""Simple IB Gateway connection test"""

from ib_insync import IB
import os

IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", "7497"))
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", "999"))  # Use different ID

print(f"Testing connection to {IB_HOST}:{IB_PORT} with client ID {IB_CLIENT_ID}...")

ib = IB()

try:
    ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT_ID, readonly=False, timeout=20)
    print("✓ Connected successfully!")
    
    # Test market data type
    ib.reqMarketDataType(3)  # Delayed
    print("✓ Set market data type to delayed")
    
    # Get account info
    accounts = ib.managedAccounts()
    print(f"✓ Accounts: {accounts}")
    
    ib.disconnect()
    print("✓ Disconnected successfully")
    print("\nConnection test PASSED! IB Gateway is configured correctly.")
    
except Exception as e:
    print(f"✗ Connection failed: {e}")
    print("\nTroubleshooting:")
    print("1. Check IB Gateway is running")
    print("2. Go to Configure → Settings → API → Settings")
    print("3. Ensure 'Enable ActiveX and Socket Clients' is checked")
    print("4. Socket port should be 7497 (paper) or 7496 (live)")
    print("5. Add 127.0.0.1 to Trusted IPs")
    print("6. Uncheck 'Read-Only API'")
    print("7. Click OK and restart IB Gateway")
    import sys
    sys.exit(1)

