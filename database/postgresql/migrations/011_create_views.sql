-- Migration: Create Database Views
-- Version: 011
-- Description: Creates views for dashboards, reports, analytics, and real-time metrics
-- Dependencies: Tables from migrations 001-010
-- Estimated Duration: 30 seconds

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UP Migration
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dashboard Summary Views
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Venue Dashboard View
-- Provides comprehensive venue metrics and statistics
CREATE OR REPLACE VIEW venue_dashboard_view AS
WITH venue_metrics AS (
    SELECT 
        v.id AS venue_id,
        v.name AS venue_name,
        v.status AS venue_status,
        COUNT(DISTINCT e.id) AS total_events,
        COUNT(DISTINCT CASE WHEN e.status = 'ACTIVE' THEN e.id END) AS active_events,
        COUNT(DISTINCT CASE WHEN e.status = 'COMPLETED' THEN e.id END) AS completed_events,
        COUNT(DISTINCT t.id) AS total_tickets_sold,
        COUNT(DISTINCT CASE WHEN t.status = 'REDEEMED' THEN t.id END) AS tickets_redeemed,
        COALESCE(SUM(tr.amount), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN tr.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN tr.amount END), 0) AS revenue_last_30_days,
        COALESCE(SUM(CASE WHEN tr.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN tr.amount END), 0) AS revenue_last_7_days,
        COUNT(DISTINCT t.owner_id) AS unique_customers,
        AVG(CASE WHEN e.status = 'COMPLETED' THEN 
            (
      (SELECT COUNT(*) FROM public.tickets t2 WHERE t2.event_id = e.id AND t2.status NOT IN ('CANCELLED','REFUNDED'))
::NUMERIC / NULLIF(
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)
, 0)) * 100 
        END) AS avg_capacity_utilization
    FROM venues v
    LEFT JOIN events e ON e.venue_id = v.id
    LEFT JOIN tickets t ON t.event_id = e.id AND t.status NOT IN ('CANCELLED', 'REFUNDED')
    LEFT JOIN ticket_transactions tr ON tr.ticket_id = t.id AND tr.status = 'COMPLETED'
    GROUP BY v.id, v.name, v.status
),
upcoming_events AS (
    SELECT 
        venue_id,
        COUNT(*) AS upcoming_events_count,
        MIN(start_date::timestamp) AS next_event_date
    FROM events
    WHERE status = 'ACTIVE' 
    AND start_date::timestamp > CURRENT_TIMESTAMP
    GROUP BY venue_id
)
SELECT 
    vm.*,
    ue.upcoming_events_count,
    ue.next_event_date,
    CURRENT_TIMESTAMP AS last_updated
FROM venue_metrics vm
LEFT JOIN upcoming_events ue ON ue.venue_id = vm.venue_id;

COMMENT ON VIEW venue_dashboard_view IS 'Comprehensive venue metrics for dashboard display';

-- Customer Dashboard View
-- Provides customer activity and purchase history
CREATE OR REPLACE VIEW customer_dashboard_view AS
WITH customer_stats AS (
    SELECT 
        u.id AS user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.status AS user_status,
        COUNT(DISTINCT t.id) AS total_tickets_purchased,
        COUNT(DISTINCT t.event_id) AS events_attended,
        COUNT(DISTINCT e.venue_id) AS venues_visited,
        COALESCE(SUM(tr.amount), 0) AS total_spent,
        MAX(t.created_at) AS last_purchase_date,
        COUNT(DISTINCT CASE WHEN t.created_at >= CURRENT_DATE - INTERVAL '90 days' THEN t.id END) AS tickets_last_90_days
    FROM users u
    LEFT JOIN tickets t ON t.owner_id = u.id AND t.status NOT IN ('CANCELLED', 'REFUNDED')
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN ticket_transactions tr ON tr.ticket_id = t.id AND tr.status = 'COMPLETED'
    WHERE u.role = 'CUSTOMER'
    GROUP BY u.id, u.email, u.first_name, u.last_name, u.status
),
upcoming_tickets AS (
    SELECT 
        t.owner_id AS customer_id,
        COUNT(*) AS upcoming_events_count,
        MIN(e.start_date) AS next_event_date
    FROM tickets t
    JOIN events e ON e.id = t.event_id
    WHERE t.status = 'ACTIVE'
    AND start_date::timestamp > CURRENT_TIMESTAMP
    GROUP BY t.owner_id
)
SELECT 
    cs.*,
    ut.upcoming_events_count,
    ut.next_event_date,
    CASE 
        WHEN cs.tickets_last_90_days >= 10 THEN 'VIP'
        WHEN cs.tickets_last_90_days >= 5 THEN 'FREQUENT'
        WHEN cs.tickets_last_90_days >= 1 THEN 'ACTIVE'
        ELSE 'INACTIVE'
    END AS customer_tier,
    CURRENT_TIMESTAMP AS last_updated
