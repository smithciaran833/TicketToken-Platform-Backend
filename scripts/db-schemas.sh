#!/usr/bin/env bash
set -euo pipefail
if docker compose version >/dev/null 2>&1; then DOCKER="docker compose"; else DOCKER="docker-compose"; fi
PG_SVC="$($DOCKER ps --services | grep -E '^(postgres|db)$' | head -n1)"
$DOCKER exec -T "$PG_SVC" psql -U postgres -d tickettoken_db -c "select nspname from pg_namespace where nspname !~ '^(pg_|information_schema)$' order by 1;"
