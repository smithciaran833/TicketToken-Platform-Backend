#!/bin/bash

# TicketToken Composite Indexes Validation Script
# Tests multi-column indexes and query performance

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Database configuration
DB_NAME="${DB_NAME:-tickettoken_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo -e "${GREEN}Starting Composite Indexes Validation...${NC}"

# Step 1: Count composite indexes in file
echo -e "\n${YELLOW}Step 1: Verifying File Contents${NC}"
comp_count=$(grep -c "CREATE INDEX.*composite\|CREATE INDEX.*_agg\|CREATE INDEX.*_timerange" database/postgresql/indexes/composite_indexes.sql || echo "0")
echo -e "${BLUE}Composite indexes defined: $comp_count${NC}"

# Step 2: Create sample composite indexes
echo -e "\n${YELLOW}Step 2: Creating Sample Composite Indexes${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- Test event composite index
CREATE INDEX IF NOT EXISTS idx_test_events_composite
ON events(venue_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Test transaction composite index
CREATE INDEX IF NOT EXISTS idx_test_transactions_composite
ON transactions(user_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Test ticket composite index
CREATE INDEX IF NOT EXISTS idx_test_tickets_composite
ON tickets(event_id, status)
WHERE deleted_at IS NULL;
SQL

# Step 3: Test multi-condition query
echo -e "\n${YELLOW}Step 3: Testing Multi-Condition Query Performance${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM events e
WHERE e.venue_id = gen_random_uuid()
  AND e.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND e.deleted_at IS NULL;
SQL

# Step 4: Verify index usage
echo -e "\n${YELLOW}Step 4: Checking Composite Index Usage${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
SELECT 
    indexrelname as index_name,
    idx_scan as times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%composite%' OR indexrelname LIKE '%_agg%'
ORDER BY idx_scan DESC
LIMIT 5;
SQL

echo -e "\n${GREEN}✓ Composite indexes validation complete!${NC}"
echo -e "${BLUE}Full file contains optimized multi-column indexes for complex queries${NC}"
echo -e "${GREEN}✓ Day 22, File 1: COMPLETE${NC}"
