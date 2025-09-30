#!/bin/bash
# validate_caching_strategies.sh

echo "=== Comprehensive Caching Strategies Validation ==="
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

# Test TTL configurations
run_test "User profile TTL" "redis-cli HGET cache_config:ttl 'user_profile'" "900"
run_test "Event details TTL" "redis-cli HGET cache_config:ttl 'event_details'" "300"
run_test "Ticket availability TTL" "redis-cli HGET cache_config:ttl 'ticket_availability'" "30"

# Test cache strategies
run_test "User cache strategy" "redis-cli HGET cache_config:strategies 'users'" "cache_aside"
run_test "Event cache strategy" "redis-cli HGET cache_config:strategies 'events'" "write_through"
run_test "Analytics cache strategy" "redis-cli HGET cache_config:strategies 'analytics'" "write_behind"

# Test namespaces
echo -n "Testing cache namespaces... "
NAMESPACE_COUNT=$(redis-cli SCARD cache:namespaces)
if [ "$NAMESPACE_COUNT" -ge "7" ]; then
    echo "✓ PASSED ($NAMESPACE_COUNT namespaces)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED (expected at least 7)"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test cache operations
echo -n "Testing cache operations... "
redis-cli SET test:cache:op "test_value" EX 60 > /dev/null
redis-cli HINCRBY test:cache:counter "views" 1 > /dev/null
OPS_WORK=$(redis-cli EXISTS test:cache:op)
if [ "$OPS_WORK" = "1" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Configuration summary
echo ""
echo "=== Configuration Summary ==="
echo "TTL rules configured: $(redis-cli HLEN cache_config:ttl)"
echo "Cache strategies configured: $(redis-cli HLEN cache_config:strategies)"
echo "Warming rules configured: $(redis-cli HLEN cache_config:warming)"
echo "Invalidation rules configured: $(redis-cli HLEN cache_config:invalidation)"

# Cleanup
redis-cli DEL test:cache:op test:cache:counter > /dev/null 2>&1

echo ""
echo "=== Validation Summary ==="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo "✅ All caching strategies tests passed!"
else
    echo "❌ Some tests failed. Please review the configuration."
fi
