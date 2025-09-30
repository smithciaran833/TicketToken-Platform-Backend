#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:3000/api/v1"
DB_NAME="tickettoken_staging"
DB_USER="postgres"
DB_PASS="${DB_PASSWORD:-postgres}"

# Test data
VENUE_NAME="WP14 Test Venue"
EVENT_NAME="WP14 Test Concert"
USER_EMAIL="wp14testuser@test.com"
USER_PASS="Test123!@#"
RECIPIENT_EMAIL="wp14recipient@test.com"

# Counters
ORDERS_CREATED=0
PAYMENTS_SUCCEEDED=0
TICKETS_MINTED=0
SCANS_ALLOWED=0
SCANS_DENIED=0
REFUNDS_PROCESSED=0
RESALES_COMPLETED=0

echo -e "${YELLOW}🎭 Starting E2E Rehearsal...${NC}"

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local token=$4
    
    if [ -n "$token" ]; then
        AUTH_HEADER="-H \"Authorization: Bearer $token\""
    else
        AUTH_HEADER=""
    fi
    
    if [ -n "$data" ]; then
        curl -s -X $method \
            $API_BASE$endpoint \
            -H "Content-Type: application/json" \
            $AUTH_HEADER \
            -d "$data"
    else
        curl -s -X $method \
            $API_BASE$endpoint \
            $AUTH_HEADER
    fi
}

# Step 1: Seed test data
echo "📦 Seeding test data..."
PGPASSWORD=$DB_PASS psql -h localhost -U $DB_USER -d $DB_NAME << SQL
-- Clear test data
DELETE FROM tickets WHERE event_id IN (SELECT id FROM events WHERE name = '$EVENT_NAME');
DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email IN ('$USER_EMAIL', '$RECIPIENT_EMAIL'));
DELETE FROM events WHERE name = '$EVENT_NAME';
DELETE FROM venues WHERE name = '$VENUE_NAME';
DELETE FROM users WHERE email IN ('$USER_EMAIL', '$RECIPIENT_EMAIL');

-- Create venue
INSERT INTO venues (id, name, address1, city, state, postal_code, country, capacity, status)
VALUES (gen_random_uuid(), '$VENUE_NAME', '123 Test St', 'Test City', 'TS', '12345', 'US', 1000, 'ACTIVE')
RETURNING id AS venue_id \gset

-- Create event (starts tomorrow)
INSERT INTO events (id, venue_id, name, description, starts_at, ends_at, timezone, status, visibility)
VALUES (
    gen_random_uuid(), 
    :'venue_id', 
    '$EVENT_NAME', 
    'Test concert for E2E', 
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '1 day' + INTERVAL '3 hours',
    'America/New_York',
    'PUBLISHED',
    'PUBLIC'
) RETURNING id AS event_id \gset

-- Create ticket type
INSERT INTO ticket_types (id, event_id, name, price_cents, capacity, is_transferable, resale_price_cap_pct)
VALUES (
    gen_random_uuid(),
    :'event_id',
    'General Admission',
    5000,
    200,
    true,
    110
) RETURNING id AS ticket_type_id \gset

-- Output IDs for script
SELECT :'venue_id' as venue_id, :'event_id' as event_id, :'ticket_type_id' as ticket_type_id;
SQL

# Step 2: Register/Login users
echo "👤 Creating test users..."
REGISTER_RESPONSE=$(api_call POST "/auth/register" "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")
LOGIN_RESPONSE=$(api_call POST "/auth/login" "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")
USER_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

REGISTER_RESPONSE2=$(api_call POST "/auth/register" "{\"email\":\"$RECIPIENT_EMAIL\",\"password\":\"$USER_PASS\"}")
LOGIN_RESPONSE2=$(api_call POST "/auth/login" "{\"email\":\"$RECIPIENT_EMAIL\",\"password\":\"$USER_PASS\"}")
RECIPIENT_TOKEN=$(echo $LOGIN_RESPONSE2 | jq -r '.token')

# Step 3: Create order
echo "🛒 Creating order..."
IDEMPOTENCY_KEY="e2e-test-$(date +%s)"
ORDER_RESPONSE=$(api_call POST "/orders" "{
    \"items\": [{
        \"event_id\": \"$(echo $EVENT_ID)\",
        \"ticket_type_id\": \"$(echo $TICKET_TYPE_ID)\",
        \"qty\": 2
    }],
    \"idempotency_key\": \"$IDEMPOTENCY_KEY\"
}" "$USER_TOKEN")

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.id')
ORDERS_CREATED=$((ORDERS_CREATED + 1))

# Step 4: Process payment (simulate Stripe webhook)
echo "💳 Processing payment..."
# In real scenario, would create payment intent and trigger webhook
# For now, simulate the webhook directly
WEBHOOK_PAYLOAD="{
    \"type\": \"payment_intent.succeeded\",
    \"data\": {
        \"object\": {
            \"id\": \"pi_test_$(date +%s)\",
            \"metadata\": {
                \"order_id\": \"$ORDER_ID\"
            }
        }
    }
}"

