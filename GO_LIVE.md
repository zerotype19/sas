# 🚀 GO LIVE CHECKLIST

## Phase 1: Local Test (5 minutes)

### Step 1: Configure IB Gateway

- [ ] Download & install IB Gateway
- [ ] Login with **Paper Trading** credentials
- [ ] Configuration → API → Settings:
  - [ ] Enable API: ✓
  - [ ] Socket Port: **7497**
  - [ ] Trusted IPs: **127.0.0.1**
  - [ ] Read-Only API: **Uncheck**
- [ ] Click OK, restart if needed

### Step 2: Start IBKR Service

```bash
cd services/ibkr-broker
bash setup.sh    # One-time: installs deps + smoke test
bash run.sh      # Starts service on http://127.0.0.1:8081
```

**Expected output:**
```
Starting IBKR Broker Service...
  IB_HOST: 127.0.0.1
  IB_PORT: 7497
  IB_CLIENT_ID: 19
INFO:     Uvicorn running on http://0.0.0.0:8081
✓ Connected to IB Gateway successfully
```

### Step 3: Test Endpoints

```bash
export W=https://sas-worker.kevin-mcgovern.workers.dev

# Account summary
curl -s $W/broker/account | jq .

# Positions
curl -s $W/broker/positions | jq .

# Quote
curl -s -X POST $W/broker/quote \
  -H 'content-type: application/json' \
  -d '{"symbol":"AAPL"}' | jq .

# Option chain (filtered)
curl -s -X POST $W/broker/optionChain \
  -H 'content-type: application/json' \
  -d '{"symbol":"AAPL","expiry":"2025-12-19","right":"C"}' | jq '.[0:5]'
```

### Success Criteria ✅

- [ ] Account returns `{"accountId":"...", "equity": <number>, ...}`
- [ ] Positions returns array (empty or populated)
- [ ] Quote returns `{"symbol":"AAPL", "bid":..., "ask":..., ...}`
- [ ] Option chain returns array of strikes

### If Errors 🐛

**"Connection refused" / "Service unavailable"**
- Check: Is microservice running? (`bash run.sh`)
- Check: Is IB Gateway logged in and API enabled?
- Test direct: `curl http://localhost:8081/` (should return JSON)

**"No market data permissions"**
- Expected without subscription
- You'll get delayed data (15-min delay)
- Or subscribe in IBKR account settings

**"Pacing violation"**
- Reduce request frequency
- Filter option chains more aggressively

---

## Phase 2: Production VM (30 minutes)

### Step 1: Provision VM

**Recommended:** Ubuntu 22.04, 1 vCPU, 1-2GB RAM

```bash
# After SSH to VM
sudo apt update && sudo apt install -y python3-venv python3-pip
```

### Step 2: Install IB Gateway on VM

1. Download IB Gateway installer
2. Install & configure same as local (port 7497, API enabled)
3. Login with paper trading credentials
4. Test: API should be accessible from `127.0.0.1:7497`

### Step 3: Deploy Microservice

```bash
# Copy service files to VM
scp -r services/ibkr-broker user@vm:/tmp/

# On VM
sudo mkdir -p /opt/ibkr-broker
sudo cp -r /tmp/ibkr-broker/* /opt/ibkr-broker/
cd /opt/ibkr-broker

# Setup
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn[standard] pydantic ib-insync==0.9.86

# Test manually first
bash run.sh
# Should connect to IB Gateway on 127.0.0.1:7497
```

### Step 4: Create Systemd Service

```bash
sudo tee /etc/systemd/system/ibkr-broker.service >/dev/null <<'EOF'
[Unit]
Description=IBKR Broker FastAPI
After=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/ibkr-broker
Environment="PATH=/opt/ibkr-broker/.venv/bin"
ExecStart=/opt/ibkr-broker/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8081
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ibkr-broker
sudo systemctl start ibkr-broker
sudo systemctl status ibkr-broker
```

### Step 5: Setup Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
sudo install -m 755 cloudflared /usr/local/bin/

# Login
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create ibkr-broker

# Configure
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: ibkr-broker
credentials-file: /home/ubuntu/.cloudflared/ibkr-broker.json

ingress:
  - hostname: ibkr-broker.yourdomain.com
    service: http://127.0.0.1:8081
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns ibkr-broker ibkr-broker.yourdomain.com

# Install as service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### Step 6: Setup Cloudflare Access

1. Go to Cloudflare Zero Trust dashboard
2. Access → Applications → Add application
3. Select "Self-hosted"
4. Application name: "IBKR Broker"
5. Subdomain: `ibkr-broker`
6. Create service token:
   - Access → Service Auth → Service Tokens
   - Create token
   - Save Client ID and Secret

### Step 7: Update Worker Configuration

Edit `apps/worker/wrangler.toml`:

```toml
[vars]
IBKR_BROKER_BASE = "https://ibkr-broker.yourdomain.com"
TRADING_MODE = "paper"
CF_ACCESS_CLIENT_ID = "your_service_token_client_id"
CF_ACCESS_CLIENT_SECRET = "your_service_token_secret"
```

