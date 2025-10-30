#!/usr/bin/env bash
set -euo pipefail

# Install/refresh LaunchAgents for broker and cloudflared

BROKER_PLIST_SRC="$(cd "$(dirname "$0")/.." && pwd)/services/ibkr-broker/com.ibkr.broker.plist"
BROKER_PLIST_DEST="$HOME/Library/LaunchAgents/com.ibkr.broker.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" "$HOME/.cloudflared"

cp -f "$BROKER_PLIST_SRC" "$BROKER_PLIST_DEST"

# Cloudflared LaunchAgent (uses installed path detection)
CF_PLIST="$HOME/Library/LaunchAgents/com.gekkoworks.cloudflared.ibkr-broker.plist"
CF_BIN="/usr/local/bin/cloudflared"
if command -v /opt/homebrew/bin/cloudflared >/dev/null 2>&1; then
  CF_BIN="/opt/homebrew/bin/cloudflared"
elif command -v /usr/local/bin/cloudflared >/dev/null 2>&1; then
  CF_BIN="/usr/local/bin/cloudflared"
fi

cat > "$CF_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.gekkoworks.cloudflared.ibkr-broker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$CF_BIN</string>
    <string>tunnel</string>
    <string>run</string>
    <string>ibkr-broker</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/cloudflared.ibkr-broker.out.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/cloudflared.ibkr-broker.err.log</string>
  </dict>
</plist>
PLIST

launchctl unload "$BROKER_PLIST_DEST" 2>/dev/null || true
launchctl load -w "$BROKER_PLIST_DEST"

launchctl unload "$CF_PLIST" 2>/dev/null || true
launchctl load -w "$CF_PLIST"

echo "✓ LaunchAgents installed and loaded"

