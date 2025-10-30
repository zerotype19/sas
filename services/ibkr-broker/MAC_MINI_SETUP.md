# Mac mini 24/7 IBKR Bridge Setup

> Turn your Mac mini into an always-on IBKR bridge that your Cloudflare Worker/Pages can reach securely via Cloudflare Tunnel.

---

## Prerequisites

- **IB Gateway (Paper)** installed on Mac mini
- **Homebrew** installed
- **Cloudflare account** with a domain

---

## Step 1: IB Gateway Configuration (One-Time, GUI)

1. Launch **IB Gateway (Paper)** and log in
2. Go to `Configure → API → Settings`:
   - ☑ **Enable ActiveX and Socket Clients**
   - **Socket Port**: `7497` (paper) or `7496` (live)
   - **Trusted IPs**: `127.0.0.1`
   - ☑ **Use Delayed Market Data** (until subscription starts)
   - ☐ **Read-Only API** (uncheck to allow orders)
3. Click **Apply** and **OK**
4. Leave Gateway running

**Note**: Settings are saved in `~/Jts/` and persist across restarts.

---

## Step 2: Install IBKR Broker Service

### Option A: Automated Setup (Recommended)

```bash
# On the Mac mini, from your project root:
cd /Users/kevinmcgovern/sas/services/ibkr-broker
bash setup_mac_mini.sh
```

This will:
- Create Python virtual environment
- Install dependencies
- Test IB Gateway connection
- Set up launchd service
- Configure logs

### Option B: Manual Setup

```bash
# Create service directory
mkdir -p ~/ibkr-broker/app
cd ~/ibkr-broker

# Copy files from this repo
cp /Users/kevinmcgovern/sas/services/ibkr-broker/app/main.py ~/ibkr-broker/app/
cp /Users/kevinmcgovern/sas/services/ibkr-broker/run_mac.sh ~/ibkr-broker/run.sh
chmod +x ~/ibkr-broker/run.sh

# Create venv and install deps
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install fastapi "uvicorn[standard]" pydantic ib-insync==0.9.86

# Test connection
python3 -c "
from ib_insync import IB, Stock
ib = IB()
ib.connect('127.0.0.1', 7497, clientId=19)
ib.reqMarketDataType(3)  # delayed
ticker = ib.reqMktData(Stock('AAPL', 'SMART', 'USD'))
ib.sleep(0.5)
print(f'✓ AAPL: bid={ticker.bid}, ask={ticker.ask}, last={ticker.last}')
ib.disconnect()
"
```

---

## Step 3: Set Up launchd (Auto-Start Service)

```bash
# Copy the plist file
cp /Users/kevinmcgovern/sas/services/ibkr-broker/com.ibkr.broker.plist ~/Library/LaunchAgents/

# Load and start the service
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl start com.ibkr.broker

# Verify it's running
launchctl list | grep ibkr
ps aux | grep uvicorn

# Check logs
tail -f ~/ibkr-broker/broker.out.log
```

**Service will now:**
- Start automatically on Mac mini boot
- Restart if it crashes
- Log to `~/ibkr-broker/broker.{out,err}.log`

---

## Step 4: Install Cloudflare Tunnel

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Authenticate with Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create ibkr-broker

