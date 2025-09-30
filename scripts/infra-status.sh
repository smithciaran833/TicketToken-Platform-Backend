#!/usr/bin/env bash
set -euo pipefail

echo "== docker containers (matching tickettoken*) =="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
  | (head -n1; grep -E '^tickettoken-' || true)

echo
echo "== ports in use on host =="
ss -ltnp | egrep ':5432|:6379|:5672' || true
