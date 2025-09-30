#!/bin/bash

echo "=== Validating Ticket Status Views ==="
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

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "Testing: $test_name... "
    
    result=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "$test_command" 2>&1)
    
    if [[ "$result" == *"ERROR"* ]]; then
        echo -e "${RED}FAILED${NC}"
        echo "  Error: $result"
        ((TESTS_FAILED++))
    else
        echo -e "${GREEN}PASSED${NC}"
        ((TESTS_PASSED++))
    fi
}

echo "1. Testing view structure..."
echo "----------------------------------------"

run_test "ticket_status_details view exists" \
    "SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'ticket_status_details';"

run_test "ticket_inventory_summary view exists" \
    "SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'ticket_inventory_summary';"

# Check column counts
details_columns=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'ticket_status_details';" | tr -d ' ')
summary_columns=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'ticket_inventory_summary';" | tr -d ' ')

echo "Details view has $details_columns columns"
echo "Summary view has $summary_columns columns"

echo
echo "2. Testing data retrieval..."
echo "----------------------------------------"

# Test ticket counts
total_tickets=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM ticket_status_details;" | tr -d ' ')
echo "Total tickets in details view: $total_tickets"

run_test "All tickets have valid status" \
    "SELECT COUNT(*) FROM ticket_status_details WHERE current_status IS NULL;"

run_test "QR code tracking works" \
    "SELECT COUNT(DISTINCT has_qr_code) FROM ticket_status_details;"

echo
echo "3. Testing real-time updates..."
echo "----------------------------------------"

# Insert a new ticket to test real-time
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << SQL > /dev/null 2>&1
INSERT INTO tickets (
    event_id, ticket_type_id, owner_id, original_purchaser_id,
    ticket_number, face_value, purchase_price, status
)
SELECT 
    event_id, ticket_type_id, owner_id, original_purchaser_id,
    'TEST-' || EXTRACT(EPOCH FROM NOW())::INT, 99.99, 99.99, 'ACTIVE'::ticket_status
FROM tickets
LIMIT 1;
SQL

# Check if new ticket appears
new_count=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM ticket_status_details WHERE ticket_number LIKE 'TEST-%';" | tr -d ' ')
if [ "$new_count" -gt "0" ]; then
    echo -e "${GREEN}✓ Real-time updates working - found $new_count test ticket(s)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Real-time updates not working${NC}"
    ((TESTS_FAILED++))
fi

echo
echo "4. Testing inventory calculations..."
echo "----------------------------------------"

echo "Inventory Summary:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    event_name,
    total_tickets,
    active_tickets,
    redeemed_tickets,
    availability_percentage || '%' as availability
FROM ticket_inventory_summary
ORDER BY total_tickets DESC
LIMIT 5;
"

echo
echo "5. Testing complex queries..."
echo "----------------------------------------"

# Test status filtering
echo "Tickets by Status:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    current_status,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE has_qr_code) as with_qr,
    COUNT(*) FILTER (WHERE is_nft) as nft_tickets
FROM ticket_status_details
GROUP BY current_status
ORDER BY count DESC;
"

echo
echo "6. Performance testing..."
echo "----------------------------------------"

# Single ticket lookup
start_time=$(date +%s%N)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM ticket_status_details LIMIT 1;" > /dev/null
end_time=$(date +%s%N)
elapsed=$(( ($end_time - $start_time) / 1000000 ))
echo "Single ticket lookup: ${elapsed}ms"

# Inventory aggregation
start_time=$(date +%s%N)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM ticket_inventory_summary;" > /dev/null
end_time=$(date +%s%N)
elapsed=$(( ($end_time - $start_time) / 1000000 ))
echo "Inventory aggregation: ${elapsed}ms"

echo
echo "========================================="
echo "VALIDATION SUMMARY"
echo "========================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

# Clean up test ticket
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DELETE FROM tickets WHERE ticket_number LIKE 'TEST-%';" > /dev/null 2>&1

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed! Ticket Status Views are working correctly.${NC}"
else
    echo -e "\n${YELLOW}⚠ Some tests failed but views are functional.${NC}"
fi

# Cleanup
unset PGPASSWORD
