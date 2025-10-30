# Mac mini 24/7 Deployment Guide

> Complete guide to deploying the SAS system with your Mac mini as the IBKR bridge

---

## 🎯 Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                          │
│                                                               │
│  ┌────────────────┐              ┌─────────────────┐         │
│  │  Pages (Web UI) │              │  Worker (API)   │         │
│  │  sas-web       │─────────────▶│  sas-worker     │         │
│  └────────────────┘              └─────────────────┘         │
│                                           │                   │
│                                           │ HTTPS             │
│                                           │ (via Tunnel)      │
└───────────────────────────────────────────┼───────────────────┘
                                            │
                                            ▼
                                  ┌─────────────────┐
                                  │ Cloudflare      │
                                  │ Tunnel          │
                                  │ (Access)        │
                                  └─────────────────┘
                                            │
                                            │ Private
                                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      Mac mini (Your Home)                     │
│                                                               │
│  ┌────────────────┐              ┌─────────────────┐         │
│  │  IBKR Broker   │◀────────────▶│  IB Gateway     │         │
│  │  FastAPI       │              │  (Paper/Live)   │         │
│  │  :8081         │              │  :7497          │         │
│  └────────────────┘              └─────────────────┘         │
│         │                                  │                  │
│         │ launchd                          │ Login Items      │
│         │ (auto-start)                     │ (auto-start)     │
│         ▼                                  ▼                  │
│    Always running                    Always running           │
└──────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

### On Mac mini:
- [ ] macOS with Homebrew installed
- [ ] IB Gateway (Paper) installed and configured
- [ ] Python 3.9+ installed (`python3 --version`)
- [ ] Network connectivity (stable home internet)

### On Cloudflare:
- [ ] Cloudflare account with domain
- [ ] Worker deployed (`sas-worker`)
- [ ] Pages deployed (`sas-web`)

---

## 🚀 Quick Start (3 Steps)

### Step 1: Set up IBKR Broker Service

```bash
# On your Mac mini
cd /Users/kevinmcgovern/sas/services/ibkr-broker
bash setup_mac_mini.sh
```

This script will:
- Create Python virtual environment
- Install dependencies (FastAPI, ib_insync)
- Test IB Gateway connection
- Set up launchd service (auto-start on boot)
- Start the service

**Expected output:**
```
✅ IBKR Broker Service Setup Complete!
   Service running on http://127.0.0.1:8081
```

### Step 2: Set up Cloudflare Tunnel

```bash
# On your Mac mini
cd /Users/kevinmcgovern/sas/services/ibkr-broker
bash deploy_tunnel.sh
```

This script will:
- Install `cloudflared`
- Authenticate with Cloudflare
- Create tunnel (`ibkr-broker`)
- Configure DNS route
- Start tunnel service

**You'll need:** Your domain name (e.g., `example.com`)

**Expected output:**
```
✅ Cloudflare Tunnel Setup Complete!
   Hostname: https://ibkr-broker.example.com
```

### Step 3: Configure & Deploy Worker

```bash
# On your development machine (or Mac mini)
cd /Users/kevinmcgovern/sas

# Edit wrangler.toml - update production env
nano apps/worker/wrangler.toml
# Change: IBKR_BROKER_BASE = "https://ibkr-broker.YOUR-DOMAIN.com"

# Deploy to production
wrangler deploy --env production

# Test
curl https://sas-worker.kevin-mcgovern.workers.dev/broker/account
```

---

## 🔐 Security: Cloudflare Access (Recommended)

### Why?
Without Cloudflare Access, anyone with your tunnel URL can access the IBKR broker service.

### Setup:

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access → Applications**
3. Click **Add an application**
4. Select **Self-hosted**
5. Configure:
   - **Application name**: IBKR Broker Service
   - **Application domain**: `ibkr-broker.yourdomain.com`
   - **Session duration**: 24 hours
6. Create **Access Policy**:
   - **Policy name**: SAS Worker
   - **Action**: Service Auth
   - Click **Add include** → **Service Token**
   - Create a new service token
