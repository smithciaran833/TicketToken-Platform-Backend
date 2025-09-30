#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# detect compose command
if docker compose version >/dev/null 2>&1; then
  DOCKER="docker compose"
elif docker-compose version >/dev/null 2>&1; then
  DOCKER="docker-compose"
else
  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

echo "== bringing up infra (postgres, redis, rabbitmq) with: $DOCKER =="
$DOCKER up -d

wait_port() {
  local host="$1" port="$2" label="${3:-$port}"
  printf "waiting for %-10s on %s:%s " "$label" "$host" "$port"
  for i in {1..60}; do
    (echo > /dev/tcp/$host/$port) >/dev/null 2>&1 && { echo "ok"; return 0; }
    sleep 1
  done
  echo "timeout"; return 1
}

wait_port 127.0.0.1 5432 postgres
wait_port 127.0.0.1 6379 redis
wait_port 127.0.0.1 5672 rabbitmq
echo "infra is up."
