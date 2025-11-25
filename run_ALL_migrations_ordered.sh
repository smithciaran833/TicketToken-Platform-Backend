#!/bin/bash

echo "=== Running Migrations on ALL Services (ORDERED) ==="
echo ""

# ORDER MATTERS - dependencies first!
SERVICES=(
  "auth-service"           # Creates users, tenants - MUST BE FIRST
  "venue-service"          # Creates venues
  "event-service"          # Creates events
  "ticket-service"         # References events
  "order-service"          # References users, tickets
  "payment-service"        # References orders, users
  "marketplace-service"    # References venues, users
  "file-service"
  "notification-service"
  "analytics-service"
  "compliance-service"
  "integration-service"
  "minting-service"
  "blockchain-indexer"
  "blockchain-service"
  "monitoring-service"
  "queue-service"
  "scanning-service"
  "search-service"
  "transfer-service"
)

for SERVICE in "${SERVICES[@]}"; do
  echo "--- $SERVICE ---"
  cd "./backend/services/$SERVICE" || continue
  
  if [ -f "knexfile.ts" ]; then
    npx knex migrate:latest --knexfile knexfile.ts
  elif [ -f "knexfile.js" ]; then
    npx knex migrate:latest --knexfile knexfile.js
  else
    echo "⚠️  No knexfile found, skipping"
  fi
  
  echo ""
  cd - > /dev/null || exit
done

echo "=== All migrations complete! ==="
echo "Checking table count..."
docker exec tickettoken-postgres psql -U postgres -d tickettoken_db -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