FROM customer_stats cs
LEFT JOIN upcoming_tickets ut ON ut.customer_id = cs.user_id;

COMMENT ON VIEW customer_dashboard_view IS 'Customer activity metrics and purchase history';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Financial Report Views
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Revenue Summary View
-- Aggregates revenue by various dimensions
CREATE OR REPLACE VIEW revenue_summary_view AS
WITH daily_revenue AS (
    SELECT 
        DATE(tr.created_at) AS revenue_date,
        v.id AS venue_id,
        v.name AS venue_name,
        e.id AS event_id,
        e.name AS event_name,
        NULL::text AS event_category,
        COUNT(DISTINCT tr.id) AS transaction_count,
        SUM(tr.amount) AS gross_revenue,
        SUM(0::numeric) AS platform_fees,
        SUM(0::numeric) AS venue_fees,
        SUM(0::numeric) AS payment_fees,
        SUM(tr.amount - COALESCE(0::numeric, 0) - COALESCE(0::numeric, 0) - COALESCE(0::numeric, 0)) AS net_revenue
    FROM marketplace_transactions mt JOIN ticket_transactions tr ON tr.id = mt.ticket_id JOIN tickets t ON t.id = mt.ticket_id
    JOIN events e ON e.id = t.event_id
    JOIN venues v ON v.id = e.venue_id
    WHERE tr.status = 'COMPLETED'
    AND tr.transaction_type IN ('PURCHASE', 'MARKETPLACE_SALE')
    GROUP BY DATE(tr.created_at), v.id, v.name, e.id, e.name
)
SELECT 
    revenue_date,
    venue_id,
    venue_name,
    event_id,
    event_name,
    event_category,
    transaction_count,
    gross_revenue,
    platform_fees,
    venue_fees,
    payment_fees,
    net_revenue,
    SUM(gross_revenue) OVER (PARTITION BY venue_id ORDER BY revenue_date) AS cumulative_venue_revenue,
    SUM(gross_revenue) OVER (ORDER BY revenue_date) AS cumulative_total_revenue
FROM daily_revenue;

COMMENT ON VIEW revenue_summary_view IS 'Daily revenue breakdown by venue and event';

-- Settlement Pending View
-- Shows pending settlements for venues
CREATE MATERIALIZED VIEW settlement_pending_view AS
WITH pending_transactions AS (
    SELECT 
        v.id AS venue_id,
        v.name AS venue_name,
        COUNT(DISTINCT tr.id) AS pending_transaction_count,
        SUM(tr.amount - COALESCE(0::numeric, 0) - COALESCE(0::numeric, 0)) AS pending_amount,
        MIN(tr.created_at) AS oldest_transaction_date,
        MAX(tr.created_at) AS newest_transaction_date
    FROM venues v
    JOIN events e ON e.venue_id = v.id
    JOIN tickets t ON t.event_id = e.id
    JOIN marketplace_transactions mt ON mt.ticket_id = t.id
      JOIN ticket_transactions tr ON tr.id = mt.ticket_id
    WHERE tr.status = 'COMPLETED'
    AND TRUE
    GROUP BY v.id, v.name
)
SELECT 
    venue_id,
    venue_name,
    pending_transaction_count,
    pending_amount,
    oldest_transaction_date,
    newest_transaction_date,
    CURRENT_TIMESTAMP - oldest_transaction_date AS oldest_transaction_age,
