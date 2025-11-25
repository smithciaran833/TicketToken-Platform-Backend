#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  DOCKER INTEGRATION TESTS${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Test 1: Register user
echo -e "${BLUE}Test 1: Register user on auth-service${NC}"
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "docker-test@example.com",
    "password": "TestPass123!",
    "firstName": "Docker",
    "lastName": "Test"
  }')

TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo -e "${GREEN}✅ PASSED - User registered${NC}"
else
  echo -e "${RED}❌ FAILED - Could not register user${NC}"
  echo "$REGISTER_RESPONSE" | jq '.'
  exit 1
fi

# Test 2: Create venue
echo ""
echo -e "${BLUE}Test 2: Create venue on venue-service${NC}"
VENUE_RESPONSE=$(curl -s -X POST http://localhost:3002/api/v1/venues \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Docker Test Arena",
    "type": "arena",
    "capacity": 5000,
    "address": {
      "street": "123 Docker St",
      "city": "Container City",
      "state": "DC",
      "zipCode": "12345",
      "country": "US"
    }
  }')

VENUE_ID=$(echo "$VENUE_RESPONSE" | jq -r '.id')

if [ "$VENUE_ID" != "null" ] && [ -n "$VENUE_ID" ]; then
  echo -e "${GREEN}✅ PASSED - Venue created${NC}"
  echo -e "   Venue ID: $VENUE_ID"
else
  echo -e "${RED}❌ FAILED - Could not create venue${NC}"
  echo "$VENUE_RESPONSE" | jq '.'
  exit 1
fi

# Test 3: Create event
echo ""
echo -e "${BLUE}Test 3: Create event on event-service${NC}"
EVENT_RESPONSE=$(curl -s -X POST http://localhost:3003/api/v1/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "venueId": "'"$VENUE_ID"'",
    "name": "Docker Test Concert",
    "description": "Testing cross-service communication",
    "startsAt": "2025-12-01T19:00:00Z",
    "endsAt": "2025-12-01T23:00:00Z",
    "category": "concert"
  }')

EVENT_ID=$(echo "$EVENT_RESPONSE" | jq -r '.id // .event.id // .data.id')

if [ "$EVENT_ID" != "null" ] && [ -n "$EVENT_ID" ]; then
  echo -e "${GREEN}✅ PASSED - Event created${NC}"
  echo -e "   Event ID: $EVENT_ID"
else
  echo -e "${RED}❌ FAILED - Could not create event${NC}"
  echo "$EVENT_RESPONSE" | jq '.'
  exit 1
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  🎉 ALL INTEGRATION TESTS PASSED!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Cross-service communication verified:${NC}"
echo -e "  Auth → Venue → Event ✅"
echo ""
