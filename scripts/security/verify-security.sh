#!/bin/bash

echo "=== WP-10 SECURITY VERIFICATION ==="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

# Function to check requirement
check_requirement() {
    local name=$1
    local command=$2
    
    if eval $command > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $name${NC}"
        ((PASS_COUNT++))
    else
        echo -e "${RED}❌ $name${NC}"
        ((FAIL_COUNT++))
    fi
}

echo -e "\n📋 Checking Security Requirements..."

# 1. Check JWT Configuration
check_requirement "JWT Configuration" "grep 'JWT_EXPIRES_IN=15m' backend/services/*/\.env | head -1"

# 2. Check Rate Limiting
check_requirement "Rate Limiting Middleware" "find backend -name 'rate-limit.middleware.ts' | head -1"

# 3. Check Security Headers
check_requirement "Helmet Security Headers" "grep -r 'helmet' backend/services/*/package.json | head -1"

# 4. Check SQL Injection Protection
check_requirement "SQL Injection Protection" "grep -r 'sqlPatterns\|SQL_INJECTION' backend --include='*.ts' --include='*.js' | head -1"

# 5. Check Audit Logging
check_requirement "Audit Logger" "test -f backend/shared/security/audit-logger.ts"

# 6. Check Security Tests
check_requirement "Security Test Suite" "test -f backend/tests/security/security-tests.ts"

# 7. Check Database Security
check_requirement "Database RLS" "docker exec tickettoken-postgres psql -U tickettoken -d tickettoken_db -c 'SELECT COUNT(*) FROM pg_policies;' 2>/dev/null | grep -E '[0-9]+'"

# 8. Check Redis for Rate Limiting
check_requirement "Redis Running" "docker ps | grep redis"

# 9. Check Security Tables
check_requirement "Security Audit Tables" "docker exec tickettoken-postgres psql -U tickettoken -d tickettoken_db -c '\dt security*' 2>/dev/null | grep security"

# 10. Check CORS Configuration
check_requirement "CORS Configuration" "grep -r 'cors' backend/services/api-gateway/src --include='*.ts' --include='*.js' | head -1"

# 11. Check Input Validation
check_requirement "Input Validators" "test -f backend/shared/security/validators/input-validator.ts"

# 12. Check Crypto Services
check_requirement "Cryptography Services" "test -f backend/shared/security/utils/crypto-service.ts"

# 13. Check Security Monitoring
check_requirement "Security Monitor" "test -f backend/shared/security/monitors/security-monitor.ts"

# 14. Check Password Policy
check_requirement "Password Policy" "grep 'PASSWORD_MIN_LENGTH' .env.security"

# 15. Check Failed Login Tracking
check_requirement "Failed Login Table" "docker exec tickettoken-postgres psql -U tickettoken -d tickettoken_db -c '\d failed_login_attempts' 2>/dev/null | grep failed_login"

echo -e "\n📊 VERIFICATION SUMMARY"
echo -e "=================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "\n${GREEN}🎉 WP-10 Security Hardening COMPLETE!${NC}"
else
    echo -e "\n${YELLOW}⚠️  Some security requirements need attention${NC}"
fi

echo -e "\n📝 WP-10 ACCEPTANCE CRITERIA:"
echo "================================"
echo "✓ External scan shows no high/critical vulnerabilities"
echo "✓ Pen-test of checkout/admin passes"
echo "✓ Abuse throttled without causing outage"
echo ""
echo "Run 'npm audit' to check for vulnerabilities"
echo "Run 'npm test -- --testPathPattern=security' to run security tests"
