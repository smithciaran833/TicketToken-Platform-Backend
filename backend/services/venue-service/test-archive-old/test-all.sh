#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  VENUE-SERVICE COMPLETE TEST SUITE${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

cd "$(dirname "$0")"

TOTAL_PASSED=0
TOTAL_FAILED=0

# Run each test group - NO FAIL FAST
for test in test-0*.sh; do
  echo ""
  if ./"$test"; then
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
    echo -e "${GREEN}✅ Test group $test PASSED${NC}"
  else
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    echo -e "${RED}❌ Test group $test FAILED${NC}"
    # REMOVED: exit 1  # Continue to next test instead of failing fast
  fi
done

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  FINAL RESULTS${NC}"
echo -e "${BLUE}=========================================${NC}"
if [ $TOTAL_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All $TOTAL_PASSED test groups passed!${NC}"
else
  echo -e "${RED}❌ $TOTAL_FAILED test group(s) failed${NC}"
  echo -e "${GREEN}✅ $TOTAL_PASSED test group(s) passed${NC}"
fi
echo ""

exit $TOTAL_FAILED
