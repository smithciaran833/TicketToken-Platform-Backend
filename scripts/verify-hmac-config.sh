#!/bin/bash

# HMAC Configuration Verification Script
# Verifies that all services are properly configured for HMAC authentication

echo "============================================"
echo "HMAC Configuration Verification"
echo "============================================"
echo ""

cd "$(dirname "$0")/.." || exit 1

PASS=0
FAIL=0

# Check root .env
echo "=== Root .env File ==="
if [ -f ".env" ]; then
  if grep -q "INTERNAL_HMAC_SECRET=.\{32,\}" .env 2>/dev/null; then
    echo "✅ INTERNAL_HMAC_SECRET: Set (32+ chars)"
    ((PASS++))
  else
    echo "❌ INTERNAL_HMAC_SECRET: Missing or too short"
    ((FAIL++))
  fi

  if grep -q "USE_NEW_HMAC=" .env 2>/dev/null; then
    VALUE=$(grep "USE_NEW_HMAC=" .env | cut -d'=' -f2)
    echo "✅ USE_NEW_HMAC: Set to '$VALUE'"
    ((PASS++))
  else
    echo "❌ USE_NEW_HMAC: Not found"
    ((FAIL++))
  fi
else
  echo "❌ .env file not found"
  ((FAIL+=2))
fi
echo ""

# Check docker-compose.yml
echo "=== docker-compose.yml ==="
if [ -f "docker-compose.yml" ]; then
  HMAC_COUNT=$(grep -c "INTERNAL_HMAC_SECRET:" docker-compose.yml 2>/dev/null || echo 0)
  USE_NEW_COUNT=$(grep -c "USE_NEW_HMAC:" docker-compose.yml 2>/dev/null || echo 0)
  SERVICE_NAME_COUNT=$(grep -c "SERVICE_NAME:" docker-compose.yml 2>/dev/null || echo 0)

  if [ "$HMAC_COUNT" -eq 21 ]; then
    echo "✅ INTERNAL_HMAC_SECRET: All 21 services configured"
    ((PASS++))
  else
    echo "⚠️  INTERNAL_HMAC_SECRET: $HMAC_COUNT/21 services configured"
    ((FAIL++))
  fi

  if [ "$USE_NEW_COUNT" -eq 21 ]; then
    echo "✅ USE_NEW_HMAC: All 21 services configured"
    ((PASS++))
  else
    echo "⚠️  USE_NEW_HMAC: $USE_NEW_COUNT/21 services configured"
    ((FAIL++))
  fi

  if [ "$SERVICE_NAME_COUNT" -eq 21 ]; then
    echo "✅ SERVICE_NAME: All 21 services configured"
    ((PASS++))
  else
    echo "⚠️  SERVICE_NAME: $SERVICE_NAME_COUNT/21 services configured"
    ((FAIL++))
  fi
else
  echo "❌ docker-compose.yml not found"
  ((FAIL+=3))
fi
echo ""

# List all SERVICE_NAMEs
echo "=== Service Names ==="
if [ -f "docker-compose.yml" ]; then
  grep "SERVICE_NAME:" docker-compose.yml | sed 's/.*SERVICE_NAME: //' | sort
fi
echo ""

# Check .gitignore
echo "=== Security Check ==="
if grep -q "^\.env$" .gitignore 2>/dev/null; then
  echo "✅ .env is in .gitignore (secrets protected)"
  ((PASS++))
else
  echo "⚠️  .env may not be in .gitignore"
  ((FAIL++))
fi
echo ""

# Summary
echo "============================================"
echo "Summary: $PASS passed, $FAIL failed"
echo "============================================"

if [ $FAIL -eq 0 ]; then
  echo ""
  echo "🎉 All checks passed! HMAC configuration is ready."
  echo ""
  echo "Next steps:"
  echo "1. To enable HMAC, set USE_NEW_HMAC=true in .env"
  echo "2. Restart services: docker-compose up -d"
  echo "3. Monitor logs for HMAC validation messages"
  exit 0
else
  echo ""
  echo "⚠️  Some checks failed. Please review the issues above."
  exit 1
fi
