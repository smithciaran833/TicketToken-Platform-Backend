#!/usr/bin/env bash
set -euo pipefail

C=(tickettoken-postgres tickettoken-redis tickettoken-rabbitmq)
echo "stopping/removing: ${C[*]} (containers only, volumes untouched)"
for name in "${C[@]}"; do
  docker rm -f "$name" >/dev/null 2>&1 || true
done
echo "done."

echo
echo "verifying ports are free:"
ss -ltnp | egrep ':5432|:6379|:5672' || echo "  all clear"
