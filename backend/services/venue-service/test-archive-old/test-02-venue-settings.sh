#!/bin/bash
set -e
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "TEST GROUP 2: VENUE SETTINGS"
echo "========================================="
echo ""

echo "🔐 Logging in..."
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
    "name": "Settings Test Venue",
    "email": "settings-venue@example.com",
    "type": "theater",
    "capacity": 500,
    "address": {
      "street": "200 Settings St",
      "city": "Chicago",
      "state": "IL",
      "zipCode": "60601",
      "country": "US"
    }
  }' | jq -r '.id')

if [ "$VENUE_ID" == "null" ]; then
  echo -e "${RED}❌ Setup failed - could not create venue${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Setup complete - Venue ID: $VENUE_ID${NC}"
echo ""

echo "Test 1: Get Default Settings"
SETTINGS=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID/settings" \
  -H "Authorization: Bearer $TOKEN")

CURRENCY=$(echo "$SETTINGS" | jq -r '.general.currency')
if [ "$CURRENCY" != "USD" ]; then
  echo -e "${RED}❌ FAILED - Default currency not USD${NC}"
  echo "$SETTINGS" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Default settings retrieved${NC}"
echo ""

echo "Test 2: Update Settings"
UPDATE=$(curl -s -X PUT "http://localhost:3002/api/v1/venues/$VENUE_ID/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "general": {
      "currency": "EUR"
    },
    "ticketing": {
      "maxTicketsPerOrder": 20
    }
  }')

SUCCESS=$(echo "$UPDATE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ FAILED - Could not update settings${NC}"
  echo "$UPDATE" | jq '.'
  exit 1
fi
echo -e "${GREEN}✅ PASSED - Settings updated${NC}"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ ALL SETTINGS TESTS PASSED (2/2)${NC}"
echo -e "${GREEN}=========================================${NC}"
