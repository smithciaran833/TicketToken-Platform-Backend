#!/bin/bash

# TicketToken Foreign Key Indexes Validation Script
# Tests FK index creation, JOIN performance, and CASCADE operations

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Database configuration
DB_NAME="${DB_NAME:-tickettoken_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Test configuration
INDEXES_FILE="database/postgresql/indexes/foreign_key_indexes.sql"
LOG_FILE="validation_foreign_key_indexes.log"

# Initialize log
echo "Foreign Key Indexes Validation - $(date)" > "$LOG_FILE"

# Function to execute SQL and log results
execute_sql() {
    local query="$1"
    local description="$2"
    
    echo -e "${BLUE}Testing: $description${NC}"
    echo "Testing: $description" >> "$LOG_FILE"
    
    result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "$query" -t 2>&1) || {
        echo -e "${RED}Failed: $result${NC}"
        echo "Failed: $result" >> "$LOG_FILE"
        return 1
    }
    
    echo "$result" >> "$LOG_FILE"
    echo -e "${GREEN}Success${NC}"
    return 0
}

# Function to test JOIN performance
test_join_performance() {
    local query="$1"
    local description="$2"
    
    echo -e "${BLUE}JOIN Performance: $description${NC}"
    echo "JOIN Performance: $description" >> "$LOG_FILE"
    
    # Get execution time
    result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "EXPLAIN (ANALYZE, TIMING ON, BUFFERS) $query" 2>&1)
    
    if [ $? -eq 0 ]; then
        exec_time=$(echo "$result" | grep -oP 'Execution Time: \K[\d.]+' | head -1 || echo "0")
        echo "Execution Time: ${exec_time}ms" >> "$LOG_FILE"
        echo -e "${GREEN}✓ JOIN completed in ${exec_time}ms${NC}"
    else
        echo -e "${RED}Failed to test JOIN${NC}"
        echo "Failed: $result" >> "$LOG_FILE"
    fi
}

# Main validation process
echo -e "${GREEN}Starting Foreign Key Indexes Validation...${NC}"

# Step 1: Create FK indexes
echo -e "\n${YELLOW}Step 1: Creating Foreign Key Indexes${NC}"
execute_sql "\i $INDEXES_FILE" "Creating all foreign key indexes"

# Step 2: Count FK indexes created
echo -e "\n${YELLOW}Step 2: Counting Foreign Key Indexes${NC}"
fk_index_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE '%_fk%'" -t)
echo -e "${GREEN}Created $fk_index_count foreign key indexes${NC}"
echo "Foreign key indexes created: $fk_index_count" >> "$LOG_FILE"

# Step 3: Find missing FK indexes
echo -e "\n${YELLOW}Step 3: Checking for Missing FK Indexes${NC}"
missing_fk=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'SQL' 2>&1
WITH fk_list AS (
    SELECT 
        tc.table_name,
        kcu.column_name
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
),
indexed_columns AS (
    SELECT 
        tablename,
        string_agg(indexdef, ' ') as all_indexes
    FROM pg_indexes
    WHERE schemaname = 'public'
    GROUP BY tablename
)
SELECT COUNT(*) as missing_count
FROM fk_list fl
LEFT JOIN indexed_columns ic 
    ON ic.tablename = fl.table_name 
    AND ic.all_indexes LIKE '%' || fl.column_name || '%'
WHERE ic.tablename IS NULL;
SQL
)

echo "Missing FK indexes: $missing_fk" >> "$LOG_FILE"
echo -e "${BLUE}Missing FK indexes: $missing_fk${NC}"

# Step 4: Test JOIN performance
echo -e "\n${YELLOW}Step 4: Testing JOIN Performance${NC}"

# Test 1: Simple two-table JOIN
test_join_performance "
SELECT COUNT(*)
FROM tickets t
JOIN events e ON t.event_id = e.id
WHERE e.deleted_at IS NULL" "Two-table JOIN (tickets + events)"

# Test 2: Multi-table JOIN
test_join_performance "
SELECT COUNT(*)
FROM tickets t
JOIN events e ON t.event_id = e.id
JOIN venues v ON e.venue_id = v.id
WHERE t.deleted_at IS NULL
  AND e.deleted_at IS NULL
  AND v.deleted_at IS NULL" "Multi-table JOIN (tickets + events + venues)"

# Test 3: User-centric JOIN
test_join_performance "
SELECT COUNT(*)
FROM users u
LEFT JOIN tickets t ON u.id = t.owner_id
LEFT JOIN payment_methods pm ON u.id = pm.user_id
WHERE u.deleted_at IS NULL" "User-centric JOIN with LEFT JOINs"

# Step 5: Test CASCADE performance (carefully)
echo -e "\n${YELLOW}Step 5: Testing CASCADE Performance (Read-Only)${NC}"
# We'll just check if CASCADE constraints exist, not actually delete
cascade_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE delete_rule = 'CASCADE'" -t)
echo -e "${BLUE}Tables with CASCADE DELETE: $cascade_count${NC}"
echo "CASCADE DELETE constraints: $cascade_count" >> "$LOG_FILE"

# Step 6: Index usage statistics
echo -e "\n${YELLOW}Step 6: Foreign Key Index Usage Statistics${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE indexname LIKE '%_fk%'
  AND idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 10;
SQL

# Step 7: Performance comparison
echo -e "\n${YELLOW}Step 7: Performance Impact Summary${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- Show tables with the most FK indexes
SELECT 
    tablename,
    COUNT(*) as fk_index_count,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_index_size
FROM pg_stat_user_indexes
WHERE indexname LIKE '%_fk%'
GROUP BY tablename
ORDER BY COUNT(*) DESC
LIMIT 10;
SQL

# Final summary
echo -e "\n${GREEN}=== Validation Summary ===${NC}"
echo -e "${GREEN}✓ Foreign key indexes created: $fk_index_count${NC}"
echo -e "${BLUE}✓ Missing FK indexes: $missing_fk${NC}"
echo -e "${BLUE}✓ CASCADE constraints: $cascade_count${NC}"
echo -e "${GREEN}✓ JOIN performance tests completed${NC}"
echo -e "${BLUE}Log file: $LOG_FILE${NC}"

exit 0
