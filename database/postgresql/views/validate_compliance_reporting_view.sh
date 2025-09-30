#!/bin/bash

# Validation script for compliance_reporting_view.sql
# Tests each incremental phase

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Database connection
DB_NAME="${DB_NAME:-tickettoken_db}"

echo -e "${YELLOW}=== Compliance Reporting View Validation ===${NC}"

# Test each view
echo -e "\nTesting views..."

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 'compliance_reporting_basic' as view_name, COUNT(*) as count FROM compliance_reporting_basic
UNION ALL
SELECT 'compliance_reporting_user_activity', COUNT(*) FROM compliance_reporting_user_activity
UNION ALL
SELECT 'compliance_reporting_data_changes', COUNT(*) FROM compliance_reporting_data_changes
UNION ALL
SELECT 'compliance_reporting_risk_analysis', COUNT(*) FROM compliance_reporting_risk_analysis
UNION ALL
SELECT 'compliance_reporting_with_venues', COUNT(*) FROM compliance_reporting_with_venues
UNION ALL
SELECT 'compliance_reporting', COUNT(*) FROM compliance_reporting;
SQL

echo -e "\n${YELLOW}Testing helper views...${NC}"

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 'daily_compliance_summary' as view_name, COUNT(*) FROM daily_compliance_summary
UNION ALL
SELECT 'user_risk_profile', COUNT(*) FROM user_risk_profile
UNION ALL
SELECT 'table_activity_summary', COUNT(*) FROM table_activity_summary;
SQL

echo -e "\n${YELLOW}Compliance alerts summary:${NC}"

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    alert_level,
    COUNT(*) as operations,
    COUNT(DISTINCT table_name) as tables_affected
FROM compliance_reporting
GROUP BY alert_level
ORDER BY 
    CASE alert_level 
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        ELSE 4
    END;
SQL

echo -e "\n${GREEN}✓ All compliance reporting views operational${NC}"
