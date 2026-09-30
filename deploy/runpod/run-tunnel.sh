#!/usr/bin/env bash
# Cloudflare Tunnel (supervisord programı). Belirteç .env'deki
# CLOUDFLARE_TUNNEL_TOKEN'dan okunur; komut satırına yazılmaz (ps'te görünmesin).
set -euo pipefail
ENV_FILE=/workspace/pulse-coach/.env
TUNNEL_TOKEN="$(grep -E '^CLOUDFLARE_TUNNEL_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
if [ -z "$TUNNEL_TOKEN" ]; then
  echo "CLOUDFLARE_TUNNEL_TOKEN .env'de yok - tünel başlatılmadı." >&2
  sleep 60
  exit 1
fi
export TUNNEL_TOKEN
exec /workspace/opt/bin/cloudflared tunnel --no-autoupdate run