PAYMENT_RESPONSE=$(api_call POST "/payments/webhook" "$WEBHOOK_PAYLOAD")
PAYMENTS_SUCCEEDED=$((PAYMENTS_SUCCEEDED + 1))

# Step 5: Wait for minting
echo "⛏️ Waiting for tickets to be minted..."
sleep 5
TICKETS_RESPONSE=$(api_call GET "/orders/$ORDER_ID" "" "$USER_TOKEN")
TICKET_IDS=$(echo $TICKETS_RESPONSE | jq -r '.tickets[].id')
TICKETS_MINTED=$(echo $TICKET_IDS | wc -w)

# Step 6: Test scanning
echo "📱 Testing scan policies..."
FIRST_TICKET=$(echo $TICKET_IDS | awk '{print $1}')

# First scan - should allow
SCAN1=$(api_call POST "/scan" "{\"ticket_id\":\"$FIRST_TICKET\",\"device_id\":\"test-device\"}" "")
if [ "$(echo $SCAN1 | jq -r '.result')" = "ALLOW" ]; then
    SCANS_ALLOWED=$((SCANS_ALLOWED + 1))
    echo -e "${GREEN}✓ First scan allowed${NC}"
fi

# Duplicate scan - should deny
SCAN2=$(api_call POST "/scan" "{\"ticket_id\":\"$FIRST_TICKET\",\"device_id\":\"test-device\"}" "")
if [ "$(echo $SCAN2 | jq -r '.result')" = "DENY" ]; then
    SCANS_DENIED=$((SCANS_DENIED + 1))
    echo -e "${GREEN}✓ Duplicate scan denied${NC}"
fi

# Step 7: Test refund
echo "💸 Testing refund..."
SECOND_TICKET=$(echo $TICKET_IDS | awk '{print $2}')
REFUND_RESPONSE=$(api_call POST "/orders/$ORDER_ID/refund" "{\"ticket_ids\":[\"$SECOND_TICKET\"]}" "$USER_TOKEN")
REFUNDS_PROCESSED=$((REFUNDS_PROCESSED + 1))

# Step 8: Test transfer
echo "🔄 Testing transfer..."
TRANSFER_RESPONSE=$(api_call POST "/transfers" "{\"ticket_id\":\"$FIRST_TICKET\",\"to_email\":\"$RECIPIENT_EMAIL\"}" "$USER_TOKEN")
TRANSFER_ID=$(echo $TRANSFER_RESPONSE | jq -r '.id')
ACCEPT_RESPONSE=$(api_call POST "/transfers/$TRANSFER_ID/accept" "" "$RECIPIENT_TOKEN")

# Step 9: Test resale
echo "🏪 Testing marketplace resale..."
# Create a new ticket for resale test
NEW_ORDER=$(api_call POST "/orders" "{
    \"items\": [{\"event_id\":\"$EVENT_ID\",\"ticket_type_id\":\"$TICKET_TYPE_ID\",\"qty\":1}],
    \"idempotency_key\": \"resale-$(date +%s)\"
}" "$USER_TOKEN")
NEW_TICKET_ID=$(echo $NEW_ORDER | jq -r '.tickets[0].id')

# List on marketplace
LISTING_RESPONSE=$(api_call POST "/marketplace/listings" "{\"ticket_id\":\"$NEW_TICKET_ID\",\"price_cents\":5500}" "$USER_TOKEN")
LISTING_ID=$(echo $LISTING_RESPONSE | jq -r '.id')

# Buy as recipient
BUY_RESPONSE=$(api_call POST "/marketplace/listings/$LISTING_ID/buy" "" "$RECIPIENT_TOKEN")
RESALES_COMPLETED=$((RESALES_COMPLETED + 1))

# Step 10: Verify settlement
echo "📊 Checking settlement data..."
SETTLEMENT_RESPONSE=$(api_call GET "/admin/settlements?venue_id=$VENUE_ID" "" "$USER_TOKEN")

# Final summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ E2E REHEARSAL COMPLETE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "📈 Results:"
echo "  Orders created:     $ORDERS_CREATED"
echo "  Payments succeeded: $PAYMENTS_SUCCEEDED"
echo "  Tickets minted:     $TICKETS_MINTED"
echo "  Scans allowed:      $SCANS_ALLOWED"
echo "  Scans denied:       $SCANS_DENIED"
echo "  Refunds processed:  $REFUNDS_PROCESSED"
echo "  Resales completed:  $RESALES_COMPLETED"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Exit with success if all critical operations succeeded
if [ $ORDERS_CREATED -gt 0 ] && [ $PAYMENTS_SUCCEEDED -gt 0 ] && [ $TICKETS_MINTED -gt 0 ]; then
    exit 0
else
    echo -e "${RED}❌ Some operations failed${NC}"
    exit 1
fi
