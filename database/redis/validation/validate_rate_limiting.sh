#!/bin/bash
# validate_rate_limiting.sh

echo "=== Comprehensive Rate Limiting Validation ==="
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

# Test all major endpoints exist
run_test "Login endpoint limit" "redis-cli HGET rate_limits:endpoints '/api/auth/login'" "5:900"
run_test "Purchase endpoint limit" "redis-cli HGET rate_limits:endpoints '/api/tickets/purchase'" "10:60"
run_test "NFT mint endpoint limit" "redis-cli HGET rate_limits:endpoints '/api/nft/mint'" "5:300"

# Test tier configurations
run_test "Premium tier multiplier" "redis-cli HGET rate_limits:tiers 'premium'" "2.0"
run_test "VIP tier multiplier" "redis-cli HGET rate_limits:tiers 'vip'" "5.0"

# Test risk configurations
run_test "High risk multiplier" "redis-cli HGET rate_limits:risk_multipliers 'high'" "0.3"
run_test "Critical risk multiplier" "redis-cli HGET rate_limits:risk_multipliers 'critical'" "0.1"

# Test IP limits
run_test "IP login limit" "redis-cli HGET rate_limits:ip '/api/auth/login'" "3:900"

# Test device limits
run_test "Device purchase limit" "redis-cli HGET rate_limits:device '/api/tickets/purchase'" "20:3600"

# Test auto-block thresholds
run_test "Failed login threshold" "redis-cli HGET rate_limits:auto_block 'failed_login_attempts'" "10:3600"

# Test tracking functionality
echo -n "Testing request tracking... "
redis-cli ZADD test:requests $(date +%s) 'req1' > /dev/null
COUNT=$(redis-cli ZCARD test:requests)
if [ "$COUNT" = "1" ]; then
    echo "✓ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "✗ FAILED"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Test configuration counts
echo ""
echo "=== Configuration Summary ==="
echo "Endpoints configured: $(redis-cli HLEN rate_limits:endpoints)"
echo "IP limits configured: $(redis-cli HLEN rate_limits:ip)"
echo "Device limits configured: $(redis-cli HLEN rate_limits:device)"
echo "User tiers configured: $(redis-cli HLEN rate_limits:tiers)"
echo "Risk levels configured: $(redis-cli HLEN rate_limits:risk_multipliers)"

# Cleanup test data
redis-cli DEL test:requests > /dev/null 2>&1

echo ""
echo "=== Validation Summary ==="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo "✅ All rate limiting tests passed!"
else
    echo "❌ Some tests failed. Please review the configuration."
fi
