#!/bin/bash

# Validation script for customer_360_view.sql
# Tests each incremental phase

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Database connection
DB_NAME="${DB_NAME:-tickettoken_db}"

echo -e "${YELLOW}=== Customer 360 View Validation ===${NC}"

# Test each view
echo -e "\nTesting views..."

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 'customer_360_basic' as view_name, COUNT(*) as count FROM customer_360_basic
UNION ALL
SELECT 'customer_360_with_preferences', COUNT(*) FROM customer_360_with_preferences
UNION ALL
SELECT 'customer_360_with_purchases', COUNT(*) FROM customer_360_with_purchases
UNION ALL
SELECT 'customer_360_with_engagement', COUNT(*) FROM customer_360_with_engagement
UNION ALL
SELECT 'customer_360_with_segments', COUNT(*) FROM customer_360_with_segments
UNION ALL
SELECT 'customer_360_with_churn_risk', COUNT(*) FROM customer_360_with_churn_risk
UNION ALL
SELECT 'customer_360', COUNT(*) FROM customer_360;
SQL

echo -e "\n${YELLOW}Testing helper views...${NC}"

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 'customer_segment_summary' as view_name, COUNT(*) as segments FROM customer_segment_summary
UNION ALL
SELECT 'churn_risk_dashboard', COUNT(*) FROM churn_risk_dashboard
UNION ALL
SELECT 'active_customer_metrics', COUNT(*) FROM active_customer_metrics;
SQL

echo -e "\n${YELLOW}Customer segmentation:${NC}"

PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    value_segment,
    COUNT(*) as customers,
    AVG(lifetime_value) as avg_ltv,
    AVG(engagement_score) as avg_engagement
FROM customer_360
GROUP BY value_segment
ORDER BY avg_ltv DESC;
SQL

echo -e "\n${GREEN}✓ All customer 360 views operational${NC}"