FALSE::boolean AS is_overdue,
    CURRENT_TIMESTAMP AS last_calculated
FROM pending_transactions
WHERE pending_amount > 0;

-- Index for materialized view
CREATE INDEX idx_settlement_pending_venue ON settlement_pending_view(venue_id);
CREATE INDEX idx_settlement_pending_overdue ON settlement_pending_view(is_overdue) WHERE is_overdue = TRUE;

COMMENT ON MATERIALIZED VIEW settlement_pending_view IS 'Pending settlements by venue - refresh every hour';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Analytics Views
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Event Performance View
-- Comprehensive event metrics and analytics
CREATE OR REPLACE VIEW event_performance_view AS
WITH event_metrics AS (
    SELECT 
        e.id AS event_id,
        e.name AS event_name,
        e.start_date,
        e.end_date,
        e.status,
        v.name AS venue_name,
        
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)
,
        COUNT(DISTINCT t.id) AS tickets_sold,
        COUNT(DISTINCT CASE WHEN t.status = 'REDEEMED' THEN t.id END) AS tickets_redeemed,
        COUNT(DISTINCT CASE WHEN t.status = 'TRANSFERRED' THEN t.id END) AS tickets_transferred,
        COUNT(DISTINCT CASE WHEN t.status IN ('CANCELLED', 'REFUNDED') THEN t.id END) AS tickets_cancelled,
        (COUNT(DISTINCT t.id)::NUMERIC / NULLIF(
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)
, 0)) * 100 AS capacity_utilization,
        AVG(tr.amount) AS avg_ticket_price,
        MIN(tr.amount) AS min_ticket_price,
        MAX(tr.amount) AS max_ticket_price,
        SUM(tr.amount) AS total_revenue,
        COUNT(DISTINCT t.owner_id) AS unique_buyers,
        AVG(EXTRACT(EPOCH FROM (t.created_at - e.created_at))/3600)::NUMERIC(10,2) AS avg_hours_to_purchase
    FROM events e
    JOIN venues v ON v.id = e.venue_id
    LEFT JOIN tickets t ON t.event_id = e.id AND t.status NOT IN ('CANCELLED', 'REFUNDED')
    LEFT JOIN ticket_transactions tr ON tr.ticket_id = t.id AND tr.status = 'COMPLETED'
    GROUP BY e.id, e.name, e.start_date, e.end_date, e.status, v.name, 
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)

),
sales_velocity AS (
    SELECT 
        event_id,
        COUNT(DISTINCT CASE WHEN t.created_at >= start_date::timestamp - INTERVAL '7 days' THEN t.id END) AS tickets_last_week,
        COUNT(DISTINCT CASE WHEN t.created_at >= start_date::timestamp - INTERVAL '1 day' THEN t.id END) AS tickets_last_day,
        COUNT(DISTINCT CASE WHEN t.created_at >= start_date::timestamp - INTERVAL '1 hour' THEN t.id END) AS tickets_last_hour
    FROM tickets t
    JOIN events e ON e.id = t.event_id
    WHERE t.status NOT IN ('CANCELLED', 'REFUNDED')
    GROUP BY event_id, start_date::timestamp
)
SELECT 
    em.*,
    sv.tickets_last_week,
    sv.tickets_last_day,
    sv.tickets_last_hour,
    CASE 
        WHEN em.capacity_utilization >= 95 THEN 'SOLD_OUT'
        WHEN em.capacity_utilization >= 80 THEN 'HOT'
        WHEN em.capacity_utilization >= 50 THEN 'GOOD'
        ELSE 'SLOW'
    END AS sales_status,
    CURRENT_TIMESTAMP AS last_updated
