#!/bin/bash

echo "========================================="
echo "   WP-10 COMPLETE VERIFICATION"
echo "========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

# Test 1: Port Configuration
echo "📍 PORT CONFIGURATION"
if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API Gateway on port 3000${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ API Gateway NOT on port 3000${NC}"
    ((FAIL++))
fi

# Test 2: Security Headers
echo ""
echo "🔒 SECURITY HEADERS"
HEADERS=$(curl -s -I http://localhost:3000/health 2>/dev/null)
if echo "$HEADERS" | grep -q "X-Frame-Options"; then
    echo -e "${GREEN}✅ X-Frame-Options present${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ X-Frame-Options missing${NC}"
    ((FAIL++))
fi

if echo "$HEADERS" | grep -q "Strict-Transport-Security"; then
    echo -e "${GREEN}✅ HSTS header present${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ HSTS header missing${NC}"
    ((FAIL++))
fi

# Test 3: Rate Limiting
echo ""
echo "⚡ RATE LIMITING"
echo "Testing 120 rapid requests..."
RATE_LIMITED=false
for i in {1..120}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null)
    if [ "$CODE" = "429" ]; then
        RATE_LIMITED=true
        break
    fi
done

if [ "$RATE_LIMITED" = true ]; then
    echo -e "${GREEN}✅ Rate limiting active (blocked at request $i)${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ Rate limiting not working${NC}"
    ((FAIL++))
fi

# Test 4: Services Running
echo ""
echo "🚀 SERVICE STATUS"
SERVICES=("3000:api-gateway" "3001:auth-service" "3002:venue-service" "3006:event-service" "3008:payment-service")
for service in "${SERVICES[@]}"; do
    IFS=':' read -r port name <<< "$service"
    if netstat -tuln | grep -q ":$port "; then
        echo -e "${GREEN}✅ $name on port $port${NC}"
        ((PASS++))
    else
        echo -e "${RED}❌ $name NOT on port $port${NC}"
        ((FAIL++))
    fi
done

# Summary
echo ""
echo "========================================="
echo "   WP-10 FINAL RESULTS"
echo "========================================="
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 WP-10 SECURITY HARDENING COMPLETE!${NC}"
    echo ""
    echo "✓ API Gateway on correct port (3000)"
    echo "✓ Security headers active"
    echo "✓ Rate limiting functional"
    echo "✓ All critical services running"
    echo ""
    echo "Ready for: WP-11 (Observability)"
else
    echo -e "${YELLOW}⚠️  Issues remaining: $FAIL${NC}"
    echo "Run complete-wp10-final.sh again"
fi

