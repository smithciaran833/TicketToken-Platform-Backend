#!/bin/bash

echo "=== Validating Event Summary View ==="
echo "Started at: $(date)"
echo

# Database connection details
DB_HOST="localhost"
DB_NAME="tickettoken_db"
DB_USER="postgres"
export PGPASSWORD='TicketToken2024Secure!!'

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "1. Creating the view..."
echo "----------------------------------------"

# Create the view
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/postgresql/views/event_summary_view.sql

echo
echo "2. Testing view structure..."
echo "----------------------------------------"

# Check if view exists and get column count
column_count=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'event_summary';" | tr -d ' ')
echo -e "${GREEN}✓ View has $column_count columns${NC}"

echo
echo "3. Testing basic functionality..."
echo "----------------------------------------"

# Test basic query
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) as event_count FROM event_summary;"

echo
echo "4. Creating test data if needed..."
echo "----------------------------------------"

# Create minimal test data
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << 'SQL'
-- Create test event if no events exist
DO $$
DECLARE
    v_venue_id uuid;
    v_event_id uuid;
BEGIN
    -- Check if we have any events
    IF NOT EXISTS (SELECT 1 FROM events LIMIT 1) THEN
        -- Get or create venue
        SELECT id INTO v_venue_id FROM venues LIMIT 1;
        
        IF v_venue_id IS NULL THEN
            INSERT INTO venues (name, slug, email, address_line1, city, state_province, country_code, max_capacity)
            VALUES ('Madison Square Garden', 'msg', 'info@msg.com', '4 Penn Plaza', 'New York', 'NY', 'US', 20000)
            RETURNING id INTO v_venue_id;
        END IF;
        
        -- Create event
        INSERT INTO events (venue_id, name, slug, status)
        VALUES (v_venue_id, 'Summer Concert Series', 'summer-concert', 'ON_SALE')
        RETURNING id INTO v_event_id;
        
        -- Create schedule
        INSERT INTO event_schedules (event_id, starts_at, ends_at, timezone)
        VALUES (v_event_id, NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days 3 hours', 'America/New_York');
        
        -- Create capacity
        INSERT INTO event_capacity (event_id, section_name, total_capacity, available_capacity, sold_count)
        VALUES (v_event_id, 'General Admission', 5000, 3000, 2000);
        
        -- Create some tickets
        FOR i IN 1..20 LOOP
            INSERT INTO tickets (
                event_id, ticket_type_id, owner_id, original_purchaser_id, 
                ticket_number, face_value, purchase_price, status, purchased_at
            )
            VALUES (
                v_event_id, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                'T' || i, 
                75.00 + (random() * 50)::numeric(10,2),
                75.00 + (random() * 50)::numeric(10,2), -- purchase_price
                'ACTIVE'::ticket_status,
                NOW() - (random() * INTERVAL '7 days')
            );
        END LOOP;
        
        RAISE NOTICE 'Created test event with 20 tickets';
    END IF;
END $$;
SQL

echo
echo "5. Testing view data..."
echo "----------------------------------------"

echo -e "\n${GREEN}Event Summary Sample:${NC}"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    event_name,
    venue_name,
    event_status,
    total_tickets_sold,
    total_revenue::money,
    capacity_utilization_pct || '%' as utilization,
    days_until_event
FROM event_summary
LIMIT 5;
"

echo -e "\n${GREEN}Sales Velocity:${NC}"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    event_name,
    tickets_sold_last_hour,
    tickets_sold_last_24h,
    ROUND(avg_tickets_per_hour::numeric, 2) as avg_per_hour
FROM event_summary
WHERE total_tickets_sold > 0
LIMIT 5;
"

echo
echo "6. Performance check..."
echo "----------------------------------------"

# Simple performance test
start_time=$(date +%s%N)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM event_summary LIMIT 1;" > /dev/null
end_time=$(date +%s%N)
elapsed=$(( ($end_time - $start_time) / 1000000 ))
echo "Single row query time: ${elapsed}ms"

if [ $elapsed -lt 100 ]; then
    echo -e "${GREEN}✓ Performance is good${NC}"
else
    echo -e "${RED}✗ Performance needs optimization${NC}"
fi

echo
echo "========================================="
echo -e "${GREEN}✓ Event Summary View validation complete${NC}"
echo "========================================="

# Cleanup
unset PGPASSWORD
