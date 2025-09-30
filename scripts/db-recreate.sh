#!/usr/bin/env bash
set -euo pipefail
if docker compose version >/dev/null 2>&1; then DOCKER="docker compose"; else DOCKER="docker-compose"; fi
PG_SVC="$($DOCKER ps --services | grep -E '^(postgres|db)$' | head -n1)"
DB="tickettoken_db"
echo "Dropping and recreating database: $DB (inside container $PG_SVC)"
$DOCKER exec -T "$PG_SVC" bash -lc "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \"DROP DATABASE IF EXISTS $DB WITH (FORCE);\""
$DOCKER exec -T "$PG_SVC" bash -lc "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \"CREATE DATABASE $DB;\""
echo "done."
