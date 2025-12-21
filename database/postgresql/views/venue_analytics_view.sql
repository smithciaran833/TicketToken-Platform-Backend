-- Venue Analytics View
-- Comprehensive version built incrementally

-- Drop existing views if they exist
DROP VIEW IF EXISTS venue_analytics CASCADE;
DROP MATERIALIZED VIEW IF EXISTS venue_analytics_mv CASCADE;

-- Create comprehensive venue analytics view
CREATE OR REPLACE VIEW venue_analytics AS
SELECT 
    -- Venue information
    v.id AS venue_id,
    v.name AS venue_name,
    v.slug AS venue_slug,
    v.venue_type,
    v.city,
    v.state_province,
    v.country_code,
    v.created_at AS venue_created_at,
    v.max_capacity,
    v.seated_capacity,
    v.standing_capacity,
    v.vip_capacity,
    
    -- Event metrics (by status)
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id) AS total_events,
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'COMPLETED') AS completed_events,
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'ON_SALE') AS on_sale_events,
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'SOLD_OUT') AS sold_out_events,
    (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'CANCELLED') AS cancelled_events,
    
    -- Ticket metrics
    (SELECT COUNT(*) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS total_tickets_sold,
    
    -- Revenue metrics
    (SELECT COALESCE(SUM(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS gross_revenue,
    
    (SELECT COALESCE(AVG(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS avg_ticket_price,
    
    (SELECT COALESCE(MIN(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS min_ticket_price,
    
    (SELECT COALESCE(MAX(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS max_ticket_price,
    
    -- Time-based revenue (last 7 days)
    (SELECT COALESCE(SUM(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')
     AND t.purchased_at >= CURRENT_DATE - INTERVAL '7 days') AS revenue_last_7_days,
    
    -- Time-based revenue (last 30 days)
    (SELECT COALESCE(SUM(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')
     AND t.purchased_at >= CURRENT_DATE - INTERVAL '30 days') AS revenue_last_30_days,
    
    -- Time-based revenue (last 90 days)
    (SELECT COALESCE(SUM(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')
     AND t.purchased_at >= CURRENT_DATE - INTERVAL '90 days') AS revenue_last_90_days,
    
    -- Year to date revenue
    (SELECT COALESCE(SUM(t.face_value), 0) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')
     AND DATE_PART('year', t.purchased_at) = DATE_PART('year', CURRENT_DATE)) AS revenue_ytd,
    
    -- Customer metrics
    (SELECT COUNT(DISTINCT t.user_id) 
     FROM tickets t 
     JOIN events e ON t.event_id = e.id 
     WHERE e.venue_id = v.id 
     AND t.status IN ('active', 'used', 'transferred')) AS total_unique_customers,
    
    -- Capacity utilization (simplified)
    CASE 
        WHEN v.max_capacity > 0 AND (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id) > 0 THEN
            ROUND(
                (SELECT COUNT(*) 
                 FROM tickets t 
                 JOIN events e ON t.event_id = e.id 
                 WHERE e.venue_id = v.id 
                 AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED'))::NUMERIC / 
                (v.max_capacity * (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'COMPLETED'))::NUMERIC * 100, 
                2
            )
        ELSE 0
    END AS avg_capacity_utilization_pct,
    
    -- Metadata
    CURRENT_TIMESTAMP AS last_updated
    
FROM venues v
WHERE v.deleted_at IS NULL;

-- Create materialized view with rankings
CREATE MATERIALIZED VIEW venue_analytics_mv AS
SELECT 
    va.*,
    -- Add window functions for rankings
    RANK() OVER (ORDER BY va.gross_revenue DESC) AS revenue_rank,
    RANK() OVER (ORDER BY va.total_tickets_sold DESC) AS ticket_sales_rank,
    RANK() OVER (ORDER BY va.avg_capacity_utilization_pct DESC NULLS LAST) AS capacity_utilization_rank,
    
    -- Add percentile calculations
    PERCENT_RANK() OVER (ORDER BY va.gross_revenue) AS revenue_percentile,
    PERCENT_RANK() OVER (ORDER BY va.avg_ticket_price) AS price_percentile,
    
    -- Year-over-year growth (simplified - comparing YTD to total)
    CASE 
        WHEN va.gross_revenue > 0 AND va.revenue_ytd > 0 THEN
            ROUND(((va.revenue_ytd / va.gross_revenue::NUMERIC) - 0.5) * 100, 2)
        ELSE NULL
    END AS yoy_revenue_growth_pct
    
FROM venue_analytics va;

-- Create indexes on materialized view
CREATE INDEX idx_venue_analytics_mv_venue_id ON venue_analytics_mv(venue_id);
CREATE INDEX idx_venue_analytics_mv_revenue ON venue_analytics_mv(gross_revenue DESC);
CREATE INDEX idx_venue_analytics_mv_city_state ON venue_analytics_mv(city, state_province);
CREATE INDEX idx_venue_analytics_mv_venue_type ON venue_analytics_mv(venue_type);

-- Add comments
COMMENT ON VIEW venue_analytics IS 'Comprehensive venue performance analytics including revenue, capacity, and customer metrics';
COMMENT ON MATERIALIZED VIEW venue_analytics_mv IS 'Materialized version of venue analytics for improved query performance';

-- Create refresh function
CREATE OR REPLACE FUNCTION refresh_venue_analytics_mv()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW venue_analytics_mv;
END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions
GRANT SELECT ON venue_analytics TO PUBLIC;
GRANT SELECT ON venue_analytics_mv TO PUBLIC;
