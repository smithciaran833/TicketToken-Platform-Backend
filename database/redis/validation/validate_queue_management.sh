#!/bin/bash
# validate_queue_management.sh

echo "=== Comprehensive Queue Management Validation ==="
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

# Test queue types
run_test "Email queue type exists" "redis-cli SISMEMBER queue:types 'email:transactional'" "1"
run_test "Payment queue type exists" "redis-cli SISMEMBER queue:types 'payment:captures'" "1"
run_test "NFT queue type exists" "redis-cli SISMEMBER queue:types 'nft:mint'" "1"

# Test configurations
run_test "Email batch size" "redis-cli HGET queue:config:email:transactional batch_size" "10"
run_test "Payment workers" "redis-cli HGET queue:config:payment:captures workers" "3"

# Test retry configurations
run_test "Email max retries" "redis-cli HGET queue:config:retry:email max_retries" "3"
run_test "Payment retry delay" "redis-cli HGET queue:config:retry:payment retry_delay" "60"

# Test alert thresholds
run_test "Email warning threshold" "redis-cli HGET queue:alerts:thresholds email:transactional:warning" "1000"

# Test queue operations
echo -n "Testing queue push/pop... "
redis-cli LPUSH test:queue "test_item" > /dev/null
redis-cli RPOP test:queue > /dev/null
QUEUE_EMPTY=$(redis-cli LLEN test:queue)
if [ "$QUEUE_EMPTY" = "0" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test priority queue
echo -n "Testing priority queue... "
redis-cli ZADD test:priority 100 "high" > /dev/null
redis-cli ZADD test:priority 50 "low" > /dev/null
HIGHEST=$(redis-cli ZREVRANGE test:priority 0 0)
if [ "$HIGHEST" = "high" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Configuration summary
echo ""
echo "=== Configuration Summary ==="
echo "Queue types: $(redis-cli SCARD queue:types)"
echo "Total configurations: $(redis-cli KEYS 'queue:config:*' | wc -l)"
echo "Retry policies: $(redis-cli KEYS 'queue:config:retry:*' | wc -l)"
echo "Alert thresholds: $(redis-cli HLEN queue:alerts:thresholds)"

# Cleanup
redis-cli DEL test:queue test:priority > /dev/null 2>&1

echo ""
echo "=== Validation Summary ==="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo "✅ All queue management tests passed!"
else
    echo "❌ Some tests failed. Please review the configuration."
fi
