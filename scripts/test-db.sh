#!/bin/bash

set -e

# Configuration
DB_HOST="${TEST_DB_HOST:-localhost}"
DB_PORT="${TEST_DB_PORT:-5432}"
DB_NAME="${TEST_DB_NAME:-tickettoken_test}"
DB_USER="${TEST_DB_USER:-postgres}"
DB_PASSWORD="${TEST_DB_PASSWORD:-postgres}"

SERVICES_DIR="backend/services"

# Migration order (dependencies respected)
SERVICES=(
  "auth-service"
  "venue-service"
  "event-service"
  "ticket-service"
  "order-service"
  "payment-service"
  "marketplace-service"
  "compliance-service"
  "integration-service"
  "search-service"
  "scanning-service"
  "analytics-service"
  "transfer-service"
  "minting-service"
  "blockchain-service"
  "blockchain-indexer"
  "notification-service"
  "file-service"
  "monitoring-service"
  "queue-service"
)

export PGPASSWORD="$DB_PASSWORD"

psql_cmd() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -q -t -c "$1"
}

psql_db() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q -t -c "$1"
}

up() {
  echo "🚀 Creating test database..."
  
  # Create database if not exists
  if psql_cmd "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    echo "Database $DB_NAME already exists"
  else
    psql_cmd "CREATE DATABASE $DB_NAME"
    echo "Created database $DB_NAME"
  fi

  echo "📦 Running migrations..."
  
  for service in "${SERVICES[@]}"; do
    echo "  → $service"
    cd "$SERVICES_DIR/$service"
    npx knex migrate:latest --env test --quiet 2>/dev/null || npx knex migrate:latest --env test
    cd - > /dev/null
  done

  echo "✅ Test database ready"
}

down() {
  echo "🗑️  Dropping test database..."
  
  # Terminate connections
  psql_cmd "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true
  
  # Drop database
  psql_cmd "DROP DATABASE IF EXISTS $DB_NAME"
  
  echo "✅ Test database dropped"
}

reset() {
  echo "🔄 Resetting test database..."
  down
  up
}

status() {
  echo "📊 Migration status for $DB_NAME"
  echo ""
  
  if ! psql_cmd "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    echo "Database does not exist"
    exit 1
  fi

  for service in "${SERVICES[@]}"; do
    table_name=$(grep -h "tableName:" "$SERVICES_DIR/$service/knexfile.ts" 2>/dev/null | head -1 | sed "s/.*'\(.*\)'.*/\1/")
    if [ -n "$table_name" ]; then
      count=$(psql_db "SELECT COUNT(*) FROM $table_name" 2>/dev/null | tr -d ' ' || echo "0")
      printf "  %-25s %s migrations\n" "$service:" "$count"
    fi
  done
}

# Main
case "${1:-}" in
  up)     up ;;
  down)   down ;;
  reset)  reset ;;
  status) status ;;
  *)
    echo "Usage: $0 {up|down|reset|status}"
    echo ""
    echo "  up     - Create database and run all migrations"
    echo "  down   - Drop the test database"
    echo "  reset  - Drop and recreate (clean slate)"
    echo "  status - Show migration count per service"
    exit 1
    ;;
esac
