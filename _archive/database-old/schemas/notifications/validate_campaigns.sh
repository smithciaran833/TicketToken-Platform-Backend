#!/bin/bash

# Validation script for campaigns schema

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-tickettoken}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"

echo -e "${BLUE}=== Validating Campaigns Schema ===${NC}\n"

# Execute the schema
echo -e "${YELLOW}Executing campaigns.sql...${NC}"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f campaigns.sql

# Verify table exists
echo -e "\n${YELLOW}Verifying table creation...${NC}"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
"SELECT COUNT(*) as table_exists FROM information_schema.tables 
WHERE table_schema = 'notifications' AND table_name = 'campaigns';"

# Count indexes
echo -e "\n${YELLOW}Counting indexes...${NC}"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
"SELECT COUNT(*) as index_count FROM pg_indexes 
WHERE schemaname = 'notifications' AND tablename = 'campaigns';"

# Insert test campaigns
echo -e "\n${YELLOW}Inserting test campaigns...${NC}"

# Test campaign 1: Active email campaign
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
INSERT INTO notifications.campaigns (
    name, slug, description, type, status,
    audience_count, subject_line, preview_text,
    goal_type, goal_target, budget_amount,
    sends_count, opens_count, clicks_count,
    tags
) VALUES (
    'Summer Concert Series Promotion',
    'summer-concert-series-2024',
    'Promote upcoming summer concerts to engaged users',
    'email', 'active',
    50000, 'Hot Summer Concerts - Get Your Tickets Now!',
    'Exclusive presale access for our best customers',
    'conversions', 1000, 5000.00,
    25000, 8750, 2100,
    '{seasonal, concerts, promotion}'
);

-- Test campaign 2: Scheduled SMS campaign
INSERT INTO notifications.campaigns (
    name, slug, type, status,
    scheduled_at, audience_count,
    subject_line, is_ab_test, variants,
    tags
) VALUES (
    'Flash Sale Alert',
    'flash-sale-july-2024',
    'sms', 'scheduled',
    NOW() + INTERVAL '2 days',
    15000,
    'Flash Sale: 50% off selected events!',
    true,
    '{"A": {"discount": "50%"}, "B": {"discount": "40% + free shipping"}}'::jsonb,
    '{flash-sale, sms, urgent}'
);

-- Test campaign 3: Multi-channel campaign
INSERT INTO notifications.campaigns (
    name, slug, type, status,
    audience_count, requires_approval,
    goal_type, goal_target,
    budget_amount, metadata
) VALUES (
    'New Artist Announcement',
    'new-artist-drake-2024',
    'multi_channel', 'draft',
    100000, true,
    'engagement', 50000,
    10000.00,
    '{"artist": "Drake", "tour": "2024 World Tour", "priority": "high"}'::jsonb
);
SQL

# Display campaigns summary
echo -e "\n${BLUE}=== Campaigns Summary ===${NC}"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
"SELECT name, type, status, audience_count, budget_amount 
FROM notifications.campaigns 
ORDER BY created_at DESC;"

# Test the metrics function
echo -e "\n${BLUE}=== Testing Metrics Calculation ===${NC}"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
"SELECT name, 
    (SELECT open_rate FROM notifications.calculate_campaign_metrics(c.id)) as open_rate,
    (SELECT click_rate FROM notifications.calculate_campaign_metrics(c.id)) as click_rate
FROM notifications.campaigns c 
WHERE sends_count > 0;"

echo -e "\n${GREEN}✅ Campaigns schema validation complete!${NC}"

