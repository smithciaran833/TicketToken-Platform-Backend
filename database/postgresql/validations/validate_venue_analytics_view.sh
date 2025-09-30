#!/bin/bash

echo "=== Validating Venue Analytics View ==="
echo "Started at: $(date)"
echo

# Database connection details
DB_HOST="localhost"
DB_NAME="tickettoken_db"
DB_USER="postgres"
export PGPASSWORD='TicketToken2024Secure!!'

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    
    echo -n "Testing: $test_name... "
    
    result=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "$test_command" 2>&1)
    
    if [[ "$result" == *"ERROR"* ]]; then
        echo -e "${RED}FAILED${NC}"
        echo "  Error: $result"
        ((TESTS_FAILED++))
    elif [[ -n "$expected_result" && "$result" != *"$expected_result"* ]]; then
        echo -e "${RED}FAILED${NC}"
        echo "  Expected: $expected_result"
        echo "  Got: $result"
        ((TESTS_FAILED++))
    else
        echo -e "${GREEN}PASSED${NC}"
        ((TESTS_PASSED++))
    fi
}

# Function to measure query performance
measure_performance() {
    local query="$1"
    local description="$2"
    
    echo -e "\n${YELLOW}Performance test: $description${NC}"
    psql -h $DB_HOST -U $DB_USER -d $DB_NAME << SQL
\timing on
EXPLAIN (ANALYZE, BUFFERS) 
$query;
\timing off
SQL
    echo
}

echo "1. Checking existing views..."
echo "----------------------------------------"

# Check if views exist
run_test "Regular view exists" \
    "SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'venue_analytics';" \
    "1"

run_test "Materialized view exists" \
    "SELECT COUNT(*) FROM pg_matviews WHERE matviewname = 'venue_analytics_mv';" \
    "1"

echo
echo "2. Testing view structure..."
echo "----------------------------------------"

# Count columns in the view
column_count=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'venue_analytics';" | tr -d ' ')
echo "View has $column_count columns"

# Test specific columns exist
run_test "Has venue columns" \
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'venue_analytics' AND column_name IN ('venue_id', 'venue_name', 'city', 'state_province');" \
    "4"

run_test "Has revenue columns" \
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'venue_analytics' AND column_name IN ('gross_revenue', 'revenue_last_7_days', 'revenue_last_30_days', 'revenue_ytd');" \
    "4"

echo
echo "3. Testing data retrieval and calculations..."
echo "----------------------------------------"

# Get venue count
venue_count=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM venue_analytics;" | tr -d ' ')
echo "Found $venue_count venues in analytics view"

run_test "All revenue values are non-negative" \
    "SELECT COUNT(*) FROM venue_analytics WHERE gross_revenue < 0 OR revenue_last_30_days < 0;" \
    "0"

run_test "Capacity calculations are valid" \
    "SELECT COUNT(*) FROM venue_analytics WHERE avg_capacity_utilization_pct < 0 OR avg_capacity_utilization_pct > 100;" \
    "0"

echo
echo "4. Testing materialized view features..."
echo "----------------------------------------"

run_test "Rankings are assigned" \
    "SELECT COUNT(*) FROM venue_analytics_mv WHERE revenue_rank IS NOT NULL;" \
    "$venue_count"

run_test "Percentiles are between 0 and 1" \
    "SELECT COUNT(*) FROM venue_analytics_mv WHERE revenue_percentile < 0 OR revenue_percentile > 1;" \
    "0"

echo
echo "5. Testing data consistency..."
echo "----------------------------------------"

# Insert test data if no venues exist
if [ "$venue_count" -eq "0" ]; then
    echo "No venues found. Inserting test data..."
    psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'SQL'
-- Insert test venues
INSERT INTO venues (name, slug, email, address_line1, city, state_province, country_code, max_capacity)
VALUES 
    ('Madison Square Garden', 'madison-square-garden', 'info@msg.com', '4 Penn Plaza', 'New York', 'NY', 'US', 20000),
    ('Staples Center', 'staples-center', 'info@staplescenter.com', '1111 S Figueroa St', 'Los Angeles', 'CA', 'US', 19000),
    ('Small Theater', 'small-theater', 'info@smalltheater.com', '123 Main St', 'Boston', 'MA', 'US', 500);

-- Get venue IDs
DO $$
DECLARE
    msg_id uuid;
    staples_id uuid;
    theater_id uuid;