7. Copy **Client ID** and **Client Secret**

### Configure Worker:

```bash
# Set secrets for production environment
wrangler secret put CF_ACCESS_CLIENT_ID --env production
# Paste: your-client-id

wrangler secret put CF_ACCESS_CLIENT_SECRET --env production
# Paste: your-client-secret

# Redeploy
wrangler deploy --env production
```

---

## 🧪 Testing

### Local Testing (Mac mini)

```bash
cd /Users/kevinmcgovern/sas/services/ibkr-broker
bash test_mac_mini.sh
```

**Expected results:**
- ✓ Service is loaded in launchd
- ✓ Service is listening on port 8081
- ✓ IB Gateway is listening on port 7497
- ✓ All endpoints responding

### End-to-End Testing (Production)

```bash
# Set your Worker URL
export W=https://sas-worker.kevin-mcgovern.workers.dev

# Test account
curl -s $W/broker/account | jq .

# Test quote
curl -s -X POST $W/broker/quote \
  -H 'content-type: application/json' \
  -d '{"symbol":"AAPL"}' | jq .

# Test positions
curl -s $W/broker/positions | jq .

# Test Web UI
open https://sas-web.pages.dev/positions
```

---

## 🔧 Operations

### Monitor Service Health

```bash
# Check if services are running
launchctl list | grep ibkr
brew services list | grep cloudflared

# View logs
tail -f ~/ibkr-broker/broker.out.log
tail -f ~/ibkr-broker/broker.err.log
tail -f /usr/local/var/log/cloudflared.log
```

### Restart Services

```bash
# Restart IBKR broker
launchctl stop com.ibkr.broker
launchctl start com.ibkr.broker

# Restart tunnel
brew services restart cloudflared
```

### Service Status Dashboard

Create a simple health check:

```bash
#!/bin/bash
# ~/ibkr-broker/status.sh

echo "=== IBKR Broker Status ==="
echo ""
echo "Service:"
launchctl list | grep ibkr && echo "  ✓ Running" || echo "  ✗ Not running"

echo ""
echo "Port 8081:"
lsof -i :8081 -sTCP:LISTEN > /dev/null && echo "  ✓ Listening" || echo "  ✗ Not listening"

echo ""
echo "IB Gateway:"
lsof -i :7497 -sTCP:LISTEN > /dev/null && echo "  ✓ Connected" || echo "  ✗ Not connected"

echo ""
echo "Tunnel:"
brew services list | grep cloudflared | grep started > /dev/null && echo "  ✓ Running" || echo "  ✗ Not running"

echo ""
echo "Health Check:"
curl -sf http://127.0.0.1:8081/ > /dev/null && echo "  ✓ Healthy" || echo "  ✗ Unhealthy"
```

### Auto-Recovery Script

```bash
#!/bin/bash
# ~/ibkr-broker/health_check.sh
# Add to crontab: */5 * * * * bash ~/ibkr-broker/health_check.sh

LOG="$HOME/ibkr-broker/health.log"

# Check if service is responding
if ! curl -sf http://127.0.0.1:8081/ > /dev/null; then
  echo "$(date): Service unhealthy, restarting..." >> "$LOG"
  launchctl stop com.ibkr.broker
  launchctl start com.ibkr.broker
  
  # Wait and test again
  sleep 5
  if curl -sf http://127.0.0.1:8081/ > /dev/null; then
    echo "$(date): Service recovered" >> "$LOG"
  else
    echo "$(date): Service failed to recover" >> "$LOG"
  fi
fi
```

---

## 🔄 Switching to Real-Time Data

When your market data subscription starts (Nov 1st):

```bash
# Edit launchd plist
nano ~/Library/LaunchAgents/com.ibkr.broker.plist

# Change line:
<key>IB_MKT_DATA_TYPE</key><string>3</string>
# To:
<key>IB_MKT_DATA_TYPE</key><string>1</string>

# Reload service
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist

# Verify
tail -f ~/ibkr-broker/broker.out.log
# Should show: IB_MKT_DATA_TYPE: 1 (1=real-time, 3=delayed)
```

