#!/bin/bash
set -e
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "TEST GROUP 3: VENUE INTEGRATIONS"
echo "========================================="
echo ""

TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"venue-test@example.com","password":"TestPassword123!"}' \
  | jq -r '.data.tokens.accessToken')

if [ "$TOKEN" == "null" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Login successful${NC}"
echo ""

echo "Setup: Creating test venue..."
VENUE_ID=$(curl -s -X POST http://localhost:3002/api/v1/venues \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Integration Test Venue",
    "email": "integrations-venue@example.com",
    "type": "arena",
    "capacity": 800,
    "address": {
      "street": "300 Integration Ave",
      "city": "Seattle",
      "state": "WA",
      "zipCode": "98101",
      "country": "US"
    }
  }' | jq -r '.id')

if [ "$VENUE_ID" == "null" ]; then
  echo -e "${RED}❌ Setup failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Venue created: $VENUE_ID${NC}"
echo ""

echo "Test 1: List Empty Integrations"
INTEGRATIONS=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID/integrations" \
  -H "Authorization: Bearer $TOKEN")

COUNT=$(echo "$INTEGRATIONS" | jq 'length')
if [ "$COUNT" != "0" ]; then
  echo -e "${RED}❌ FAILED - Expected 0 integrations${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - No integrations found${NC}"
echo ""

echo "Test 2: Create Integration"
INTEGRATION=$(curl -s -X POST "http://localhost:3002/api/v1/venues/$VENUE_ID/integrations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "stripe",
    "config": {
      "environment": "sandbox"
    },
    "credentials": {
      "apiKey": "sk_test_abc123",
      "secretKey": "secret_xyz789"
    }
  }')

INTEGRATION_ID=$(echo "$INTEGRATION" | jq -r '.id')
if [ "$INTEGRATION_ID" == "null" ]; then
  echo -e "${RED}❌ FAILED - Could not create integration${NC}"
  echo "$INTEGRATION" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Integration created: $INTEGRATION_ID${NC}"
echo ""

echo "Test 3: Get Integration"
GET_INT=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID/integrations/$INTEGRATION_ID" \
  -H "Authorization: Bearer $TOKEN")

INT_TYPE=$(echo "$GET_INT" | jq -r '.integration_type')
if [ "$INT_TYPE" != "stripe" ]; then
  echo -e "${RED}❌ FAILED - Wrong integration type${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Integration retrieved${NC}"
echo ""

echo "Test 4: Update Integration"
UPDATE_INT=$(curl -s -X PUT "http://localhost:3002/api/v1/venues/$VENUE_ID/integrations/$INTEGRATION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config": {"environment": "production"}}')

if [ "$(echo "$UPDATE_INT" | jq -r '.id')" == "null" ]; then
  echo -e "${RED}❌ FAILED - Could not update integration${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Integration updated${NC}"
echo ""

echo "Test 5: Test Integration Connection"
TEST_INT=$(curl -s -X POST "http://localhost:3002/api/v1/venues/$VENUE_ID/integrations/$INTEGRATION_ID/test" \
  -H "Authorization: Bearer $TOKEN")

SUCCESS=$(echo "$TEST_INT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ FAILED - Integration test failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Integration tested${NC}"
echo ""

echo "Test 6: Delete Integration"
DELETE_STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
  -X DELETE "http://localhost:3002/api/v1/venues/$VENUE_ID/integrations/$INTEGRATION_ID" \
  -H "Authorization: Bearer $TOKEN")

if [ "$DELETE_STATUS" != "204" ]; then
  echo -e "${RED}❌ FAILED - Could not delete integration${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Integration deleted${NC}"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ ALL INTEGRATION TESTS PASSED (6/6)${NC}"
echo -e "${GREEN}=========================================${NC}"
