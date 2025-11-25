#!/bin/bash
# Quick smoke test - tests core auth flow only (5 endpoints)

BASE_URL="http://localhost:3001/auth"
PASS=0
FAIL=0

echo "=== AUTH SERVICE QUICK TEST ==="
echo ""

# 1. Register
REGISTER=$(curl -s -X POST $BASE_URL/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"quick-test-$(date +%s)@example.com\",\"password\":\"Test123!@#\",\"firstName\":\"Quick\",\"lastName\":\"Test\"}")

if echo "$REGISTER" | jq -e '.success == true' > /dev/null; then
  echo "1. Register                    ✓ PASS"
  ((PASS++))
  TOKEN=$(echo "$REGISTER" | jq -r '.data.tokens.accessToken')
  REFRESH=$(echo "$REGISTER" | jq -r '.data.tokens.refreshToken')
  EMAIL=$(echo "$REGISTER" | jq -r '.data.user.email')
else
  echo "1. Register                    ✗ FAIL"
  ((FAIL++))
  exit 1
fi

# 2. Login
LOGIN=$(curl -s -X POST $BASE_URL/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Test123!@#\"}")

if echo "$LOGIN" | jq -e '.success == true' > /dev/null; then
  echo "2. Login                       ✓ PASS"
  ((PASS++))
else
  echo "2. Login                       ✗ FAIL"
  ((FAIL++))
fi

# 3. Get Profile
PROFILE=$(curl -s -X GET $BASE_URL/profile -H "Authorization: Bearer $TOKEN")
if echo "$PROFILE" | jq -e '.success == true' > /dev/null; then
  echo "3. Get Profile                 ✓ PASS"
  ((PASS++))
else
  echo "3. Get Profile                 ✗ FAIL"
  ((FAIL++))
fi

# 4. Token Refresh
REFRESH_RESP=$(curl -s -X POST $BASE_URL/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}")

if echo "$REFRESH_RESP" | jq -e '.success == true' > /dev/null; then
  echo "4. Token Refresh               ✓ PASS"
  ((PASS++))
else
  echo "4. Token Refresh               ✗ FAIL"
  ((FAIL++))
fi

# 5. MFA Setup
MFA=$(curl -s -X POST $BASE_URL/mfa/setup -H "Authorization: Bearer $TOKEN")
if echo "$MFA" | jq -e '.success == true' > /dev/null; then
  echo "5. MFA Setup                   ✓ PASS"
  ((PASS++))
else
  echo "5. MFA Setup                   ✗ FAIL"
  ((FAIL++))
fi

# Cleanup
psql -U postgres -d tickettoken_db -c "DELETE FROM users WHERE email = '$EMAIL';" > /dev/null 2>&1

echo ""
echo "=== RESULTS ==="
echo "PASS: $PASS/5"
echo "FAIL: $FAIL/5"

if [ $PASS -eq 5 ]; then
  echo "✓ AUTH SERVICE CORE FLOW VALIDATED"
  exit 0
else
  echo "✗ ISSUES FOUND"
  exit 1
fi
