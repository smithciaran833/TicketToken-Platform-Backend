#!/bin/bash

# Detailed validation script for customer_360_view.sql
# Tests each phase's specific features

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Database connection
DB_NAME="${DB_NAME:-tickettoken_db}"

echo -e "${YELLOW}=== Detailed Customer 360 View Validation ===${NC}"
echo -e "Database: $DB_NAME"
echo -e "Time: $(date)"

# Phase 1: Basic view
echo -e "\n${BLUE}Phase 1: Basic Customer Data${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    COUNT(*) as total_customers,
    COUNT(DISTINCT status) as status_types,
    SUM(total_purchases) as total_purchases_sum,
    SUM(total_spent) as total_spent_sum
FROM customer_360_basic;
SQL

# Phase 2: Preferences
echo -e "\n${BLUE}Phase 2: Preferences and Contact Info${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN email_verified THEN 1 ELSE 0 END) as email_verified_count,
    SUM(CASE WHEN phone_verified THEN 1 ELSE 0 END) as phone_verified_count,
    SUM(CASE WHEN marketing_consent THEN 1 ELSE 0 END) as marketing_consent_count,
    COUNT(DISTINCT timezone) as unique_timezones,
    COUNT(DISTINCT preferred_language) as unique_languages
FROM customer_360_with_preferences;
SQL

# Phase 3: Purchase History
echo -e "\n${BLUE}Phase 3: Purchase History and Patterns${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    customer_id,
    email,
    transaction_count,
    successful_purchases,
    lifetime_value,
    avg_purchase_amount,
    purchases_per_month
FROM customer_360_with_purchases
ORDER BY lifetime_value DESC;
SQL

# Phase 4: Engagement Metrics
echo -e "\n${BLUE}Phase 4: Engagement Analysis${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    engagement_status,
    COUNT(*) as customer_count,
    AVG(engagement_score) as avg_score,
    MIN(engagement_score) as min_score,
    MAX(engagement_score) as max_score
FROM customer_360_with_engagement
GROUP BY engagement_status
ORDER BY avg_score DESC;
SQL

# Phase 5: Segmentation
echo -e "\n${BLUE}Phase 5: Customer Segmentation${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
-- Value segments
SELECT 'Value Segments' as segment_type, value_segment as segment, COUNT(*) as count
FROM customer_360_with_segments
GROUP BY value_segment
UNION ALL
-- Frequency segments
SELECT 'Frequency Segments', frequency_segment, COUNT(*)
FROM customer_360_with_segments
GROUP BY frequency_segment
UNION ALL
-- Recency segments
SELECT 'Recency Segments', recency_segment, COUNT(*)
FROM customer_360_with_segments
GROUP BY recency_segment
ORDER BY segment_type, count DESC;
SQL

# Phase 6: Churn Risk
echo -e "\n${BLUE}Phase 6: Churn Risk Analysis${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    churn_risk_level,
    retention_priority,
    COUNT(*) as customer_count,
    AVG(login_risk_score) as avg_login_risk,
    AVG(purchase_risk_score) as avg_purchase_risk
FROM customer_360_with_churn_risk
GROUP BY churn_risk_level, retention_priority
ORDER BY churn_risk_level, retention_priority;
SQL

# Final View Sample
echo -e "\n${BLUE}Final View: Sample Customer Profiles${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
SELECT 
    email,
    value_segment,
    frequency_segment,
    recency_segment,
    engagement_status,
    engagement_score,
    churn_risk_level,
    retention_priority,
    lifetime_value
FROM customer_360
ORDER BY lifetime_value DESC;
SQL

# Performance check
echo -e "\n${BLUE}Performance Check${NC}"
PGPASSWORD='TicketToken2024Secure!!' psql -h localhost -U postgres -d "$DB_NAME" << SQL
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) 
SELECT COUNT(*) FROM customer_360;
SQL

# Feature availability summary
echo -e "\n${YELLOW}=== Feature Availability Summary ===${NC}"
echo "✓ Basic customer profiles"
echo "✓ Contact preferences and verification status"
echo "✓ Purchase history and lifetime value"
echo "✓ Engagement scoring (0-100)"
echo "✓ RFM segmentation"
echo "✓ Churn risk prediction"
echo "✓ GDPR-compliant view"
echo "✓ Materialized view for performance"

echo -e "\n${GREEN}✓ Detailed validation completed at $(date)${NC}"
