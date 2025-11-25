#!/bin/bash

echo "=== Running Migrations on ALL 20 Services ==="
echo ""

SERVICES=(
  "analytics-service"
  "auth-service"
  "blockchain-indexer"
  "blockchain-service"
  "compliance-service"
  "event-service"
  "file-service"
  "integration-service"
  "marketplace-service"
  "minting-service"
  "monitoring-service"
  "notification-service"
  "order-service"
  "payment-service"
  "queue-service"
  "scanning-service"
  "search-service"
  "ticket-service"
  "transfer-service"
  "venue-service"
)

for SERVICE in "${SERVICES[@]}"; do
  echo "--- $SERVICE ---"
  cd "./backend/services/$SERVICE" || exit
  npm run migrate:latest
  echo ""
  cd - > /dev/null || exit
done

echo "=== All migrations complete! ==="
echo "Checking table count..."
docker exec tickettoken-postgres psql -U postgres -d tickettoken_db -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
