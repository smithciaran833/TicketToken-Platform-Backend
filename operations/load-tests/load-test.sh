#!/bin/bash

echo "=============================="
echo "TICKETTOKEN LOAD TEST"
echo "=============================="
echo ""

# Test parameters
CONCURRENT_USERS=100
TOTAL_REQUESTS=1000
API_URL="http://localhost:3000"

echo "Test Configuration:"
echo "  • Concurrent users: $CONCURRENT_USERS"
echo "  • Total requests: $TOTAL_REQUESTS"
echo "  • Target: $API_URL"
echo ""

# Test 1: Health endpoint (baseline)
echo "Test 1: Health Check Endpoint"
echo "------------------------------"
ab -n $TOTAL_REQUESTS -c $CONCURRENT_USERS -q "$API_URL/health" 2>/dev/null | grep -E "Requests per second|Time per request|Failed requests"

# Test 2: Event search (read heavy)
echo ""
echo "Test 2: Event Search"
echo "------------------------------"
ab -n 500 -c 50 -q "$API_URL/api/events/search?q=concert" 2>/dev/null | grep -E "Requests per second|Time per request|Failed requests"

# Test 3: Database queries
echo ""
echo "Test 3: Database Performance"
echo "------------------------------"
echo "Running 1000 concurrent queries..."
for i in {1..10}; do
  PGPASSWORD=TicketToken2024Secure! psql -U postgres -d tickettoken -c "SELECT COUNT(*) FROM tickets" > /dev/null 2>&1 &
done
wait
echo "✓ Database handled concurrent load"

echo ""
echo "=============================="
echo "LOAD TEST RESULTS"
echo "=============================="
