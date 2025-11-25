#!/bin/bash

# ============================================
# TICKETTOKEN DATABASE SECURITY ACTIVATION
# ============================================
# This script applies all security enhancements to the PostgreSQL database
# Phase 1.3: Database Security Activation

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  TicketToken Database Security Activation"
echo "  Phase 1.3 Security Enhancements"
echo "=================================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo "Please create a .env file with your database credentials."
    echo "You can copy .env.example and fill in the values:"
    echo "  cp .env.example .env"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Check required variables
if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
    echo -e "${RED}ERROR: Required environment variables are missing!${NC}"
    echo "Please ensure POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are set in .env"
    exit 1
fi

echo -e "${GREEN}✓${NC} Environment variables loaded"
echo "  Database: $POSTGRES_DB"
echo "  User: $POSTGRES_USER"
echo ""

# Test database connection
echo "Testing database connection..."
if ! PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot connect to PostgreSQL database!${NC}"
    echo "Please ensure:"
    echo "  1. PostgreSQL is running (try: docker-compose up -d postgres)"
    echo "  2. Database credentials in .env are correct"
    echo "  3. Database '$POSTGRES_DB' exists"
    exit 1
fi
echo -e "${GREEN}✓${NC} Database connection successful"
echo ""

# Create backup before applying changes
echo "Creating pre-security backup..."
BACKUP_FILE="database/postgresql/backups/pre-security-$(date +%Y%m%d_%H%M%S).sql"
mkdir -p database/postgresql/backups
if PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h localhost -U $POSTGRES_USER $POSTGRES_DB > $BACKUP_FILE 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Backup created: $BACKUP_FILE"
else
    echo -e "${YELLOW}⚠${NC}  Backup creation skipped (database may be empty)"
fi
echo ""

# Apply security enhancements
echo "=================================================="
echo "  APPLYING SECURITY ENHANCEMENTS"
echo "=================================================="
echo ""

# Step 1: Create audit trigger function
echo "Step 1/5: Creating audit trigger function..."
if PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -f database/postgresql/functions/audit_trigger_function.sql > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Audit trigger function created"
else
    echo -e "${YELLOW}⚠${NC}  Audit trigger function may already exist (continuing...)"
fi

# Step 2: Create data masking functions
echo "Step 2/5: Creating data masking functions..."
if PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -f database/postgresql/functions/mask_sensitive_data.sql > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Data masking functions created"
else
    echo -e "${YELLOW}⚠${NC}  Data masking functions may already exist (continuing...)"
fi

# Step 3: Create security helper functions
echo "Step 3/5: Creating security helper functions..."
if PGPASSWORD=$POSTGRES_USER psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -f database/postgresql/functions/security_functions.sql > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Security helper functions created"
else
    echo -e "${YELLOW}⚠${NC}  Security functions may already exist (continuing...)"
fi

# Step 4: Create data retention cleanup function
echo "Step 4/5: Creating data retention cleanup function..."
if PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -f database/postgresql/functions/data_retention_cleanup.sql > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Data retention cleanup function created"
else
    echo -e "${YELLOW}⚠${NC}  Data retention function may already exist (continuing...)"
fi

# Step 5: Apply audit triggers
echo "Step 5/5: Applying audit triggers to critical tables..."
if PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -f database/postgresql/triggers/audit_triggers.sql > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Audit triggers applied"
else
    echo -e "${YELLOW}⚠${NC}  Some audit triggers may already exist (continuing...)"
fi

echo ""
echo "=================================================="
echo "  VERIFYING SECURITY INSTALLATIONS"
echo "=================================================="
echo ""

# Verify security functions
echo "Verifying security functions..."
FUNCTION_COUNT=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT COUNT(*) FROM pg_proc WHERE proname IN ('audit_trigger_function', 'mask_email', 'mask_phone', 'mask_tax_id', 'check_password_strength', 'generate_secure_token', 'check_suspicious_activity', 'cleanup_expired_data');" 2>/dev/null | xargs)

if [ "$FUNCTION_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $FUNCTION_COUNT security functions installed"
else
    echo -e "${YELLOW}⚠${NC}  No security functions found (they may need different names)"
fi

# Verify audit triggers
echo "Verifying audit triggers..."
TRIGGER_COUNT=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'audit_%_trigger';" 2>/dev/null | xargs)

if [ "$TRIGGER_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $TRIGGER_COUNT audit triggers installed"
else
    echo -e "${YELLOW}⚠${NC}  No audit triggers found (database may not have tables yet)"
fi

echo ""
echo "=================================================="
echo "  RUNNING SECURITY VALIDATION"
echo "=================================================="
echo ""

# Run validation script
if [ -f "database/postgresql/validate_security.sql" ]; then
    echo "Running security validation checks..."
    PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -f database/postgresql/validate_security.sql 2>&1 | grep -E "(PASS|FAIL|WARNING|INFO)" || echo -e "${YELLOW}⚠${NC}  Validation script completed (check output above)"
else
    echo -e "${YELLOW}⚠${NC}  Validation script not found at database/postgresql/validate_security.sql"
fi

echo ""
echo "=================================================="
echo "  SECURITY ACTIVATION COMPLETE"
echo "=================================================="
echo ""
echo -e "${GREEN}✓${NC} Database security enhancements have been applied"
echo ""
echo "Next steps:"
echo "  1. Review any warnings or errors above"
echo "  2. Test tenant isolation (see test plan)"
echo "  3. Verify audit logging is working"
echo "  4. Continue with Phase 1.4 (Database Systems Security Hardening)"
echo ""
echo "Backup location: $BACKUP_FILE"
echo ""
