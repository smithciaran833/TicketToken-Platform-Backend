#!/usr/bin/env bash
set -euo pipefail
declare -A PORTS=(
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

for svc in "${!PORTS[@]}"; do
  port="${PORTS[$svc]}"
  url="http://localhost:${port}/health"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  printf "%-20s %-6s %s\n" "$svc" "$port" "${code}"
done

echo
echo "gateway routing sanity:"
curl -s http://localhost:3000/health || true
# add your real routes here once the services are up:
# curl -s http://localhost:3000/venues | head || true
