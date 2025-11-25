-- Migration: 006_add_analytics_views.sql
-- Description: Add analytics views for KPI tracking
-- Safe: Only creates views, no data modification

BEGIN;

-- Venue KPIs view
CREATE OR REPLACE VIEW analytics_v2.venue_kpis AS
SELECT 
    v.id as venue_id,
    v.name as venue_name,
    DATE_TRUNC('month', e.created_at) as month,
    COUNT(DISTINCT e.id) as events_hosted,
    COUNT(DISTINCT t.id) as tickets_sold,
    SUM(tt.total_supply) as total_capacity,
    CASE 
        WHEN SUM(tt.total_supply) > 0 
        THEN ROUND(100.0 * COUNT(DISTINCT t.id) / SUM(tt.total_supply), 2)
        ELSE 0 
    END as occupancy_rate,
    SUM(p.amount) as gross_revenue,
    SUM(p.platform_fee) as platform_revenue,
    COUNT(DISTINCT t.customer_id) as unique_customers
FROM venues.venues v
LEFT JOIN events.events e ON e.venue_id = v.id
LEFT JOIN tickets.ticket_types tt ON tt.event_id = e.id
LEFT JOIN tickets.tickets t ON t.ticket_type_id = tt.id
LEFT JOIN payments.transactions p ON p.order_id = t.order_id
WHERE v.deleted_at IS NULL
GROUP BY v.id, v.name, DATE_TRUNC('month', e.created_at);

-- Customer engagement view
CREATE OR REPLACE VIEW analytics_v2.customer_engagement AS
SELECT 
    cp.id as customer_id,
    cp.email,
    COUNT(DISTINCT t.id) as total_tickets_purchased,
    COUNT(DISTINCT e.id) as unique_events_attended,
    COUNT(DISTINCT e.venue_id) as unique_venues_visited,
    SUM(p.amount) as lifetime_spent,
    MIN(t.created_at) as first_purchase,
    MAX(t.created_at) as last_purchase,
    EXTRACT(days FROM (CURRENT_DATE - MAX(t.created_at)::date)) as days_since_last_purchase,
    CASE 
        WHEN MAX(t.created_at) > CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'active'
        WHEN MAX(t.created_at) > CURRENT_TIMESTAMP - INTERVAL '180 days' THEN 'at_risk'
        ELSE 'churned'
    END as customer_status
FROM customers.customer_profiles cp
LEFT JOIN tickets.tickets t ON t.customer_id = cp.id
LEFT JOIN tickets.ticket_types tt ON t.ticket_type_id = tt.id
LEFT JOIN events.events e ON tt.event_id = e.id
LEFT JOIN payments.transactions p ON p.order_id = t.order_id
GROUP BY cp.id, cp.email;

-- Event sales performance view
CREATE OR REPLACE VIEW analytics_v2.event_sales_performance AS
SELECT 
    e.id as event_id,
    e.name as event_name,
    e.event_date,
    v.name as venue_name,
    SUM(tt.total_supply) as total_capacity,
    COUNT(DISTINCT t.id) as tickets_sold,
    SUM(tt.total_supply) - COUNT(DISTINCT t.id) as tickets_available,
    CASE 
        WHEN SUM(tt.total_supply) > 0 
        THEN ROUND(100.0 * COUNT(DISTINCT t.id) / SUM(tt.total_supply), 2)
        ELSE 0 
    END as sell_through_rate,
    SUM(p.amount) as total_revenue,
    AVG(p.amount) as avg_ticket_price,
    COUNT(DISTINCT t.customer_id) as unique_buyers,
    e.event_date - CURRENT_DATE as days_until_event
FROM events.events e
JOIN venues.venues v ON e.venue_id = v.id
LEFT JOIN tickets.ticket_types tt ON tt.event_id = e.id
LEFT JOIN tickets.tickets t ON t.ticket_type_id = tt.id
LEFT JOIN payments.transactions p ON p.order_id = t.order_id
WHERE e.deleted_at IS NULL
GROUP BY e.id, e.name, e.event_date, v.name;

-- Platform daily metrics view
CREATE OR REPLACE VIEW analytics_v2.platform_daily_metrics AS
SELECT 
    DATE(t.created_at) as date,
    COUNT(DISTINCT t.id) as tickets_sold,
    COUNT(DISTINCT t.customer_id) as unique_customers,
    COUNT(DISTINCT e.id) as active_events,
    SUM(p.amount) as gross_revenue,
    SUM(p.platform_fee) as platform_fee_revenue,
    AVG(p.amount) as avg_transaction_value
FROM tickets.tickets t
JOIN tickets.ticket_types tt ON t.ticket_type_id = tt.id
JOIN events.events e ON tt.event_id = e.id
JOIN payments.transactions p ON p.order_id = t.order_id
WHERE t.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(t.created_at);

-- Grant permissions on views
GRANT SELECT ON ALL TABLES IN SCHEMA analytics_v2 TO tickettoken;

-- Record migration
INSERT INTO core.schema_migrations (version, name, applied_at)
VALUES ('006', 'add_analytics_views', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