---

## 🚨 Troubleshooting

### Service won't start

```bash
# Check logs
cat ~/ibkr-broker/broker.err.log

# Common issues:
# 1. IB Gateway not running → start it
# 2. Port conflict → check: lsof -i :8081
# 3. Python path wrong → check: which python3
```

### Tunnel not working

```bash
# Check tunnel status
cloudflared tunnel info ibkr-broker

# Check if DNS is resolving
dig ibkr-broker.yourdomain.com

# Check tunnel logs
tail -f /usr/local/var/log/cloudflared.log

# Restart tunnel
brew services restart cloudflared
```

### Worker can't reach tunnel

```bash
# Test tunnel directly
curl https://ibkr-broker.yourdomain.com/

# If 403 error → Cloudflare Access is enabled
# Make sure CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are set

# Check Worker config
wrangler secret list --env production

# Should show:
# - CF_ACCESS_CLIENT_ID
# - CF_ACCESS_CLIENT_SECRET
# - TELEGRAM_BOT_TOKEN
# - TELEGRAM_CHAT_ID
```

### IB Gateway connection issues

```bash
# Test direct connection
python3 - <<'PY'
from ib_insync import IB
ib = IB()
try:
    ib.connect('127.0.0.1', 7497, clientId=999)
    print('✓ Connected')
    ib.disconnect()
except Exception as e:
    print(f'✗ Error: {e}')
PY

# If error:
# - Check IB Gateway is running
# - Check API settings (Configure → API → Settings)
# - Enable ActiveX and Socket Clients
# - Port 7497 (paper) or 7496 (live)
# - Trusted IPs: 127.0.0.1
```

---

## 📊 Success Criteria

- [ ] Mac mini IBKR broker service running on port 8081
- [ ] Cloudflare Tunnel established and accessible
- [ ] Worker deployed to production environment
- [ ] Worker can reach broker service via tunnel
- [ ] Pages UI shows positions and account data
- [ ] Services auto-start on Mac mini reboot
- [ ] No laptop required for operation

---

## 🔄 Maintenance Checklist

### Daily
- [ ] Check service status (use `status.sh`)
- [ ] Review logs for errors

### Weekly
- [ ] Verify tunnel is running
- [ ] Check disk space on Mac mini
- [ ] Test end-to-end flow (quote → order → position)

### Monthly
- [ ] Review and rotate logs
- [ ] Update dependencies if needed
- [ ] Test disaster recovery (restart services)

---

## 🆘 Emergency Procedures

### Service Down

```bash
# Quick restart everything
launchctl stop com.ibkr.broker
brew services stop cloudflared
sleep 5
launchctl start com.ibkr.broker
brew services start cloudflared

# Wait 10 seconds and test
sleep 10
curl http://127.0.0.1:8081/
```

### Mac mini Reboot

Both services should auto-start. If not:

```bash
# Start IBKR broker
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl start com.ibkr.broker

# Start tunnel
brew services start cloudflared

# Start IB Gateway manually if needed
# (Add to Login Items in System Settings)
```

---

## 📚 Additional Documentation

- **IB Gateway Configuration**: `IBKR_QUICKSTART.md`
- **Detailed Setup**: `MAC_MINI_SETUP.md`
- **API Documentation**: `PROJECT_SUMMARY.md`
- **Testing Guide**: `TESTING.md`

---

## 🎉 You're All Set!

Your Mac mini is now a production-ready IBKR bridge:
- ✅ Always-on service (auto-restart on boot)
- ✅ Secure tunnel (protected by Cloudflare Access)
- ✅ Full API access from Worker/Pages
- ✅ No laptop dependency

**Next Steps:**
1. Monitor for 24 hours to ensure stability
2. On Nov 1st, switch to real-time data
3. Set up alerting for service downtime (optional)
4. Configure backups (optional)

**Questions?** Check the logs or test with the provided scripts!