# Copy tunnel credentials UUID
ls ~/.cloudflared/*.json
# Example: ~/.cloudflared/abc123-xyz.json
```

### Configure Tunnel

```bash
# Create config file
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: ibkr-broker
credentials-file: /Users/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_ID.json
ingress:
  - hostname: ibkr-broker.yourdomain.com
    service: http://127.0.0.1:8081
  - service: http_status:404
EOF

# IMPORTANT: Update YOUR_USERNAME and YOUR_TUNNEL_ID above!

# Create DNS route
cloudflared tunnel route dns ibkr-broker ibkr-broker.yourdomain.com

# Start tunnel as a service
brew services start cloudflared

# Verify
brew services list | grep cloudflared
curl -s https://ibkr-broker.yourdomain.com/ | jq .
```

---

## Step 5: Set Up Cloudflare Access (Security)

### In Cloudflare Dashboard:

1. Go to **Zero Trust → Access → Applications**
2. Click **Add an application**
3. Select **Self-hosted**
4. Configure:
   - **Application name**: `IBKR Broker Service`
   - **Application domain**: `ibkr-broker.yourdomain.com`
   - **Session duration**: `24 hours`
5. Create a **Service Token** policy:
   - Go to **Access → Service Auth → Service Tokens**
   - Click **Create Service Token**
   - Name: `SAS Worker`
   - Copy **Client ID** and **Client Secret** (you'll need these next)

---

## Step 6: Update Worker Configuration

### In your project, edit `apps/worker/wrangler.toml`:

```toml
[env.production]
vars = { 
  IBKR_BROKER_BASE = "https://ibkr-broker.yourdomain.com",
  TRADING_MODE = "paper",
  # ... other vars
}

[env.production.vars]
CF_ACCESS_CLIENT_ID = "your-service-token-client-id"
CF_ACCESS_CLIENT_SECRET = "your-service-token-client-secret"
```

### Deploy Worker:

```bash
cd /Users/kevinmcgovern/sas
wrangler deploy
```

---

## Step 7: Test End-to-End

```bash
# Set your Worker URL
export W=https://sas-worker.kevin-mcgovern.workers.dev

# Test account
curl -s $W/api/broker/account | jq .

# Test quote
curl -s -X POST $W/api/broker/quote \
  -H 'content-type: application/json' \
  -d '{"symbol":"AAPL"}' | jq .

# Test positions
curl -s $W/api/broker/positions | jq .

# Test Web UI
open https://sas-web.pages.dev/positions
```

**Expected**: All endpoints return data, no errors.

---

## Operational Tips

### Monitor Service Health

```bash
# Check if service is running
launchctl list | grep ibkr

# View logs
tail -f ~/ibkr-broker/broker.out.log
tail -f ~/ibkr-broker/broker.err.log

# Restart service
launchctl stop com.ibkr.broker
launchctl start com.ibkr.broker

# Or reload config after changes
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
```

### Auto-Start IB Gateway

1. Open **System Settings → Users & Groups → Login Items**
2. Add **IB Gateway** to login items
3. Gateway will launch on Mac mini boot

**Alternative**: Use launchd to start Gateway (see `ADVANCED.md`)

### Switch to Real-Time Data (After Subscription)

```bash
# Edit the plist
nano ~/Library/LaunchAgents/com.ibkr.broker.plist

# Change IB_MKT_DATA_TYPE from 3 to 1:
<key>IB_MKT_DATA_TYPE</key><string>1</string>

# Reload
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
```

### Daily Health Checks (Optional)

Create a simple health check script:

```bash
#!/bin/bash
# ~/ibkr-broker/health_check.sh

curl -sf http://127.0.0.1:8081/ > /dev/null
if [ $? -ne 0 ]; then
  echo "$(date): Service unhealthy, restarting..." >> ~/ibkr-broker/health.log
  launchctl stop com.ibkr.broker
  launchctl start com.ibkr.broker
fi
```

Add to crontab:
```bash
# Run every 5 minutes
*/5 * * * * bash ~/ibkr-broker/health_check.sh
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
cat ~/ibkr-broker/broker.err.log

# Common issues:
# 1. IB Gateway not running → start it
# 2. Port 7497 already in use → check client IDs
# 3. Python path wrong → update run.sh with absolute path
```

### Cloudflare Tunnel Not Working

```bash
# Check tunnel status
cloudflared tunnel info ibkr-broker

# Check tunnel logs
tail -f /usr/local/var/log/cloudflared.log

# Restart tunnel
brew services restart cloudflared
```

### Access Denied from Worker

- Verify service token is correct in `wrangler.toml`
- Check Cloudflare Access policy includes service tokens
- Ensure headers are being sent in Worker proxy (see `apps/worker/src/routes/ibkr.ts`)

### IB Gateway Connection Errors

```bash
# Test direct connection
python3 -c "
from ib_insync import IB
ib = IB()
try:
    ib.connect('127.0.0.1', 7497, clientId=19)
    print('✓ Connected')
    ib.disconnect()
except Exception as e:
    print(f'✗ Error: {e}')
"
```

---

## Success Criteria

- [ ] IB Gateway launches on Mac mini boot
- [ ] IBKR broker service auto-starts via launchd
- [ ] Cloudflare Tunnel is running and accessible
- [ ] Worker can reach broker service via tunnel
- [ ] Pages UI shows positions/account data
- [ ] No laptop required for operation

---

## Next Steps

1. ✅ Complete this setup
2. Monitor for 24 hours to ensure stability
3. On Nov 1st, switch to real-time data (see above)
4. Set up alerts for service downtime (optional)
5. Add backup/failover (optional)

---

**You now have a production-ready, always-on IBKR bridge!** 🎉

