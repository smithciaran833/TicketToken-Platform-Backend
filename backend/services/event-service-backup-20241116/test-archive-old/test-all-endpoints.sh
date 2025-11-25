#!/bin/bash
set -e

BASE_URL="http://localhost:3003/api/v1"
AUTH_URL="http://localhost:3001"
PASS=0
FAIL=0

echo "========================================="
echo "  EVENT-SERVICE ENDPOINT TEST SUITE"
echo "========================================="

# Get token
TOKEN=$(curl -s -X POST $AUTH_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test2@test.com","password":"Test123!@#"}' | jq -r '.data.tokens.accessToken')

[ -z "$TOKEN" ] && echo "❌ No token" && exit 1
echo "✅ Token obtained"

VENUE_ID="7025024b-7dab-4e9a-87d9-ea83caf1dc06"

# Create event
echo ""
echo "Creating test event..."
EVENT_ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"venue_id":"'$VENUE_ID'","name":"Test '$(date +%s)'","description":"Test","short_description":"Test","event_type":"single","status":"DRAFT","starts_at":"2025-12-01T19:00:00Z","ends_at":"2025-12-01T23:00:00Z","doors_open":"2025-12-01T18:00:00Z","timezone":"America/New_York","capacity":1000}' \
  "$BASE_URL/events" | jq -r '.id')

[ -z "$EVENT_ID" ] && echo "❌ Failed to create event" && exit 1
echo "✅ Event created: $EVENT_ID"

echo ""
echo "Running tests..."

# Test 1
echo -n "1. GET /events ... "
if curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/events" | jq -e '.events' >/dev/null 2>&1; then
  echo "✅"
  ((PASS++))
else
  echo "❌"
  ((FAIL++))
fi

# Test 2  
echo -n "2. GET /events/:id ... "
if curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/events/$EVENT_ID" | jq -e '.id' >/dev/null 2>&1; then
  echo "✅"
  ((PASS++))
else
  echo "❌"
  ((FAIL++))
fi

# Test 3
echo -n "3. PUT /events/:id ... "
if curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"description":"Updated"}' "$BASE_URL/events/$EVENT_ID" | jq -e '.id' >/dev/null 2>&1; then
  echo "✅"
  ((PASS++))
else
  echo "❌"
  ((FAIL++))
fi

# Test 4
echo -n "4. POST /events/:id/publish ... "
if curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/events/$EVENT_ID/publish" | jq -e '.status' >/dev/null 2>&1; then
  echo "✅"
  ((PASS++))
else
  echo "❌"
  ((FAIL++))
fi

# Test 5
echo -n "5. GET /venues/:id/events ... "
if curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/venues/$VENUE_ID/events" | jq -e '.events' >/dev/null 2>&1; then
  echo "✅"
  ((PASS++))
else
  echo "❌"
  ((FAIL++))
fi

echo ""
echo "========================================="
echo "✅ PASSED: $PASS"
echo "❌ FAILED: $FAIL"
echo "========================================="

# Cleanup
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE_URL/events/$EVENT_ID" >/dev/null 2>&1
echo "Cleaned up test event"

[ $FAIL -eq 0 ] && exit 0 || exit 1
