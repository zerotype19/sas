# IBKR Broker Service - Quick Reference Card

## 🚀 Setup (First Time)

```bash
cd /Users/kevinmcgovern/sas/services/ibkr-broker

# 1. Set up service
bash setup_mac_mini.sh

# 2. Set up tunnel
bash deploy_tunnel.sh

# 3. Deploy Worker
cd /Users/kevinmcgovern/sas
wrangler deploy --env production
```

---

## 🔍 Check Status

```bash
# Service status
launchctl list | grep ibkr

# Port check
lsof -i :8081 -sTCP:LISTEN

# IB Gateway
lsof -i :7497 -sTCP:LISTEN

# Tunnel
brew services list | grep cloudflared

# Health check
curl http://127.0.0.1:8081/
```

---

## 🔄 Restart Services

```bash
# IBKR Broker
launchctl stop com.ibkr.broker && launchctl start com.ibkr.broker

# Tunnel
brew services restart cloudflared

# Both
launchctl stop com.ibkr.broker && brew services stop cloudflared && sleep 3 && launchctl start com.ibkr.broker && brew services start cloudflared
```

---

## 📊 View Logs

```bash
# Service output
tail -f ~/ibkr-broker/broker.out.log

# Service errors
tail -f ~/ibkr-broker/broker.err.log

# Tunnel logs
tail -f /usr/local/var/log/cloudflared.log

# Last 50 lines
tail -50 ~/ibkr-broker/broker.out.log
```

---

## 🧪 Test Endpoints

```bash
# Local tests
curl http://127.0.0.1:8081/ | jq .
curl http://127.0.0.1:8081/account | jq .
curl -X POST http://127.0.0.1:8081/quote -H 'content-type: application/json' -d '{"symbol":"AAPL"}' | jq .

# Production tests (through Worker)
export W=https://sas-worker.kevin-mcgovern.workers.dev
curl $W/broker/account | jq .
curl -X POST $W/broker/quote -H 'content-type: application/json' -d '{"symbol":"AAPL"}' | jq .
curl $W/broker/positions | jq .
```

---

## ⚙️ Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| Service config | `~/ibkr-broker/run.sh` | Service startup script |
| launchd plist | `~/Library/LaunchAgents/com.ibkr.broker.plist` | Auto-start config |
| Tunnel config | `~/.cloudflared/config.yml` | Tunnel settings |
| Worker config | `apps/worker/wrangler.toml` | Worker environment |

---

## 🔐 Environment Variables

Edit `~/Library/LaunchAgents/com.ibkr.broker.plist`:

| Variable | Default | Description |
|----------|---------|-------------|
| `IB_HOST` | `127.0.0.1` | IB Gateway host |
| `IB_PORT` | `7497` | IB Gateway port (7497=paper, 7496=live) |
| `IB_CLIENT_ID` | `20` | Client ID for connection |
| `IB_MKT_DATA_TYPE` | `3` | Market data type (1=real-time, 3=delayed) |

After editing, reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
```

---

## 🚨 Troubleshooting Commands

```bash
# Service won't start
cat ~/ibkr-broker/broker.err.log

# Port conflict
lsof -i :8081

# Test IB Gateway connection
python3 -c "from ib_insync import IB; ib=IB(); ib.connect('127.0.0.1',7497,19); print('OK'); ib.disconnect()"

# Tunnel not working
cloudflared tunnel info ibkr-broker
dig ibkr-broker.yourdomain.com

# Full service restart
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
```

---

## 📱 Common Tasks

### Switch to Real-Time Data

```bash
nano ~/Library/LaunchAgents/com.ibkr.broker.plist
# Change: <string>3</string> to <string>1</string>
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
launchctl load ~/Library/LaunchAgents/com.ibkr.broker.plist
```

### Update Service Code

```bash
cd /Users/kevinmcgovern/sas/services/ibkr-broker
cp app/main.py ~/ibkr-broker/app/
launchctl stop com.ibkr.broker && launchctl start com.ibkr.broker
```

### Re-run Setup

```bash
cd /Users/kevinmcgovern/sas/services/ibkr-broker
launchctl unload ~/Library/LaunchAgents/com.ibkr.broker.plist
bash setup_mac_mini.sh
```

---

## 🔗 Useful URLs

| Service | URL |
|---------|-----|
| Local broker | http://127.0.0.1:8081 |
| Tunnel | https://ibkr-broker.yourdomain.com |
| Worker | https://sas-worker.kevin-mcgovern.workers.dev |
| Web UI | https://sas-web.pages.dev |
| Cloudflare Dashboard | https://dash.cloudflare.com |
| Zero Trust | https://one.dash.cloudflare.com |

---

## 📞 Support

For detailed guides:
- Setup: `MAC_MINI_SETUP.md`
- Deployment: `MAC_MINI_DEPLOYMENT.md`
- Testing: `test_mac_mini.sh`
- IB Gateway: `IBKR_QUICKSTART.md`

