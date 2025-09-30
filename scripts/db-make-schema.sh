#!/usr/bin/env bash
set -euo pipefail
if docker compose version >/dev/null 2>&1; then DOCKER="docker compose"; else DOCKER="docker-compose"; fi
PG_SVC="$($DOCKER ps --services | grep -E '^(postgres|db)$' | head -n1)"
SCHEMA="${1:?usage: db-make-schema <schema_name>}"
$DOCKER exec -T "$PG_SVC" psql -U postgres -d tickettoken_db -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS \"$SCHEMA\";"
echo "created (or already existed): $SCHEMA"