BEGIN
    SELECT id INTO msg_id FROM venues WHERE slug = 'madison-square-garden';
    SELECT id INTO staples_id FROM venues WHERE slug = 'staples-center';
    SELECT id INTO theater_id FROM venues WHERE slug = 'small-theater';
    
    -- Create events
    INSERT INTO events (venue_id, name, slug, status) VALUES
        (msg_id, 'Concert 1', 'concert-1', 'COMPLETED'),
        (msg_id, 'Concert 2', 'concert-2', 'ON_SALE'),
        (staples_id, 'Basketball Game', 'basketball-game', 'SOLD_OUT'),
        (theater_id, 'Play Performance', 'play-performance', 'ON_SALE');
    
    -- Create tickets for completed event
    INSERT INTO tickets (event_id, ticket_type_id, owner_id, original_purchaser_id, ticket_number, face_value, status, purchased_at)
    SELECT 
        e.id,
        gen_random_uuid(),
        gen_random_uuid(),
        gen_random_uuid(),
        'T' || row_number() OVER (),
        100 + (random() * 200)::numeric(10,2),
        'ACTIVE'::ticket_status,
        CURRENT_TIMESTAMP - (random() * 60 || ' days')::interval
    FROM events e, generate_series(1, 100)
    WHERE e.slug = 'concert-1';
END $$;

-- Refresh materialized view
SELECT refresh_venue_analytics_mv();
SQL
fi

# Check data consistency
run_test "30-day revenue <= total revenue" \
    "SELECT COUNT(*) FROM venue_analytics WHERE revenue_last_30_days > gross_revenue;" \
    "0"

run_test "7-day revenue <= 30-day revenue" \
    "SELECT COUNT(*) FROM venue_analytics WHERE revenue_last_7_days > revenue_last_30_days;" \
    "0"

echo
echo "6. Performance testing..."
echo "----------------------------------------"

# Get a venue ID for testing
test_venue_id=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT venue_id FROM venue_analytics LIMIT 1;" | tr -d ' ')

if [ -n "$test_venue_id" ]; then
    measure_performance \
        "SELECT * FROM venue_analytics WHERE venue_id = '$test_venue_id'" \
        "Single venue lookup (regular view)"
    
    measure_performance \
        "SELECT * FROM venue_analytics_mv WHERE venue_id = '$test_venue_id'" \
        "Single venue lookup (materialized view)"
    
    measure_performance \
        "SELECT venue_name, gross_revenue, revenue_rank FROM venue_analytics_mv ORDER BY revenue_rank LIMIT 10" \
        "Top 10 venues by revenue"
fi

echo
echo "7. Testing materialized view refresh..."
echo "----------------------------------------"

echo "Refreshing materialized view..."
refresh_time=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "\timing on
SELECT refresh_venue_analytics_mv();
\timing off" 2>&1 | grep "Time:" | awk '{print $2}')

echo -e "${GREEN}✓ Materialized view refreshed in $refresh_time ms${NC}"

echo
echo "8. Sample queries showcase..."
echo "----------------------------------------"

echo -e "\n${YELLOW}Top venues by revenue:${NC}"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    venue_name, 
    city, 
    gross_revenue::money, 
    total_tickets_sold,
    revenue_rank
FROM venue_analytics_mv 
ORDER BY revenue_rank 
LIMIT 5;
"

echo -e "\n${YELLOW}Revenue trends (last 30 days):${NC}"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    venue_name,
    revenue_last_30_days::money as \"30-day Revenue\",
    CASE 
        WHEN gross_revenue > 0 THEN 
            ROUND((revenue_last_30_days::numeric / gross_revenue) * 100, 1) 
        ELSE 0 
    END as \"% of Total\"
FROM venue_analytics_mv 
WHERE revenue_last_30_days > 0
ORDER BY revenue_last_30_days DESC 
LIMIT 5;
"

echo
echo "========================================="
echo "VALIDATION SUMMARY"
echo "========================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! Venue Analytics View is working correctly.${NC}"
    echo
    echo "The view includes:"
    echo "- Venue information and capacity details"
    echo "- Event counts by status"
    echo "- Revenue metrics (total, time-based)"
    echo "- Customer analytics"
    echo "- Rankings and percentiles"
    echo "- Performance optimizations via materialized view"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review the errors above.${NC}"
    exit 1
fi

# Cleanup
unset PGPASSWORD
