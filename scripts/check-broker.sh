#!/usr/bin/env bash
set -euo pipefail

BROKER_OK=0
if curl -fsS --max-time 5 http://127.0.0.1:8081/account >/dev/null; then
  BROKER_OK=1
fi

if [ "$BROKER_OK" -ne 1 ]; then
  launchctl kickstart -k gui/$UID/com.ibkr.broker || true
fi

# Only attempt Access-protected origin check if vars present
if [ -n "${CF_ACCESS_CLIENT_ID:-}" ] && [ -n "${CF_ACCESS_CLIENT_SECRET:-}" ]; then
  if ! curl -fsS --max-time 8 \
    -H "cf-access-client-id: $CF_ACCESS_CLIENT_ID" \
    -H "cf-access-client-secret: $CF_ACCESS_CLIENT_SECRET" \
    https://ibkr-broker.gekkoworks.com/account >/dev/null; then
    launchctl kickstart -k gui/$UID/com.gekkoworks.cloudflared.ibkr-broker || true
  fi
fi

exit 0