**Deploy:**

```bash
cd apps/worker
wrangler deploy
```

### Step 8: Test Production

```bash
export W=https://sas-worker.kevin-mcgovern.workers.dev

# Same tests as Phase 1
curl -s $W/broker/account | jq .
curl -s $W/broker/positions | jq .
curl -s -X POST $W/broker/quote \
  -H 'content-type: application/json' \
  -d '{"symbol":"AAPL"}' | jq .
```

### Success Criteria ✅

- [ ] All endpoints return data (same as local)
- [ ] VM service running: `sudo systemctl status ibkr-broker`
- [ ] Tunnel active: `sudo systemctl status cloudflared`
- [ ] Web UI shows positions: https://sas-web.pages.dev/positions
- [ ] No laptop required (close IB Gateway on laptop)

---

## Phase 3: Go Live (When Ready)

### Prerequisites

- [ ] Tested in paper mode for 1+ week
- [ ] Comfortable with order flow
- [ ] Guardrails tested and adjusted
- [ ] Audit logging reviewed

### Steps

1. **Update IB Gateway** to port **7496** (live)
2. **Update environment** in microservice:
   ```bash
   # On VM, edit run.sh or set in systemd
   export IB_PORT=7496
   ```
3. **Update Worker config**:
   ```toml
   TRADING_MODE = "live"
   ```
4. **Add additional guardrails** in Worker:
   ```typescript
   // In apps/worker/src/routes/ibkr.ts
   // Add symbol whitelist, stricter limits, etc.
   ```
5. **Deploy** and **test with micro orders**
6. **Monitor closely** for first 24 hours

### Live Mode Checklist

- [ ] Symbol whitelist implemented
- [ ] Max notional reduced to conservative amount
- [ ] Alerts configured for all orders
- [ ] Manual approval for orders >$X
- [ ] Daily position reconciliation
- [ ] Stop-loss logic tested

---

## 🐛 Troubleshooting Guide

### Connection Issues

**Error:** `Connection refused` or `Service unavailable (503)`

**Fix:**
```bash
# Check service status
sudo systemctl status ibkr-broker

# Check logs
journalctl -u ibkr-broker -f

# Test direct connection
curl http://localhost:8081/

# Test IB Gateway
lsof -i :7497  # Should show IB Gateway listening
```

### Authentication Issues

**Error:** `403 Forbidden` or `401 Unauthorized`

**Fix:**
```bash
# Verify CF Access headers in Worker
# Check wrangler.toml:
# CF_ACCESS_CLIENT_ID = "..."
# CF_ACCESS_CLIENT_SECRET = "..."

# Test tunnel directly (should require auth)
curl https://ibkr-broker.yourdomain.com/
```

### Market Data Issues

**Error:** `"No market data permissions"`

**This is normal!**
- Without subscription, you get 15-min delayed data
- Sufficient for most use cases
- To get real-time: Subscribe in IBKR account settings

### Rate Limiting

**Error:** `"Pacing violation"`

**Fix:**
- Reduce request frequency
- Cache quotes client-side
- Filter option chains:
  ```json
  {
    "symbol": "AAPL",
    "expiry": "2025-12-19",
    "strike": 150,
    "right": "C"
  }
  ```

### Order Issues

**Error:** Order blocked by Worker

**Expected!** Guardrails working:
- Max quantity: 100 shares
- Max notional: $50,000
- Paper mode enforced

**To adjust:** Edit `apps/worker/src/routes/ibkr.ts`

---

## 📊 Monitoring

### Check Service Health

```bash
# VM service status
sudo systemctl status ibkr-broker

# Worker logs
wrangler tail

# Tunnel status
sudo systemctl status cloudflared
```

### Test Endpoints

```bash
# Quick health check
curl https://sas-worker.kevin-mcgovern.workers.dev/broker

# Full test suite
cd services/ibkr-broker
bash test.sh
```

---

## ✅ Final Checklist

### Phase 1 Complete
- [ ] IB Gateway running locally
- [ ] Microservice running locally
- [ ] All test endpoints returning data
- [ ] Web UI showing IBKR positions

### Phase 2 Complete
- [ ] VM provisioned and configured
- [ ] IB Gateway running on VM
- [ ] Microservice running as systemd service
- [ ] Cloudflare Tunnel active
- [ ] CF Access protecting endpoint
- [ ] Worker updated with tunnel URL
- [ ] All tests passing via production URL
- [ ] Laptop closed, system still works

### Ready for Live
- [ ] Paper mode tested 1+ week
- [ ] All guardrails verified
- [ ] Symbol whitelist implemented
- [ ] Manual approval process defined
- [ ] Monitoring and alerts configured
- [ ] Comfortable with order flow

---

**Current Status:**  
✅ Code deployed  
⏳ Waiting for you to run `bash setup.sh`

**Next Command:**  
```bash
cd services/ibkr-broker && bash setup.sh
```

