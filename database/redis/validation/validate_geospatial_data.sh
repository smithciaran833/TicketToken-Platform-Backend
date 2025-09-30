#!/bin/bash
# validate_geospatial_data.sh

echo "=== Comprehensive Geospatial Data Validation ==="
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
    if [[ "$result" == *"$expected"* ]] || [ "$result" = "$expected" ]; then
        echo "✓ PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo "✗ FAILED (expected: $expected, got: $result)"
        return 1
    fi
}

# Test venue locations
echo -n "Testing venue locations exist... "
VENUE_COUNT=$(redis-cli ZCARD venues:locations)
if [ "$VENUE_COUNT" -ge "5" ]; then
    echo "✓ PASSED ($VENUE_COUNT venues)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test event locations
echo -n "Testing event locations exist... "
EVENT_COUNT=$(redis-cli ZCARD events:active:locations)
if [ "$EVENT_COUNT" -ge "3" ]; then
    echo "✓ PASSED ($EVENT_COUNT events)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test zone configuration
run_test "Zone configuration" "redis-cli HGET zone:config:downtown type" "premium"

# Test radius search
echo -n "Testing radius search... "
NEARBY=$(redis-cli GEORADIUS venues:locations -86.7833 36.1659 5 mi | wc -l)
if [ "$NEARBY" -gt "0" ]; then
    echo "✓ PASSED ($NEARBY venues found)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test distance calculation
echo -n "Testing distance calculation... "
DIST=$(redis-cli GEODIST venues:locations "venue:1:ryman" "venue:2:bridgestone" mi)
if [[ $DIST =~ ^[0-9]+\.?[0-9]*$ ]]; then
    echo "✓ PASSED (${DIST} miles)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test metadata storage
run_test "Event metadata" "redis-cli HGET event:123:geo city" "Nashville"

# Test analytics configuration
run_test "Analytics config" "redis-cli HGET geo:config:analytics track_searches" "true"

# Configuration summary
echo ""
echo "=== Configuration Summary ==="
echo "Venues: $(redis-cli ZCARD venues:locations)"
echo "Events: $(redis-cli ZCARD events:active:locations)"
echo "Zones: $(redis-cli ZCARD zones:service:nashville)"
echo "Zone configs: $(redis-cli KEYS 'zone:config:*' | wc -l)"

echo ""
echo "=== Validation Summary ==="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo "✅ All geospatial data tests passed!"
else
    echo "❌ Some tests failed. Please review the configuration."
fi
