#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "TEST GROUP 4: HEALTH CHECKS"
echo "========================================="
echo ""

# Test 1: Basic Health
echo "Test 1: Basic Health"
HEALTH=$(curl -s http://localhost:3002/health)
STATUS=$(echo "$HEALTH" | jq -r '.status')
if [ "$STATUS" != "ok" ]; then
  echo -e "${RED}❌ FAILED - Service not healthy${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Basic health OK${NC}"
echo ""

# Test 2: Liveness
echo "Test 2: Liveness Probe"
LIVE=$(curl -s http://localhost:3002/health/live)
LIVE_STATUS=$(echo "$LIVE" | jq -r '.status')
if [ "$LIVE_STATUS" != "alive" ]; then
  echo -e "${RED}❌ FAILED - Not alive${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Liveness OK${NC}"
echo ""

# Test 3: Readiness
echo "Test 3: Readiness Probe"
READY=$(curl -s http://localhost:3002/health/ready)
READY_STATUS=$(echo "$READY" | jq -r '.status')
if [ "$READY_STATUS" == "unhealthy" ]; then
  echo -e "${RED}❌ FAILED - Not ready${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Readiness OK${NC}"
echo ""

# Test 4: Full Health
echo "Test 4: Full Health Check"
FULL=$(curl -s http://localhost:3002/health/full)
DB_STATUS=$(echo "$FULL" | jq -r '.checks.database.status')
if [ "$DB_STATUS" != "ok" ]; then
  echo -e "${RED}❌ FAILED - Database not healthy${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Full health OK${NC}"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ ALL HEALTH TESTS PASSED (4/4)${NC}"
echo -e "${GREEN}=========================================${NC}"
