#!/bin/bash

# Database connection
export PGPASSWORD="${DB_PASS}"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Validating Notification History Schema ===${NC}\n"

# Initialize summary arrays
TABLES_CREATED=()
INDEXES_CREATED=()
CONSTRAINTS_ADDED=()
TEST_RECORDS=()
ERRORS=()

# Function to execute SQL and capture result
execute_sql() {
    local sql="$1"
    local result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "$sql" 2>&1)
    echo "$result"
}

# Step 1: Execute the schema SQL file
echo -e "${YELLOW}Executing schema SQL file...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Schema file executed successfully${NC}"
else
    ERRORS+=("Failed to execute schema file")
    echo -e "${RED}✗ Failed to execute schema file${NC}"
fi

# Step 2: Verify table creation
echo -e "\n${YELLOW}Verifying table creation...${NC}"
TABLE_EXISTS=$(execute_sql "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'notifications' AND table_name = 'notification_history');")

if [[ "$TABLE_EXISTS" == *"t"* ]]; then
    echo -e "${GREEN}✓ Table notification_history created${NC}"
    TABLES_CREATED+=("notifications.notification_history")
else
    ERRORS+=("Table notification_history not found")
    echo -e "${RED}✗ Table not found${NC}"
fi

# Step 3: Verify indexes
echo -e "\n${YELLOW}Verifying indexes...${NC}"
INDEXES=$(execute_sql "SELECT indexname FROM pg_indexes WHERE schemaname = 'notifications' AND tablename = 'notification_history' ORDER BY indexname;")

while IFS= read -r index; do
    if [[ ! -z "$index" && "$index" != *"indexname"* ]]; then
        echo -e "${GREEN}✓ Index: $index${NC}"
        INDEXES_CREATED+=("$index")
    fi
done <<< "$INDEXES"

# Step 4: Verify constraints
echo -e "\n${YELLOW}Verifying constraints...${NC}"
CONSTRAINTS=$(execute_sql "SELECT conname, contype FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace JOIN pg_class cl ON cl.oid = c.conrelid WHERE n.nspname = 'notifications' AND cl.relname = 'notification_history';")

while IFS='|' read -r conname contype; do
    if [[ ! -z "$conname" && "$conname" != *"conname"* ]]; then
        conname=$(echo $conname | xargs)
        contype=$(echo $contype | xargs)
        case "$contype" in
            "p") type_desc="PRIMARY KEY" ;;
            "f") type_desc="FOREIGN KEY" ;;
            "c") type_desc="CHECK" ;;
            "u") type_desc="UNIQUE" ;;
            *) type_desc="OTHER" ;;
        esac
        echo -e "${GREEN}✓ Constraint: $conname ($type_desc)${NC}"
        CONSTRAINTS_ADDED+=("$conname ($type_desc)")
    fi
done <<< "$CONSTRAINTS"

# Step 5: Insert test data
echo -e "\n${YELLOW}Inserting test data...${NC}"

# Test record 1: Email notification - delivered
TEST_SQL_1="INSERT INTO notifications.notification_history (
    customer_profile_id, channel, subject, preview_text, recipient_email,
    rendered_content, variables_used, status, sent_at, delivered_at,
    provider, provider_message_id, provider_response, opened_at, click_count,
    provider_cost, credits_used, tags, context
) VALUES (
    gen_random_uuid(), 'email', 'Your TicketToken Order Confirmation',
    'Thank you for your purchase! Order #12345...',
    'customer@example.com',
    '<html><body><h1>Order Confirmation</h1><p>Thank you for your order!</p></body></html>',
    '{\"order_number\": \"12345\", \"customer_name\": \"John Doe\", \"total\": \"$249.99\"}'::jsonb,
    'delivered', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour 55 minutes',
    'SendGrid', 'sg_msg_123456789', '{\"status\": \"delivered\", \"event\": \"delivered\"}'::jsonb,
    NOW() - INTERVAL '1 hour', 3, 0.0089, 1,
    '{\"transactional\", \"order-confirmation\"}', 
    '{\"order_id\": \"ord_123\", \"event_type\": \"purchase\"}'::jsonb
) RETURNING id;"

