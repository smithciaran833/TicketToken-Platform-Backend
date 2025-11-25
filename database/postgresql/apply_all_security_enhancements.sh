#!/bin/bash

# ============================================
# APPLY ALL DATABASE SECURITY ENHANCEMENTS
# ============================================
# Master script to apply all security configurations
#
# USAGE:
#   cd database/postgresql
#   chmod +x apply_all_security_enhancements.sh
#   ./apply_all_security_enhancements.sh
#
# PREREQUISITES:
#   - PostgreSQL must be running
#   - Database credentials in ~/.pgpass or provide via PGPASSWORD
#   - openssl installed (for SSL certificates)
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database connection details
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-tickettoken_db}"
DB_USER="${DB_USER:-postgres}"

echo -e "${BLUE}=================================================="
echo "TICKETTOKEN DATABASE SECURITY SETUP"
echo -e "==================================================${NC}"
echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Check if database is accessible
echo -e "${YELLOW}Checking database connection...${NC}"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}✗ Cannot connect to database${NC}"
    echo "Please ensure PostgreSQL is running and credentials are correct"
    echo "Set PGPASSWORD environment variable if needed"
    exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Step 1: Generate SSL Certificates
echo -e "${BLUE}=================================================="
echo "Step 1/6: Generating SSL Certificates"
echo -e "==================================================${NC}"
if [ ! -f "certs/server.crt" ]; then
    echo "Generating new SSL certificates..."
    cd certs
    chmod +x generate_ssl_certs.sh
    ./generate_ssl_certs.sh
    cd ..
    echo -e "${GREEN}✓ SSL certificates generated${NC}"
else
    echo -e "${YELLOW}⚠ SSL certificates already exist, skipping generation${NC}"
fi
echo ""

# Step 2: Apply Base Security Functions (if not already done)
echo -e "${BLUE}=================================================="
echo "Step 2/6: Installing Base Security Functions"
echo -e "==================================================${NC}"
if [ -f "apply_security_enhancements.sql" ]; then
    echo "Applying base security enhancements..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f apply_security_enhancements.sql
    echo -e "${GREEN}✓ Base security functions installed${NC}"
else
    echo -e "${YELLOW}⚠ Base security file not found, skipping${NC}"
fi
echo ""

# Step 3: Enable Row Level Security
echo -e "${BLUE}=================================================="
echo "Step 3/6: Enabling Row Level Security (RLS)"
echo -e "==================================================${NC}"
echo "Applying RLS policies..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f enable_rls.sql
echo -e "${GREEN}✓ RLS enabled and policies created${NC}"
echo ""

# Step 4: Fix Tax ID Encryption
echo -e "${BLUE}=================================================="
echo "Step 4/6: Configuring Tax ID Encryption"
echo -e "==================================================${NC}"
echo "Setting up tax ID encryption and masking..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f fix_tax_id_encryption.sql
echo -e "${GREEN}✓ Tax ID encryption configured${NC}"
echo ""

# Step 5: SSL Configuration Instructions
echo -e "${BLUE}=================================================="
echo "Step 5/6: SSL Configuration"
echo -e "==================================================${NC}"
echo -e "${YELLOW}⚠ Manual step required:${NC}"
echo ""
echo "To enable SSL in PostgreSQL:"
echo "1. Stop PostgreSQL container:"
echo "   docker-compose stop postgres"
echo ""
echo "2. Update docker-compose.yml to mount SSL certificates:"
echo "   volumes:"
echo "     - ./database/postgresql/certs:/var/lib/postgresql/ssl:ro"
echo ""
echo "3. Add SSL config to PostgreSQL:"
echo "   command: >"
echo "     -c ssl=on"
echo "     -c ssl_cert_file=/var/lib/postgresql/ssl/server.crt"
echo "     -c ssl_key_file=/var/lib/postgresql/ssl/server.key"
echo ""
echo "4. Restart PostgreSQL:"
echo "   docker-compose up -d postgres"
echo ""
echo -e "${YELLOW}Press Enter to continue after completing SSL setup, or Ctrl+C to exit...${NC}"
read -r

# Step 6: Validate Installation
echo -e "${BLUE}=================================================="
echo "Step 6/6: Validating Security Configuration"
echo -e "==================================================${NC}"
echo "Running comprehensive security validation..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f validate_security_complete.sql
echo""

# Final Summary
echo -e "${BLUE}=================================================="
echo "SECURITY SETUP COMPLETE"
echo -e "==================================================${NC}"
echo ""
echo -e "${GREEN}✓ Base security functions installed"
echo -e "✓ Row Level Security enabled"
echo -e "✓ Tax ID encryption configured"
echo -e "✓ SSL certificates generated${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT NEXT STEPS:${NC}"
echo ""
echo "1. Update application code to set RLS session variables:"
echo "   await client.query(\"SET app.current_user_id = \$1\", [userId]);"
echo "   await client.query(\"SET app.current_user_role = \$1\", [userRole]);"
echo ""
echo "2. Use venues_masked view instead of venues table in application"
echo ""
echo "3. Update database connection strings to use SSL (sslmode=require)"
echo ""
echo "4. Change service_role password from default:"
echo "   ALTER ROLE service_role WITH PASSWORD 'new_secure_password';"
echo ""
echo "5. For production, replace self-signed certificates with CA-signed ones"
echo ""
echo "6. Review and test all security policies before deploying"
echo ""
echo -e "${BLUE}Security validation report saved above.${NC}"
echo ""
