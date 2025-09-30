#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICES_DIR="$ROOT/backend/services"
GATEWAY_DIR="$SERVICES_DIR/api-gateway"
TS="$(date +%Y%m%d_%H%M%S)"

declare -A TARGET=(
  [api-gateway]=3000
  [auth-service]=3001
  [venue-service]=3002
  [event-service]=3003
  [ticket-service]=3004
  [payment-service]=3005
  [marketplace-service]=3006
  [analytics-service]=3007
  [notification-service]=3008
  [integration-service]=3009
  [compliance-service]=3010
  [queue-service]=3011
  [search-service]=3012
  [file-service]=3013
  [monitoring-service]=3014
  [blockchain-service]=3015
  [order-service]=3016
)

backup_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  cp -p "$f" "${f}.bak_${TS}"
}

set_env_kv() {
  # ensure KEY=VAL exists or is replaced in the given env file
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    sed -i "s|^[[:space:]]*${key}=.*|${key}=${val}|g" "$file"
  else
    printf "%s=%s\n" "$key" "$val" >> "$file"
  fi
}

echo "== Applying standard ports (safe; creates .bak_${TS}) =="
echo "repo: $ROOT"
echo

# 1) Set PORT in each service .env
for svc in "${!TARGET[@]}"; do
  dir="$SERVICES_DIR/$svc"
  [[ -d "$dir" ]] || { echo "skip: $svc (no dir)"; continue; }
  envfile="$dir/.env"
  [[ -f "$dir/.env.local" ]] && envfile="$dir/.env.local"  # prefer local if present
  backup_file "$envfile"
  set_env_kv "$envfile" PORT "${TARGET[$svc]}"
  echo "set PORT=${TARGET[$svc]} in $svc -> $(realpath --relative-to="$ROOT" "$envfile")"
done

# 2) Fix api-gateway upstream URLs if env exists
gw_env=""
for cand in "$GATEWAY_DIR/.env" "$GATEWAY_DIR/.env.local" "$GATEWAY_DIR/.env.example"; do
  [[ -f "$cand" ]] && gw_env="$cand" && break
done

if [[ -n "$gw_env" ]]; then
  echo
  echo "Fixing api-gateway upstream URLs in $(realpath --relative-to="$ROOT" "$gw_env")"
  backup_file "$gw_env"

  # helper to map service name to KEY prefix
  set_url() {
    local svc="$1" key="$2"
    local port="${TARGET[$svc]}"
    set_env_kv "$gw_env" "${key}_SERVICE_URL" "http://localhost:${port}"
    echo "  ${key}_SERVICE_URL -> :${port}"
  }

  set_url auth-service         AUTH
  set_url venue-service        VENUE
  set_url event-service        EVENT
  set_url ticket-service       TICKET
  set_url payment-service      PAYMENT
  set_url marketplace-service  MARKETPLACE
  set_url analytics-service    ANALYTICS
  set_url notification-service NOTIFICATION
  set_url integration-service  INTEGRATION
  set_url compliance-service   COMPLIANCE
  set_url queue-service        QUEUE
  set_url search-service       SEARCH
  set_url file-service         FILE
  set_url monitoring-service   MONITORING
  # optional:
  set_url blockchain-service   BLOCKCHAIN
  set_url order-service        ORDER
else
  echo "api-gateway env not found; skipping URL fix."
fi

echo
echo "Done. Backups created with suffix .bak_${TS}"
echo "Tip: re-run ./scripts/verify-config.sh to confirm."
