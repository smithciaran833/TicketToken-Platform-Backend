#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# detect compose command
if docker compose version >/dev/null 2>&1; then
  DOCKER="docker compose"
  list_services() { $DOCKER ps --services; }
else
  DOCKER="docker-compose"
  list_services() { $DOCKER config --services; }
fi

PG_SVC="$(list_services | grep -E '^(postgres|db)$' | head -n1 || true)"
[[ -z "$PG_SVC" ]] && { echo "No postgres service found."; exit 1; }

DB="tickettoken_db"
USER="postgres"

# gather applied names if schema_migrations exists
HAS_TABLE="$($DOCKER exec -T "$PG_SVC" bash -lc "psql -At -U $USER -d $DB -c \"select to_regclass('public.schema_migrations') is not null;\"" 2>/dev/null || true)"
if [[ "$HAS_TABLE" == "t" || "$HAS_TABLE" == "true" ]]; then
  mapfile -t APPLIED < <($DOCKER exec -T "$PG_SVC" bash -lc "psql -At -U $USER -d $DB -c \"select name from public.schema_migrations order by version;\"" | sed '/^$/d')
else
  APPLIED=()
fi

in_applied() {
  local f="$1"
  local base="$(basename "$f")"
  for a in "${APPLIED[@]}"; do [[ "$a" == "$base" ]] && return 0; done
  return 1
}

# locate migrations
MIG_DIR=""
for d in database/migrations_reorganized/schema database/migrations_reorganized/features; do
  [[ -d "$d" ]] && MIG_DIR="$d" && break
done
[[ -z "$MIG_DIR" ]] && { echo "No migrations dir found."; exit 1; }

shopt -s nullglob
mapfile -t FILES < <(ls -1 "$MIG_DIR"/*.sql | sort)
[[ ${#FILES[@]} -eq 0 ]] && { echo "No .sql files in $MIG_DIR"; exit 0; }

echo "== applying migrations from $MIG_DIR to DB '$DB' =="
for f in "${FILES[@]}"; do
  base="$(basename "$f")"
  if in_applied "$base"; then
    echo "-- skip $base (already recorded in schema_migrations)"
    continue
  fi
  echo "-- applying $base"
  $DOCKER exec -T "$PG_SVC" bash -lc "psql -v ON_ERROR_STOP=1 -U '$USER' -d '$DB'" < "$f"
done
echo "migrations complete."
