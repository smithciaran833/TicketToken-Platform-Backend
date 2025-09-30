#!/bin/bash

echo "=== RUNNING ALL L2.1 TESTS ==="
echo "Started at: $(date)"
echo "================================"

# Create results directory
mkdir -p test-results-$(date +%Y%m%d-%H%M%S)
RESULTS_DIR="test-results-$(date +%Y%m%d-%H%M%S)"

# Find all L2.1 test files and sort them numerically
TEST_FILES=$(ls test-L2.1-*.js | sort -V)

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

for TEST_FILE in $TEST_FILES; do
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    TEST_NUM=$(echo $TEST_FILE | grep -oP 'L2\.1-\d{3}')
    
    echo ""
    echo "----------------------------------------"
    echo "Running: $TEST_NUM from $TEST_FILE"
    echo "----------------------------------------"
    
    # Run test and capture output
    timeout 10s node $TEST_FILE > "$RESULTS_DIR/$TEST_NUM.log" 2>&1
    EXIT_CODE=$?
    
    # Check result
    if [ $EXIT_CODE -eq 0 ]; then
        if grep -q "PASSED\|COMPLETE\|✅" "$RESULTS_DIR/$TEST_NUM.log"; then
            echo "✅ $TEST_NUM: PASSED"
            PASS_COUNT=$((PASS_COUNT + 1))
        elif grep -q "FAILED\|❌\|Error" "$RESULTS_DIR/$TEST_NUM.log"; then
            echo "❌ $TEST_NUM: FAILED"
            FAIL_COUNT=$((FAIL_COUNT + 1))
            # Show error for failed tests
            tail -5 "$RESULTS_DIR/$TEST_NUM.log"
        else
            echo "⚠️ $TEST_NUM: UNKNOWN (check log)"
        fi
    elif [ $EXIT_CODE -eq 124 ]; then
        echo "⏱️ $TEST_NUM: TIMEOUT"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        echo "❌ $TEST_NUM: CRASHED (exit code: $EXIT_CODE)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        tail -5 "$RESULTS_DIR/$TEST_NUM.log"
    fi
done

echo ""
echo "========================================"
echo "SUMMARY"
echo "========================================"
echo "Total Tests: $TOTAL_COUNT"
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo "Pass Rate: $(( PASS_COUNT * 100 / TOTAL_COUNT ))%"
echo ""
echo "Full logs saved in: $RESULTS_DIR/"
echo "Completed at: $(date)"
