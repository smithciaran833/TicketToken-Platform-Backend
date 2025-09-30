#!/bin/bash
# validate_leaderboards.sh

echo "=== Comprehensive Leaderboards Validation ==="
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

# Test configurations
run_test "Venue revenue config" "redis-cli HGET leaderboard:config:types 'venues:revenue'" "monthly,quarterly,yearly"
run_test "Daily retention" "redis-cli HGET leaderboard:config:retention 'daily'" "604800"
run_test "Default size limit" "redis-cli HGET leaderboard:config:max_size 'default'" "1000"

# Test leaderboard operations
echo -n "Testing sorted set add... "
redis-cli ZADD test:lb 100 "member1" > /dev/null
COUNT=$(redis-cli ZCARD test:lb)
if [ "$COUNT" = "1" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -n "Testing score increment... "
redis-cli ZINCRBY test:lb 50 "member1" > /dev/null
SCORE=$(redis-cli ZSCORE test:lb "member1")
SCORE_INT=${SCORE%.*}
if [ "$SCORE_INT" = "150" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -n "Testing rank retrieval... "
redis-cli ZADD test:lb 200 "member2" > /dev/null
RANK=$(redis-cli ZREVRANK test:lb "member1")
if [ "$RANK" = "1" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -n "Testing range query... "
TOP=$(redis-cli ZREVRANGE test:lb 0 0)
if [ "$TOP" = "member2" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo -n "Testing TTL setting... "
redis-cli EXPIRE test:lb 300 > /dev/null
TTL=$(redis-cli TTL test:lb)
if [ "$TTL" -gt "0" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Configuration summary
echo ""
echo "=== Configuration Summary ==="
echo "Leaderboard types: $(redis-cli HLEN leaderboard:config:types)"
echo "Retention policies: $(redis-cli HLEN leaderboard:config:retention)"
echo "Size limits: $(redis-cli HLEN leaderboard:config:max_size)"
echo "Update frequencies: $(redis-cli HLEN leaderboard:config:update_freq)"

# Cleanup
redis-cli DEL test:lb > /dev/null 2>&1

echo ""
echo "=== Validation Summary ==="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo "✅ All leaderboard tests passed!"
else
    echo "❌ Some tests failed. Please review the configuration."
fi
