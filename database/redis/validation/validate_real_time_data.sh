#!/bin/bash
# validate_real_time_data.sh

echo "=== Comprehensive Real-Time Data Validation ==="
echo "Date: $(date)"
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected=$3
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "Testing $test_name... "
    
    result=$(eval "$test_command" 2>/dev/null)
    if [ "$result" = "$expected" ]; then
        echo "✓ PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo "✗ FAILED (expected: $expected, got: $result)"
        return 1
    fi
}

# Test live counters
run_test "Venue capacity" "redis-cli GET venue:venue_123:attendance:capacity" "2500"
run_test "Active users TTL" "redis-cli EXISTS platform:stats:active_users" "1"

# Test pricing configuration
run_test "Surge enabled" "redis-cli HGET pricing:config surge_enabled" "true"
run_test "Max surge multiplier" "redis-cli HGET pricing:config max_surge_multiplier" "2.0"

# Test event status
run_test "Event state definition" "redis-cli HGET event:status:states scheduled" "Event scheduled"

# Test pub/sub channels
run_test "Event updates channel" "redis-cli HGET pubsub:channels event_updates" "event:{event_id}:updates"

# Test update intervals
run_test "Attendance update interval" "redis-cli HGET realtime:config:update_intervals attendance" "5"

# Test complex operations
echo -n "Testing attendance increment... "
redis-cli SET test:attendance 100 > /dev/null
redis-cli INCR test:attendance > /dev/null
RESULT=$(redis-cli GET test:attendance)
if [ "$RESULT" = "101" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test pub/sub
echo -n "Testing pub/sub publish... "
PUB_RESULT=$(redis-cli PUBLISH test:channel "message" 2>/dev/null)
if [ "$PUB_RESULT" -ge "0" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Configuration summary
echo ""
echo "=== Configuration Summary ==="
echo "Pricing rules: $(redis-cli HLEN pricing:rules:surge)"
echo "Event states: $(redis-cli HLEN event:status:states)"
echo "Pub/Sub channels: $(redis-cli HLEN pubsub:channels)"
echo "Update intervals: $(redis-cli HLEN realtime:config:update_intervals)"

# Cleanup
redis-cli DEL test:attendance > /dev/null 2>&1

echo ""
echo "=== Validation Summary ==="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo "✅ All real-time data tests passed!"
else
    echo "❌ Some tests failed. Please review the configuration."
fi
