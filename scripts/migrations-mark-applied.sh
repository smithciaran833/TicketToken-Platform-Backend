#!/usr/bin/env bash
set -euo pipefail
FILE="${1:?usage: migrations-mark-applied.sh <filename.sql>}"

if docker compose version >/dev/null 2>&1; then DOCKER="docker compose"; else DOCKER="docker-compose"; fi
PG_SVC="$($DOCKER ps --services | grep -E '^(postgres|db)$' | head -n1)"
DB="tickettoken_db"; USER="postgres"

ESC_FILE="${FILE//\'/''}"
NEXT_VER="$($DOCKER exec -T "$PG_SVC" psql -At -U "$USER" -d "$DB" -c "select coalesce(max(version),0)+1 from public.schema_migrations;" | tr -d '\r')"
$DOCKER exec -T "$PG_SVC" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" -c \
  "insert into public.schema_migrations(version,name) values (${NEXT_VER}, '${ESC_FILE}');"

echo "Marked as applied: ${FILE} (version ${NEXT_VER})"
$DOCKER exec -T "$PG_SVC" psql -U "$USER" -d "$DB" -c \
  "select * from public.schema_migrations order by version desc limit 5;"
