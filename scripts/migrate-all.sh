#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend/services"

DB_NAME="${DB_NAME:-tickettoken_db}"
DB_USER="${DB_USER:-postgres}"

SERVICES=(
  "auth-service"
  "venue-service"
  "event-service"
  "ticket-service"
  "order-service"
  "payment-service"
  "marketplace-service"
  "transfer-service"
  "notification-service"
  "compliance-service"
  "analytics-service"
  "file-service"
  "integration-service"
  "queue-service"
  "blockchain-service"
  "blockchain-indexer"
  "minting-service"
  "monitoring-service"
  "scanning-service"
  "search-service"
)

FAILED=()
SUCCEEDED=()
SKIPPED=()

echo "=========================================="
echo "  TicketToken Platform - Run Migrations"
echo "=========================================="
echo ""

for service in "${SERVICES[@]}"; do
  SERVICE_DIR="$BACKEND_DIR/$service"
  
  if [ ! -d "$SERVICE_DIR" ]; then
    echo -e "${YELLOW}⏭  $service - directory not found${NC}"
    SKIPPED+=("$service")
    continue
  fi
  
  if [ ! -f "$SERVICE_DIR/knexfile.ts" ]; then
    echo -e "${YELLOW}⏭  $service - no knexfile.ts${NC}"
    SKIPPED+=("$service")
    continue
  fi
  
  echo -n "🔄 $service ... "
  
  cd "$SERVICE_DIR"
  
  OUTPUT=$(npx knex migrate:latest --knexfile knexfile.ts 2>&1) || true
  
  if echo "$OUTPUT" | grep -q -E "(Batch [0-9]+ run|Already up to date)"; then
    echo -e "${GREEN}✅${NC}"
    SUCCEEDED+=("$service")
  else
    echo -e "${RED}❌${NC}"
    echo "$OUTPUT" | tail -5
    FAILED+=("$service")
  fi
done

echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo -e "${GREEN}Succeeded: ${#SUCCEEDED[@]}${NC}"
echo -e "${YELLOW}Skipped:   ${#SKIPPED[@]}${NC}"
echo -e "${RED}Failed:    ${#FAILED[@]}${NC}"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Failed:${NC}"
  for svc in "${FAILED[@]}"; do
    echo "  - $svc"
  done
  exit 1
fi

echo ""
echo -e "${GREEN}All migrations completed!${NC}"
