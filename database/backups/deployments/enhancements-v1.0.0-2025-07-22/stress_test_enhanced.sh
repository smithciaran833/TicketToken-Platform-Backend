#!/bin/bash
# Stress test for enhanced database

DB_NAME="tickettoken_test"
echo "=== Running stress tests on enhanced test database ==="
echo "Database: $DB_NAME"
echo ""

# Test 1: Verify all schemas are accessible
echo "Test 1: Schema accessibility..."
sudo -u postgres psql -d $DB_NAME -c "
SELECT COUNT(*) as schema_count 
FROM information_schema.schemata 
WHERE schema_name IN ('core', 'venues', 'events', 'tickets', 'payments', 'marketplace', 
                      'customers', 'notifications', 'integrations', 'compliance', 'blockchain',
                      'analytics_v2', 'partnerships', 'customer_success', 'monitoring', 'operations');"

# Test 2: Test new analytics views performance
echo -e "\nTest 2: Analytics views performance..."
time sudo -u postgres psql -d $DB_NAME -c "
SELECT * FROM analytics_v2.venue_kpis LIMIT 10;"

# Test 3: Test customer engagement view
echo -e "\nTest 3: Customer engagement view..."
time sudo -u postgres psql -d $DB_NAME -c "
SELECT COUNT(*) FROM analytics_v2.customer_engagement;"

# Test 4: Test international columns
echo -e "\nTest 4: International payment support..."
sudo -u postgres psql -d $DB_NAME -c "
INSERT INTO payments.transactions (
    id, order_id, amount, currency_code, exchange_rate, 
    payment_method, status, gateway, gateway_response
) VALUES (
    gen_random_uuid(), gen_random_uuid(), 100.00, 'EUR', 1.10,
    'card', 'completed', 'stripe', '{}'::jsonb
) RETURNING id, amount, currency_code, amount_usd;"

# Test 5: Partnership commission calculation
echo -e "\nTest 5: Partnership tables..."
sudo -u postgres psql -d $DB_NAME -c "
INSERT INTO partnerships.agreements (
    partner_name, partner_type, commission_rate, 
    contract_start_date, status
) VALUES (
    'Test Partner', 'referral', 0.05, 
    CURRENT_DATE, 'active'
) RETURNING id, partner_name, commission_rate;"

# Test 6: Monitoring metrics insertion
echo -e "\nTest 6: Monitoring functionality..."
sudo -u postgres psql -d $DB_NAME -c "
INSERT INTO monitoring.sla_metrics (
    metric_type, service_name, measured_value, 
    sla_target, measurement_period
) VALUES (
    'uptime', 'api', 99.95, 
    99.9, tstzrange(CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP)
) RETURNING id, metric_type, compliance;"

# Test 7: Complex join performance across schemas
echo -e "\nTest 7: Cross-schema query performance..."
time sudo -u postgres psql -d $DB_NAME -c "
SELECT 
    COUNT(*) as total_records
FROM venues.venues v
JOIN events.events e ON e.venue_id = v.id
JOIN tickets.ticket_types tt ON tt.event_id = e.id
JOIN tickets.tickets t ON t.ticket_type_id = tt.id
JOIN payments.transactions p ON p.order_id = t.order_id
WHERE v.deleted_at IS NULL;"

echo -e "\n=== Stress test complete ==="
