#!/bin/bash

# Validation script for marketplace_activity_view.sql

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Database connection
DB_NAME="${DB_NAME:-tickettoken_db}"

echo -e "${YELLOW}=== Marketplace Activity View Validation ===${NC}"

# Test each view
echo -e "\nTesting views..."

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 'marketplace_activity_basic' as view_name, COUNT(*) as count FROM marketplace_activity_basic
UNION ALL
SELECT 'marketplace_activity_with_listings', COUNT(*) FROM marketplace_activity_with_listings
UNION ALL
SELECT 'marketplace_activity_with_users', COUNT(*) FROM marketplace_activity_with_users
UNION ALL
SELECT 'marketplace_activity_with_fees', COUNT(*) FROM marketplace_activity_with_fees
UNION ALL
SELECT 'marketplace_activity', COUNT(*) FROM marketplace_activity;
SQL

echo -e "\n${GREEN}✓ All marketplace views operational${NC}"
