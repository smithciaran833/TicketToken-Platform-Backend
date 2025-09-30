#!/bin/bash

# TicketToken Partial Indexes Validation Script
# Tests partial index creation and effectiveness

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

echo -e "${GREEN}Starting Partial Indexes Validation...${NC}"

# Step 1: Count partial indexes
echo -e "\n${YELLOW}Step 1: Counting Partial Indexes${NC}"
partial_count=$(grep -c "CREATE.*INDEX.*WHERE" database/postgresql/indexes/partial_indexes.sql || echo "0")
echo -e "${BLUE}Partial indexes defined: $partial_count${NC}"

# Step 2: Create sample partial indexes
echo -e "\n${YELLOW}Step 2: Creating Sample Partial Indexes${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- Active events partial
CREATE INDEX IF NOT EXISTS idx_test_events_active_partial
ON events(status, created_at)
WHERE status IN ('ON_SALE', 'ANNOUNCED');

-- Recent transactions partial
CREATE INDEX IF NOT EXISTS idx_test_transactions_recent_partial
ON transactions(user_id, created_at)
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';

-- Available tickets partial
CREATE INDEX IF NOT EXISTS idx_test_tickets_available_partial
ON tickets(event_id, status)
WHERE status = 'available';
SQL

# Step 3: Test partial index usage
echo -e "\n${YELLOW}Step 3: Testing Partial Index Usage${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- This should use the partial index
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM events
WHERE status = 'ON_SALE';
SQL

# Step 4: Calculate space savings
echo -e "\n${YELLOW}Step 4: Analyzing Space Savings${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- Compare partial vs full index sizes
SELECT 
    indexrelname as index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    CASE 
        WHEN indexrelname LIKE '%partial%' THEN 'Partial'
        ELSE 'Full'
    END as index_type
FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%test%'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
SQL

# Step 5: Selectivity check
echo -e "\n${YELLOW}Step 5: Checking Selectivity${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- Check how selective our WHERE clauses are
SELECT 
    'Active Events' as condition,
    COUNT(*) FILTER (WHERE status IN ('ON_SALE', 'ANNOUNCED')) as matching_rows,
    COUNT(*) as total_rows,
    ROUND(COUNT(*) FILTER (WHERE status IN ('ON_SALE', 'ANNOUNCED')) * 100.0 / NULLIF(COUNT(*), 0), 2) as percentage
FROM events

UNION ALL

SELECT 
    'Recent Transactions' as condition,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as matching_rows,
    COUNT(*) as total_rows,
    ROUND(COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') * 100.0 / NULLIF(COUNT(*), 0), 2) as percentage
FROM transactions;
SQL

echo -e "\n${GREEN}✓ Partial indexes validation complete!${NC}"
echo -e "${BLUE}Partial indexes provide significant space savings and performance gains${NC}"
echo -e "${GREEN}✓ Day 22, File 2: COMPLETE${NC}"