FROM event_metrics em
LEFT JOIN sales_velocity sv ON sv.event_id = em.event_id;

COMMENT ON VIEW event_performance_view IS 'Comprehensive event performance metrics';

-- Customer 360 View
-- Complete customer profile and behavior
CREATE MATERIALIZED VIEW customer_360_view AS
WITH ph_gaps AS (
    SELECT
        t.owner_id,
        EXTRACT(EPOCH FROM (
            t.created_at - LAG(t.created_at) OVER (PARTITION BY t.owner_id ORDER BY t.created_at)
        )) / 86400.0 AS gap_days
    FROM public.tickets t
    JOIN public.ticket_transactions tr ON tr.ticket_id = t.id AND tr.status = 'COMPLETED'
    WHERE t.status NOT IN ('CANCELLED','REFUNDED')
),
customer_base AS (
    SELECT 
        u.id AS customer_id,
        u.email,
        u.first_name,
        u.last_name,
        u.created_at AS registration_date,
        u.last_login_at,
        u.status,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - u.created_at))/86400 AS days_since_registration,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - u.last_login_at))/86400 AS days_since_login
    FROM users u
    WHERE u.role = 'CUSTOMER'
),

purchase_events AS (
    SELECT DISTINCT t.owner_id, t.id, t.created_at
    FROM public.tickets t
    JOIN public.ticket_transactions tr
      ON tr.ticket_id = t.id AND tr.status = 'COMPLETED'
    WHERE t.status NOT IN ('CANCELLED','REFUNDED')
),
purchase_gaps AS (
    SELECT
      owner_id,
      EXTRACT(EPOCH FROM (created_at - LAG(created_at)
             OVER (PARTITION BY owner_id ORDER BY created_at)))/86400.0 AS gap_days
    FROM purchase_events
),
purchase_history AS (
    SELECT
      t.owner_id,
      COUNT(DISTINCT t.id) AS lifetime_tickets,
      COUNT(DISTINCT t.event_id) AS unique_events,
      COUNT(DISTINCT e.venue_id) AS unique_venues,
      0 AS unique_categories,
      SUM(tr.amount) AS lifetime_value,
      AVG(tr.amount) AS avg_ticket_price,
      MIN(t.created_at) AS first_purchase_date,
      MAX(t.created_at) AS last_purchase_date,
      AVG(pg.gap_days) AS avg_days_between_purchases
    FROM public.tickets t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.ticket_transactions tr
      ON tr.ticket_id = t.id AND tr.status = 'COMPLETED'
    LEFT JOIN purchase_gaps pg ON pg.owner_id = t.owner_id
    WHERE t.status NOT IN ('CANCELLED','REFUNDED')
    GROUP BY t.owner_id
),
engagement_metrics AS (
  
    SELECT 
        wa.user_id AS customer_id,
        COUNT(DISTINCT wa.wallet_address) AS connected_wallets,
        MAX(wa.last_used_at) AS last_wallet_activity,
        COUNT(DISTINCT n.id) FILTER (WHERE n.status = 'SENT') AS notifications_sent,
        COUNT(DISTINCT n.id) FILTER (WHERE n.status = 'READ') AS notifications_read
    FROM wallet_addresses wa
    LEFT JOIN notifications n ON n.user_id = wa.user_id
    GROUP BY wa.user_id
)
SELECT 
    cb.*,
    COALESCE(ph.lifetime_tickets, 0) AS lifetime_tickets,
    COALESCE(ph.unique_events, 0) AS unique_events,
    COALESCE(ph.unique_venues, 0) AS unique_venues,
    COALESCE(ph.unique_categories, 0) AS unique_categories,
    COALESCE(ph.lifetime_value, 0) AS lifetime_value,
    ph.avg_ticket_price,
    ph.first_purchase_date,
    ph.last_purchase_date,
    ph.avg_days_between_purchases,
    COALESCE(em.connected_wallets, 0) AS connected_wallets,
    em.last_wallet_activity,
    COALESCE(em.notifications_sent, 0) AS notifications_sent,
    COALESCE(em.notifications_read, 0) AS notifications_read,
    CASE 
        WHEN ph.last_purchase_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'ACTIVE'
        WHEN ph.last_purchase_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'LAPSED'
        WHEN ph.last_purchase_date IS NOT NULL THEN 'DORMANT'
        ELSE 'PROSPECT'
    END AS customer_segment,
    CURRENT_TIMESTAMP AS last_calculated
