#!/bin/bash
set -e
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "TEST GROUP 5: ACCESS & STAFF MANAGEMENT"
echo "========================================="
echo ""

echo "🔐 Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"venue-test@example.com","password":"TestPassword123!"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.tokens.accessToken')
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id')

if [ "$TOKEN" == "null" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Login successful${NC}"
echo "User ID: $USER_ID"
echo ""

echo "Setup: Creating test venue..."
VENUE_ID=$(curl -s -X POST http://localhost:3002/api/v1/venues \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Access Test Venue",
    "email": "access-venue@example.com",
    "type": "comedy_club",
    "capacity": 300,
    "address": {
      "street": "400 Access St",
      "city": "Austin",
      "state": "TX",
      "zipCode": "73301",
      "country": "US"
    }
  }' | jq -r '.id')

if [ "$VENUE_ID" == "null" ]; then
  echo -e "${RED}❌ Setup failed - could not create venue${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Venue created: $VENUE_ID${NC}"
echo ""

echo "Test 1: Check Venue Access"
ACCESS_RESPONSE=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID/check-access" \
  -H "Authorization: Bearer $TOKEN")

HAS_ACCESS=$(echo "$ACCESS_RESPONSE" | jq -r '.hasAccess')
ROLE=$(echo "$ACCESS_RESPONSE" | jq -r '.role')

if [ "$HAS_ACCESS" != "true" ]; then
  echo -e "${RED}❌ FAILED - User should have access${NC}"
  echo "$ACCESS_RESPONSE" | jq '.'
  exit 1
fi

if [ "$ROLE" != "owner" ]; then
  echo -e "${RED}❌ FAILED - User should be owner, got: $ROLE${NC}"
  echo "$ACCESS_RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ PASSED - Access check successful (Role: $ROLE)${NC}"
echo ""

echo "Test 2: List Venue Staff"
STAFF_RESPONSE=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID/staff" \
  -H "Authorization: Bearer $TOKEN")

STAFF_COUNT=$(echo "$STAFF_RESPONSE" | jq 'length')

if [ "$STAFF_COUNT" -lt 1 ]; then
  echo -e "${RED}❌ FAILED - Should have at least 1 staff member (owner)${NC}"
  echo "$STAFF_RESPONSE" | jq '.'
  exit 1
fi

OWNER_ROLE=$(echo "$STAFF_RESPONSE" | jq -r '.[0].role')
if [ "$OWNER_ROLE" != "owner" ]; then
  echo -e "${RED}❌ FAILED - First staff member should be owner${NC}"
  echo "$STAFF_RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ PASSED - Staff list retrieved ($STAFF_COUNT members)${NC}"
echo ""

echo "Test 3: Add Staff Member"
echo "Creating second user for staff testing..."

STAFF_EMAIL="staff-member-$(date +%s)@example.com"
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"$STAFF_EMAIL"'",
    "password": "StaffPassword123!",
    "firstName": "Test",
    "lastName": "StaffMember"
  }')

STAFF_USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id')

if [ "$STAFF_USER_ID" == "null" ] || [ -z "$STAFF_USER_ID" ]; then
  echo -e "${RED}❌ FAILED - Could not create staff user${NC}"
  echo "$REGISTER_RESPONSE" | jq '.'
  exit 1
fi

echo "Staff User ID: $STAFF_USER_ID"

ADD_STAFF_RESPONSE=$(curl -s -X POST "http://localhost:3002/api/v1/venues/$VENUE_ID/staff" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'"$STAFF_USER_ID"'",
    "role": "manager",
    "permissions": ["events:create", "tickets:view"]
  }')

ADDED_STAFF_ID=$(echo "$ADD_STAFF_RESPONSE" | jq -r '.id')

if [ "$ADDED_STAFF_ID" == "null" ] || [ -z "$ADDED_STAFF_ID" ]; then
  echo -e "${RED}❌ FAILED - Could not add staff member${NC}"
  echo "$ADD_STAFF_RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ PASSED - Staff member added (ID: $ADDED_STAFF_ID)${NC}"
echo ""

echo "Verification: Checking staff count increased..."
FINAL_STAFF=$(curl -s -X GET "http://localhost:3002/api/v1/venues/$VENUE_ID/staff" \
  -H "Authorization: Bearer $TOKEN")

FINAL_COUNT=$(echo "$FINAL_STAFF" | jq 'length')

if [ "$FINAL_COUNT" -ne 2 ]; then
  echo -e "${RED}❌ FAILED - Should have 2 staff members now${NC}"
  echo "$FINAL_STAFF" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Verified - Now have $FINAL_COUNT staff members${NC}"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ ALL ACCESS & STAFF TESTS PASSED (3/3)${NC}"
echo -e "${GREEN}=========================================${NC}"
