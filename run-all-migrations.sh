#!/bin/bash

export DB_HOST=localhost
export DB_PORT=6432
export DB_NAME=tickettoken_db
export DB_USER=postgres
export DB_PASSWORD=postgres

SERVICES=(
  "auth-service"
  "venue-service"
  "event-service"
  "ticket-service"
  "order-service"
  "payment-service"
  "notification-service"
  "analytics-service"
  "queue-service"
  "scanning-service"
  "blockchain-service"
  "blockchain-indexer"
  "file-service"
  "compliance-service"
  "integration-service"
  "marketplace-service"
  "monitoring-service"
  "minting-service"
  "transfer-service"
  "search-service"
)

for service in "${SERVICES[@]}"; do
  echo "=========================================="
  echo "Running migrations for: $service"
  echo "=========================================="
  cd ~/Desktop/TicketToken-Platform/backend/services/$service
  npm run migrate 2>&1
  echo ""
done

echo "All migrations complete!"