FROM customer_base cb
LEFT JOIN purchase_history ph ON ph.owner_id = cb.customer_id
LEFT JOIN engagement_metrics em ON em.customer_id = cb.customer_id;

-- Indexes for materialized view
CREATE INDEX idx_customer_360_id ON customer_360_view(customer_id);
CREATE INDEX idx_customer_360_segment ON customer_360_view(customer_segment);
CREATE INDEX idx_customer_360_value ON customer_360_view(lifetime_value DESC);

COMMENT ON MATERIALIZED VIEW customer_360_view IS 'Complete customer profile - refresh every 6 hours';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Operational Views
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Active Events View
-- Shows all currently active events with real-time metrics
CREATE OR REPLACE VIEW active_events_view AS
SELECT 
    e.id AS event_id,
    e.name AS event_name,
    v.id AS venue_id,
    v.name AS venue_name,
    e.start_date,
    e.end_date,
    e.status,
    
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)
,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('CANCELLED', 'REFUNDED')) AS tickets_sold,
    
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)
 - COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('CANCELLED', 'REFUNDED')) AS tickets_available,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'REDEEMED') AS tickets_redeemed,
    COUNT(DISTINCT t.id) FILTER (WHERE t.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour') AS tickets_sold_last_hour,
    CASE 
        WHEN e.start_date <= CURRENT_TIMESTAMP AND e.end_date >= CURRENT_TIMESTAMP THEN 'IN_PROGRESS'
        WHEN start_date::timestamp > CURRENT_TIMESTAMP THEN 'UPCOMING'
        ELSE 'OTHER'
    END AS event_phase,
    e.start_date - CURRENT_TIMESTAMP AS time_until_start,
    GREATEST(0, EXTRACT(EPOCH FROM (e.start_date - CURRENT_TIMESTAMP))/3600)::NUMERIC(10,2) AS hours_until_start
FROM events e
JOIN venues v ON v.id = e.venue_id
LEFT JOIN tickets t ON t.event_id = e.id
WHERE e.status = 'ACTIVE'
AND e.end_date >= CURRENT_TIMESTAMP
GROUP BY e.id, e.name, v.id, v.name, e.start_date, e.end_date, e.status, 
      (SELECT COALESCE(SUM(tt.total_supply),0) FROM public.ticket_types tt WHERE tt.event_id = e.id)

ORDER BY e.start_date;

COMMENT ON VIEW active_events_view IS 'Real-time view of active events';

-- Pending Refunds View
-- Shows all pending refund requests
CREATE OR REPLACE VIEW pending_refunds_view AS
SELECT
  r.id            AS refund_id,
  r.status        AS refund_status,
  r.requested_at    AS refund_created_at,
  ttx.id          AS ticket_tx_id,
  t.id            AS ticket_id,
  u.id            AS owner_id,
  u.email         AS owner_email,
  e.id            AS event_id,
  e.name          AS event_name,
  v.id            AS venue_id,
  v.name          AS venue_name
FROM public.ticket_refunds r
JOIN public.ticket_transactions ttx ON ttx.id = r.transaction_id
JOIN public.tickets t ON t.id = ttx.ticket_id
JOIN public.users u ON u.id = t.owner_id
JOIN public.events e ON e.id = t.event_id
JOIN public.venues v ON v.id = e.venue_id
WHERE r.status = 'PENDING'
ORDER BY r.requested_at;
