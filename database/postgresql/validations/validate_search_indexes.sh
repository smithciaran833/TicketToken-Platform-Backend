#!/bin/bash

# TicketToken Search Indexes Validation Script
# Tests full-text search, fuzzy matching, and autocomplete functionality

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
INDEXES_FILE="database/postgresql/indexes/search_indexes.sql"
LOG_FILE="validation_search_indexes.log"

# Initialize log
echo "Search Indexes Validation - $(date)" > "$LOG_FILE"

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

# Function to test search performance
test_search_performance() {
    local query="$1"
    local description="$2"
    
    echo -e "${BLUE}Search Performance: $description${NC}"
    echo "Search Performance: $description" >> "$LOG_FILE"
    
    # Time the query
    start_time=$(date +%s%N)
    result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "$query" -t 2>&1)
    end_time=$(date +%s%N)
    
    if [ $? -eq 0 ]; then
        elapsed=$((($end_time - $start_time) / 1000000))
        echo "Query completed in ${elapsed}ms" >> "$LOG_FILE"
        echo -e "${GREEN}✓ Completed in ${elapsed}ms${NC}"
        
        # Count results
        result_count=$(echo "$result" | grep -v '^$' | wc -l)
        echo "Results found: $result_count" >> "$LOG_FILE"
    else
        echo -e "${RED}Failed to execute search${NC}"
        echo "Failed: $result" >> "$LOG_FILE"
    fi
}

# Main validation process
echo -e "${GREEN}Starting Search Indexes Validation...${NC}"

# Step 1: Create extensions and indexes
echo -e "\n${YELLOW}Step 1: Creating Search Extensions and Indexes${NC}"
execute_sql "\i $INDEXES_FILE" "Creating search indexes and extensions"

# Step 2: Verify extensions
echo -e "\n${YELLOW}Step 2: Verifying Extensions${NC}"
execute_sql "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent', 'btree_gin', 'btree_gist');" "Checking extensions"

# Step 3: Test full-text search
echo -e "\n${YELLOW}Step 3: Testing Full-Text Search${NC}"

# Insert test data if tables are empty
execute_sql "
INSERT INTO events (id, venue_id, name, description, tags, status)
SELECT 
    gen_random_uuid(),
    gen_random_uuid(),
    'Test Concert ' || i,
    'Amazing music event with great performances',
    ARRAY['music', 'concert', 'live'],
    'on_sale'
FROM generate_series(1, 5) i
WHERE NOT EXISTS (SELECT 1 FROM events LIMIT 1)
ON CONFLICT DO NOTHING;" "Inserting test events"

test_search_performance "
SELECT name, 
       ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '')), 
               plainto_tsquery('english', 'concert')) as rank
FROM events 
WHERE to_tsvector('english', name || ' ' || COALESCE(description, '')) 
      @@ plainto_tsquery('english', 'concert')
      AND deleted_at IS NULL
ORDER BY rank DESC
LIMIT 10;" "Full-text search for 'concert'"

# Step 4: Test fuzzy matching
echo -e "\n${YELLOW}Step 4: Testing Fuzzy Matching${NC}"
test_search_performance "
SELECT name, similarity(name, 'concrt') as sim
FROM events
WHERE name % 'concrt'
ORDER BY sim DESC
LIMIT 5;" "Fuzzy search for 'concrt' (typo)"

# Step 5: Test autocomplete
echo -e "\n${YELLOW}Step 5: Testing Autocomplete${NC}"
test_search_performance "
SELECT name
FROM events
WHERE lower(name) LIKE lower('test%')
      AND deleted_at IS NULL
ORDER BY name
LIMIT 10;" "Autocomplete for 'test'"

# Step 6: Test tag search
echo -e "\n${YELLOW}Step 6: Testing Array/Tag Search${NC}"
test_search_performance "
SELECT name, tags
FROM events
WHERE tags && ARRAY['music', 'concert']::text[]
      AND deleted_at IS NULL
LIMIT 10;" "Tag search for music/concert"

# Step 7: Check index usage
echo -e "\n${YELLOW}Step 7: Analyzing Index Usage${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE indexname LIKE '%fts%' OR indexname LIKE '%trgm%' OR indexname LIKE '%gin%'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
SQL

# Step 8: Test search function
echo -e "\n${YELLOW}Step 8: Testing Autocomplete Function${NC}"
test_search_performance "
SELECT * FROM get_autocomplete_suggestions('test', NULL, 5);" "Autocomplete function"

# Step 9: Performance summary
echo -e "\n${YELLOW}Step 9: Search Performance Summary${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
-- Count search indexes
SELECT 
    COUNT(*) FILTER (WHERE indexname LIKE '%fts%') as fulltext_indexes,
    COUNT(*) FILTER (WHERE indexname LIKE '%trgm%') as trigram_indexes,
    COUNT(*) FILTER (WHERE indexname LIKE '%gin%') as gin_indexes,
    COUNT(*) FILTER (WHERE indexname LIKE '%gist%') as gist_indexes
FROM pg_indexes
WHERE schemaname = 'public';
SQL

# Step 10: Sample search queries
echo -e "\n${YELLOW}Step 10: Sample Search Queries${NC}"
cat << 'QUERIES'
-- Weighted search example:
SELECT id, name,
       ts_rank(
           setweight(to_tsvector('english', name), 'A') ||
           setweight(to_tsvector('english', COALESCE(description, '')), 'B'),
           plainto_tsquery('english', 'your search terms')
       ) as rank
FROM events
WHERE deleted_at IS NULL
ORDER BY rank DESC;

-- Fuzzy venue search:
SELECT name, city, similarity(name, 'search term') as score
FROM venues
WHERE name % 'search term'
ORDER BY score DESC;

-- User search:
SELECT username, display_name
FROM users
WHERE to_tsvector('english', username || ' ' || COALESCE(display_name, ''))
      @@ plainto_tsquery('english', 'search term');
QUERIES

# Final status
echo -e "\n${GREEN}=== Validation Summary ===${NC}"
echo -e "${GREEN}✓ Search indexes validation completed!${NC}"
echo -e "${BLUE}Log file: $LOG_FILE${NC}"

exit 0