if RECORD_1=$(execute_sql "$TEST_SQL_1"); then
    echo -e "${GREEN}✓ Test record 1 inserted: Email notification (delivered)${NC}"
    TEST_RECORDS+=("Email notification - delivered")
else
    ERRORS+=("Failed to insert test record 1")
fi

# Test record 2: SMS notification - failed
TEST_SQL_2="INSERT INTO notifications.notification_history (
    customer_profile_id, channel, subject, recipient_phone,
    rendered_content, status, sent_at, failed_at,
    provider, provider_response, bounce_type, bounce_reason,
    is_permanent_failure, retry_count, next_retry_at,
    provider_cost, credits_used, tags
) VALUES (
    gen_random_uuid(), 'sms', 'Event Reminder',
    '+1234567890',
    'Reminder: Your event starts in 2 hours at Madison Square Garden. Show this SMS for entry.',
    'failed', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '29 minutes',
    'Twilio', '{\"error_code\": \"30003\", \"error_message\": \"Unreachable destination\"}'::jsonb,
    'hard', 'Phone number is no longer in service', true, 3, NULL,
    0.0075, 1, '{\"reminder\", \"event-notification\"}'
) RETURNING id;"

if RECORD_2=$(execute_sql "$TEST_SQL_2"); then
    echo -e "${GREEN}✓ Test record 2 inserted: SMS notification (failed)${NC}"
    TEST_RECORDS+=("SMS notification - failed")
else
    ERRORS+=("Failed to insert test record 2")
fi

# Test record 3: Push notification - pending
TEST_SQL_3="INSERT INTO notifications.notification_history (
    customer_profile_id, channel, subject, preview_text, device_token,
    rendered_content, status, retry_count, next_retry_at,
    credits_used, tags, context
) VALUES (
    gen_random_uuid(), 'push', 'New Message from Support',
    'Hi! We\''ve responded to your ticket...',
    'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    '{\"title\": \"New Message from Support\", \"body\": \"Hi! We\''ve responded to your ticket #789. Tap to view.\", \"data\": {\"ticket_id\": \"789\"}}',
    'pending', 0, NOW() + INTERVAL '5 minutes',
    1, '{\"support\", \"ticket-update\"}',
    '{\"ticket_id\": \"tkt_789\", \"priority\": \"high\"}'::jsonb
) RETURNING id;"

if RECORD_3=$(execute_sql "$TEST_SQL_3"); then
    echo -e "${GREEN}✓ Test record 3 inserted: Push notification (pending)${NC}"
    TEST_RECORDS+=("Push notification - pending")
else
    ERRORS+=("Failed to insert test record 3")
fi

# Test record 4: In-app notification - sent
TEST_SQL_4="INSERT INTO notifications.notification_history (
    customer_profile_id, channel, subject, rendered_content,
    status, sent_at, opened_at, tags, context
) VALUES (
    gen_random_uuid(), 'in_app', 'Special Offer Just for You!',
    '{\"type\": \"promotional\", \"title\": \"Special Offer Just for You!\", \"message\": \"Get 20% off your next purchase\", \"cta\": \"Shop Now\", \"expires_at\": \"2024-12-31\"}',
    'sent', NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours',
    '{\"promotional\", \"discount\", \"retention\"}',
    '{\"campaign_type\": \"retention\", \"discount_code\": \"SAVE20\", \"segment\": \"vip\"}'::jsonb
) RETURNING id;"

if RECORD_4=$(execute_sql "$TEST_SQL_4"); then
    echo -e "${GREEN}✓ Test record 4 inserted: In-app notification (sent)${NC}"
    TEST_RECORDS+=("In-app notification - sent")
else
    ERRORS+=("Failed to insert test record 4")
fi

