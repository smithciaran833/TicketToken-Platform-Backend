#!/bin/bash
set -e
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "TEST GROUP 1: BASIC VENUE CRUD"
echo "========================================="
echo ""

echo "🔐 Logging in..."
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"venue-test@example.com","password":"TestPassword123!"}' \
  | jq -r '.data.tokens.accessToken')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed - cannot proceed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Login successful${NC}"
echo ""

echo "Test 1: Create Venue"
CREATE_RESPONSE=$(curl -s -X POST http://localhost:3002/api/v1/venues \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test CRUD Arena",
    "email": "crud-arena@example.com",
    "type": "arena",
    "capacity": 1000,
    "address": {
      "street": "100 Test St",
      "city": "Boston",
      "state": "MA",
      "zipCode": "02101",
      "country": "US"
    }
  }')

VENUE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id')
if [ "$VENUE_ID" == "null" ] || [ -z "$VENUE_ID" ]; then
  echo -e "${RED}❌ FAILED - Could not create venue${NC}"
  echo "$CREATE_RESPONSE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Venue created${NC}"
echo "Venue ID: $VENUE_ID"
echo ""

echo "Test 2: Get Venue by ID"
GET_RESPONSE=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID" \
  -H "Authorization: Bearer $TOKEN")

GET_ID=$(echo "$GET_RESPONSE" | jq -r '.id')
if [ "$GET_ID" != "$VENUE_ID" ]; then
  echo -e "${RED}❌ FAILED - Could not retrieve venue${NC}"
  echo "$GET_RESPONSE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Venue retrieved${NC}"
echo ""

echo "Test 3: Update Venue"
UPDATE_RESPONSE=$(curl -s -X PUT "http://localhost:3002/api/v1/venues/$VENUE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"capacity": 1500, "name": "Updated CRUD Arena"}')

UPDATED_CAPACITY=$(echo "$UPDATE_RESPONSE" | jq -r '.capacity // .max_capacity')
if [ "$UPDATED_CAPACITY" != "1500" ]; then
  echo -e "${RED}❌ FAILED - Could not update venue${NC}"
  echo "$UPDATE_RESPONSE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Venue updated${NC}"
echo ""

echo "Test 4: List All Venues"
LIST_RESPONSE=$(curl -s -X GET "http://localhost:3002/api/v1/venues" \
  -H "Authorization: Bearer $TOKEN")

VENUE_COUNT=$(echo "$LIST_RESPONSE" | jq '.data | length')
if [ "$VENUE_COUNT" -lt 1 ]; then
  echo -e "${RED}❌ FAILED - No venues found${NC}"
  echo "$LIST_RESPONSE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Found $VENUE_COUNT venues${NC}"
echo ""

echo "Test 5: Delete Venue"
DELETE_STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X DELETE "http://localhost:3002/api/v1/venues/$VENUE_ID" \
  -H "Authorization: Bearer $TOKEN")

if [ "$DELETE_STATUS" != "204" ]; then
  echo -e "${RED}❌ FAILED - Could not delete venue (Status: $DELETE_STATUS)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Venue deleted${NC}"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ ALL CRUD TESTS PASSED (5/5)${NC}"
echo -e "${GREEN}=========================================${NC}"
