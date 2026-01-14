#!/bin/bash
#
# Security Scanning Script for Compliance Service
# 
# AUDIT FIX: DEP-M2 - No security scanning scripts
#
# Runs various security tools to check for vulnerabilities

set -e

echo "=========================================="
echo "Compliance Service Security Scan"
echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
OVERALL_STATUS=0

# Function to check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${YELLOW}WARNING: $1 not found. Skipping this scan.${NC}"
        return 1
    fi
    return 0
}

# Function to report status
report_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2 passed${NC}"
    else
        echo -e "${RED}✗ $2 failed${NC}"
        OVERALL_STATUS=1
    fi
}

echo ""
echo "1. NPM Audit (Dependency Vulnerabilities)"
echo "------------------------------------------"
if check_command npm; then
    npm audit --audit-level=moderate 2>&1 || true
    # Only fail on high/critical
    if npm audit --audit-level=high 2>&1 | grep -q "found 0 vulnerabilities"; then
        report_status 0 "NPM Audit"
    else
        npm audit --audit-level=high 2>&1 || true
        report_status 1 "NPM Audit"
    fi
fi

echo ""
echo "2. Secret Detection (detect-secrets)"
echo "------------------------------------------"
if check_command detect-secrets; then
    # Scan for secrets
    detect-secrets scan --all-files --exclude-files "node_modules|dist|coverage" > /tmp/secrets-scan.json 2>&1
    
    # Check if any secrets found
    SECRETS_FOUND=$(cat /tmp/secrets-scan.json | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('results', {})))" 2>/dev/null || echo "0")
    
    if [ "$SECRETS_FOUND" == "0" ]; then
        report_status 0 "Secret Detection"
    else
        echo -e "${YELLOW}Potential secrets found. Review /tmp/secrets-scan.json${NC}"
        report_status 1 "Secret Detection"
    fi
else
    echo "Install with: pip install detect-secrets"
fi

echo ""
echo "3. TypeScript Type Safety"
echo "------------------------------------------"
if check_command npx; then
    if npx tsc --noEmit 2>&1; then
        report_status 0 "TypeScript Compilation"
    else
        report_status 1 "TypeScript Compilation"
    fi
fi

echo ""
echo "4. ESLint Security Rules"
echo "------------------------------------------"
if check_command npx; then
    if npx eslint src/ --ext .ts --max-warnings=0 2>&1; then
        report_status 0 "ESLint Security"
    else
        npx eslint src/ --ext .ts 2>&1 || true
        report_status 1 "ESLint Security"
    fi
fi

echo ""
echo "5. Snyk Vulnerability Scan"
echo "------------------------------------------"
if check_command snyk; then
    if snyk test --severity-threshold=high 2>&1; then
        report_status 0 "Snyk Scan"
    else
        report_status 1 "Snyk Scan"
    fi
else
    echo "Install with: npm install -g snyk && snyk auth"
fi

echo ""
echo "6. Docker Image Scan (trivy)"
echo "------------------------------------------"
if check_command trivy; then
    # Build image first if it exists
    if [ -f "Dockerfile" ]; then
        IMAGE_NAME="compliance-service:scan-$(date +%s)"
        docker build -t "$IMAGE_NAME" . 2>&1 || true
        
        if trivy image --severity HIGH,CRITICAL "$IMAGE_NAME" 2>&1 | grep -q "Total: 0"; then
            report_status 0 "Docker Image Scan"
        else
            trivy image --severity HIGH,CRITICAL "$IMAGE_NAME" 2>&1 || true
            report_status 1 "Docker Image Scan"
        fi
        
        # Cleanup
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
    else
        echo "No Dockerfile found"
    fi
else
    echo "Install with: brew install aquasecurity/trivy/trivy"
fi

echo ""
echo "7. Dependency License Check"
echo "------------------------------------------"
if check_command npx; then
    # Check for problematic licenses
    npx license-checker --summary --production 2>&1 || true
    
    # Check for GPL/AGPL which might be problematic for commercial use
    PROBLEMATIC=$(npx license-checker --production --json 2>/dev/null | grep -E '"(GPL|AGPL)' || echo "")
    
    if [ -z "$PROBLEMATIC" ]; then
        report_status 0 "License Check"
    else
        echo -e "${YELLOW}Found GPL/AGPL licensed dependencies:${NC}"
        echo "$PROBLEMATIC"
        report_status 1 "License Check"
    fi
fi

echo ""
echo "8. Environment Variable Check"
echo "------------------------------------------"
# Check for required environment variables
MISSING_VARS=""
REQUIRED_VARS="DATABASE_URL REDIS_URL JWT_SECRET NODE_ENV"

for var in $REQUIRED_VARS; do
    if [ -z "${!var}" ]; then
        MISSING_VARS="$MISSING_VARS $var"
    fi
done

if [ -z "$MISSING_VARS" ]; then
    report_status 0 "Environment Variables"
else
    echo -e "${YELLOW}Missing required environment variables:$MISSING_VARS${NC}"
    # Don't fail for missing env vars in scan mode
fi

echo ""
echo "9. Hardcoded Credentials Check"
echo "------------------------------------------"
# Search for common patterns indicating hardcoded credentials
HARDCODED=$(grep -rn --include="*.ts" --include="*.js" -E "(password|secret|key|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]" src/ 2>/dev/null | grep -v "process.env" | grep -v ".example" | grep -v "// " | head -20 || echo "")

if [ -z "$HARDCODED" ]; then
    report_status 0 "Hardcoded Credentials"
else
    echo -e "${YELLOW}Potential hardcoded credentials found:${NC}"
    echo "$HARDCODED"
    report_status 1 "Hardcoded Credentials"
fi

echo ""
echo "10. SQL Injection Pattern Check"
echo "------------------------------------------"
# Check for raw SQL query construction
RAW_SQL=$(grep -rn --include="*.ts" -E "(\.query|\.raw)\s*\(\s*\`.*\$\{" src/ 2>/dev/null || echo "")

if [ -z "$RAW_SQL" ]; then
    report_status 0 "SQL Injection Patterns"
else
    echo -e "${YELLOW}Potential SQL injection vulnerabilities:${NC}"
    echo "$RAW_SQL"
    report_status 1 "SQL Injection Patterns"
fi

echo ""
echo "=========================================="
echo "Security Scan Complete"
echo "=========================================="

if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}All security checks passed!${NC}"
else
    echo -e "${RED}Some security checks failed. Please review above.${NC}"
fi

exit $OVERALL_STATUS
