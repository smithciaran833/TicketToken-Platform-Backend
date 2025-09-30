#!/bin/bash

# TicketToken Performance Indexes Validation Script
# Tests index creation, usage, and performance improvements

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
INDEXES_FILE="database/postgresql/indexes/performance_indexes.sql"
LOG_FILE="validation_performance_indexes.log"
PERFORMANCE_THRESHOLD_MS=50

# Initialize log
echo "Performance Indexes Validation - $(date)" > "$LOG_FILE"

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

# Function to test query performance
test_query_performance() {
    local query="$1"
    local description="$2"
    local expected_ms="$3"
    
    echo -e "${BLUE}Performance Test: $description${NC}"
    echo "Performance Test: $description" >> "$LOG_FILE"
    
    # Run EXPLAIN ANALYZE
    result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) $query" -t 2>&1)
    
    if [ $? -eq 0 ]; then
        # Extract execution time using jq if available, otherwise use grep
        if command -v jq &> /dev/null; then
            exec_time=$(echo "$result" | jq -r '.[0]."Execution Time"' 2>/dev/null || echo "0")
        else
            exec_time=$(echo "$result" | grep -oP '"Execution Time":\s*\K[\d.]+' | head -1 || echo "0")
        fi
        
        echo "Execution Time: ${exec_time}ms (Expected: <${expected_ms}ms)" >> "$LOG_FILE"
        
        # Check if performance meets threshold
        if (( $(echo "$exec_time < $expected_ms" | bc -l) )); then
            echo -e "${GREEN}✓ Performance OK: ${exec_time}ms${NC}"
        else
            echo -e "${YELLOW}⚠ Performance Warning: ${exec_time}ms (expected <${expected_ms}ms)${NC}"
        fi
    else
        echo -e "${RED}Failed to analyze query performance${NC}"
        echo "Failed: $result" >> "$LOG_FILE"
    fi
}

# Function to check index usage
check_index_usage() {
    local index_name="$1"
    
    result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "SELECT idx_scan FROM pg_stat_user_indexes WHERE indexname = '$index_name'" -t 2>&1)
    
    if [ $? -eq 0 ] && [ -n "$result" ]; then
        echo "Index $index_name scan count: $result" >> "$LOG_FILE"
    fi
}

# Main validation process
echo -e "${GREEN}Starting Performance Indexes Validation...${NC}"

# Step 1: Create indexes
echo -e "\n${YELLOW}Step 1: Creating Performance Indexes${NC}"
execute_sql "\i $INDEXES_FILE" "Creating all performance indexes"

# Step 2: Update statistics
echo -e "\n${YELLOW}Step 2: Updating Table Statistics${NC}"
execute_sql "ANALYZE users, events, tickets, transactions;" "Updating statistics"

# Step 3: Check index creation
echo -e "\n${YELLOW}Step 3: Verifying Index Creation${NC}"
index_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'" -t)
echo -e "${GREEN}Created $index_count indexes${NC}"
echo "Total indexes created: $index_count" >> "$LOG_FILE"

# Step 4: Test user login performance
echo -e "\n${YELLOW}Step 4: Testing User Login Performance${NC}"
test_query_performance \
    "SELECT id, email, username, role, account_status, updated_at FROM users WHERE email = 'test@example.com' AND deleted_at IS NULL AND account_status = 'active'" \
    "Email-based login" \
    "$PERFORMANCE_THRESHOLD_MS"

test_query_performance \
    "SELECT * FROM users WHERE lower(username) = lower('testuser') AND deleted_at IS NULL" \
    "Username-based login" \
    "$PERFORMANCE_THRESHOLD_MS"

# Step 5: Test event discovery performance
echo -e "\n${YELLOW}Step 5: Testing Event Discovery Performance${NC}"
test_query_performance \
    "SELECT * FROM events WHERE start_date >= CURRENT_DATE AND end_date <= CURRENT_DATE + INTERVAL '30 days' AND status = 'on_sale' AND deleted_at IS NULL ORDER BY start_date LIMIT 20" \
    "Date range event search" \
    "$PERFORMANCE_THRESHOLD_MS"

test_query_performance \
    "SELECT * FROM events WHERE category = 'concert' AND start_date > CURRENT_DATE AND status = 'on_sale' AND deleted_at IS NULL LIMIT 20" \
    "Category-based event search" \
    "$PERFORMANCE_THRESHOLD_MS"

# Step 6: Test ticket validation performance
echo -e "\n${YELLOW}Step 6: Testing Ticket Validation Performance${NC}"
test_query_performance \
    "SELECT t.*, e.name FROM tickets t JOIN events e ON t.event_id = e.id WHERE t.validation_code = 'TEST123' AND t.status IN ('active', 'transferred')" \
    "Ticket validation lookup" \
    "$PERFORMANCE_THRESHOLD_MS"

# Step 7: Test financial query performance
echo -e "\n${YELLOW}Step 7: Testing Financial Query Performance${NC}"
test_query_performance \
    "SELECT COUNT(*), SUM(amount), AVG(amount) FROM transactions WHERE user_id = 1 AND created_at >= CURRENT_DATE - INTERVAL '30 days' AND deleted_at IS NULL" \
    "User transaction summary" \
    "$PERFORMANCE_THRESHOLD_MS"

# Step 8: Check index sizes
echo -e "\n${YELLOW}Step 8: Analyzing Index Sizes${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
SELECT 
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan as scans
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
SQL

# Step 9: Find unused indexes
echo -e "\n${YELLOW}Step 9: Checking for Unused Indexes${NC}"
unused_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT COUNT(*) FROM pg_stat_user_indexes WHERE schemaname = 'public' AND idx_scan = 0 AND indexname LIKE 'idx_%'" -t)
echo -e "${BLUE}Unused indexes: $unused_count${NC}"

# Step 10: Performance summary
echo -e "\n${YELLOW}Step 10: Performance Summary${NC}"
echo -e "${GREEN}=== Validation Summary ===${NC}"
echo "- Indexes created: $index_count"
echo "- Unused indexes: $unused_count"
echo "- Log file: $LOG_FILE"

# Final status
if [ "$index_count" -gt 20 ]; then
    echo -e "\n${GREEN}✓ Performance indexes validation completed successfully!${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Performance indexes validation failed - insufficient indexes created${NC}"
    exit 1
fi