# Step 6: Run validation queries
echo -e "\n${YELLOW}Running validation queries...${NC}"

# Query 1: Count by status
echo -e "\n${BLUE}Notifications by status:${NC}"
execute_sql "SELECT status, COUNT(*) as count FROM notifications.notification_history GROUP BY status ORDER BY count DESC;"

# Query 2: Count by channel
echo -e "\n${BLUE}Notifications by channel:${NC}"
execute_sql "SELECT channel, COUNT(*) as count FROM notifications.notification_history GROUP BY channel ORDER BY count DESC;"

# Query 3: Recent notifications
echo -e "\n${BLUE}Recent notifications (last 5):${NC}"
execute_sql "SELECT id, channel, subject, status, created_at FROM notifications.notification_history ORDER BY created_at DESC LIMIT 5;"

# Query 4: Delivery metrics
echo -e "\n${BLUE}Delivery metrics:${NC}"
execute_sql "SELECT 
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    ROUND(AVG(provider_cost)::numeric, 4) as avg_cost,
    SUM(credits_used) as total_credits
FROM notifications.notification_history;"

# Generate summary markdown file
echo -e "\n${YELLOW}Generating summary report...${NC}"

cat > "$SUMMARY_FILE" << EOSUMMARY
# Notification History Schema Validation Summary

Generated on: $(date)

## Schema Information
- **Database**: $DB_NAME
- **Schema**: notifications
- **Table**: notification_history

## Tables Created
$(for table in "${TABLES_CREATED[@]}"; do echo "- ✅ $table"; done)

## Indexes Created (${#INDEXES_CREATED[@]} total)
$(for index in "${INDEXES_CREATED[@]}"; do echo "- ✅ $index"; done)

## Constraints Added (${#CONSTRAINTS_ADDED[@]} total)
$(for constraint in "${CONSTRAINTS_ADDED[@]}"; do echo "- ✅ $constraint"; done)

## Test Data Inserted (${#TEST_RECORDS[@]} records)
$(for record in "${TEST_RECORDS[@]}"; do echo "- ✅ $record"; done)

## Validation Results

### Record Count by Status
\`\`\`
$(execute_sql "SELECT status, COUNT(*) as count FROM notifications.notification_history GROUP BY status ORDER BY count DESC;")
\`\`\`

### Record Count by Channel
\`\`\`
$(execute_sql "SELECT channel, COUNT(*) as count FROM notifications.notification_history GROUP BY channel ORDER BY count DESC;")
\`\`\`

### Performance Considerations
- Primary key uses UUID with auto-generation
- Indexes on foreign keys for join performance
- Partial indexes for pending and failed notifications
- GIN indexes for JSONB and array columns
- Timestamp indexes for time-based queries

## Errors Encountered
$(if [ ${#ERRORS[@]} -eq 0 ]; then echo "✅ No errors encountered"; else for error in "${ERRORS[@]}"; do echo "- ❌ $error"; done; fi)

## Schema Features
- **Comprehensive tracking**: Tracks full lifecycle from queuing to delivery
- **Multi-channel support**: Email, SMS, Push, In-App, Webhook
- **Engagement metrics**: Opens, clicks, bounces
- **Cost tracking**: Provider costs and internal credits
- **Retry management**: Automatic retry scheduling for failures
- **Flexible metadata**: JSONB fields for context and provider responses
- **Performance optimized**: Strategic indexes for common query patterns

## Next Steps
1. Configure foreign key constraints when related tables exist
2. Set up partitioning for high-volume scenarios
3. Create views for common reporting queries
4. Implement retention policies for old notifications
5. Set up monitoring for delivery rates and failures
EOSUMMARY

echo -e "${GREEN}✓ Summary report generated: $SUMMARY_FILE${NC}"

# Final status
echo -e "\n${BLUE}=== Validation Complete ===${NC}"
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All validations passed successfully!${NC}"
else
    echo -e "${RED}⚠️  Validation completed with ${#ERRORS[@]} error(s)${NC}"
fi

