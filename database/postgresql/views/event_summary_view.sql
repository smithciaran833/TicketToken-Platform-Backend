-- Event Summary View
-- Real-time event metrics - enhanced version
-- Generated: $(date)

-- Drop existing view if it exists
DROP VIEW IF EXISTS event_summary CASCADE;

-- Create the enhanced event summary view
CREATE OR REPLACE VIEW event_summary AS
SELECT 
    -- Event basic information
    e.id AS event_id,
    e.name AS event_name,
    e.slug AS event_slug,
    e.status AS event_status,
    e.description,
    e.short_description,
    e.event_type,
    e.is_featured,
    e.visibility,
    
    -- Venue information
    v.id AS venue_id,
    v.name AS venue_name,
    v.slug AS venue_slug,
    v.city AS venue_city,
    v.state_province AS venue_state,
    v.country_code AS venue_country,
    v.max_capacity AS venue_max_capacity,
    v.venue_type,
    v.latitude AS venue_latitude,
    v.longitude AS venue_longitude,
    
    -- Event schedule information
    (SELECT MIN(es.starts_at) 
     FROM event_schedules es 
     WHERE es.event_id = e.id) AS event_start_time,
    
    (SELECT MAX(es.ends_at) 
     FROM event_schedules es 
     WHERE es.event_id = e.id) AS event_end_time,
    
    -- Countdown to event (time remaining)
    CASE 
        WHEN (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = e.id) > NOW() THEN
            (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = e.id) - NOW()
        ELSE NULL
    END AS time_until_event,
    
    -- Days until event
    CASE 
        WHEN (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = e.id) > NOW() THEN
            EXTRACT(DAY FROM (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = e.id) - NOW())::INTEGER
        ELSE NULL
    END AS days_until_event,
    
    -- Event capacity
    (SELECT COALESCE(SUM(ec.total_capacity), 0) 
     FROM event_capacity ec 
     WHERE ec.event_id = e.id) AS total_event_capacity,
    
    (SELECT COALESCE(SUM(ec.available_capacity), 0) 
     FROM event_capacity ec 
     WHERE ec.event_id = e.id) AS available_capacity,
    
    (SELECT COALESCE(SUM(ec.sold_count), 0) 
     FROM event_capacity ec 
     WHERE ec.event_id = e.id) AS capacity_sold_count,
    
    -- Real-time ticket sales metrics
    (SELECT COUNT(*) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS total_tickets_sold,
    
    (SELECT COALESCE(SUM(t.face_value), 0) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS total_revenue,
    
    (SELECT COALESCE(AVG(t.face_value), 0) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS avg_ticket_price,
    
    (SELECT COALESCE(MIN(t.face_value), 0) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS min_ticket_price,
    
    (SELECT COALESCE(MAX(t.face_value), 0) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS max_ticket_price,
    
    -- Price distribution (median)
    (SELECT COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY t.face_value), 0)
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS price_median,
    
    -- Capacity utilization percentage
    CASE 
        WHEN (SELECT SUM(ec.total_capacity) FROM event_capacity ec WHERE ec.event_id = e.id) > 0 THEN
            ROUND(
                ((SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED'))::NUMERIC / 
                (SELECT SUM(ec.total_capacity) FROM event_capacity ec WHERE ec.event_id = e.id)) * 100, 
                2
            )
        ELSE 0
    END AS capacity_utilization_pct,
    
    -- Sales velocity metrics
    (SELECT COUNT(*) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')
     AND t.purchased_at >= NOW() - INTERVAL '1 hour') AS tickets_sold_last_hour,
    
    (SELECT COUNT(*) 
     FROM tickets t 
     WHERE t.event_id = e.id 
     AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')
     AND t.purchased_at >= NOW() - INTERVAL '24 hours') AS tickets_sold_last_24h,
    
    -- Average tickets per hour (simple calculation)
    CASE 
        WHEN EXISTS (SELECT 1 FROM tickets t WHERE t.event_id = e.id AND t.purchased_at IS NOT NULL) THEN
            (SELECT COUNT(*)::NUMERIC / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - MIN(t.purchased_at)))/3600)
             FROM tickets t 
             WHERE t.event_id = e.id 
             AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED'))
        ELSE 0
    END AS avg_tickets_per_hour,
    
    -- Related events (same venue, upcoming)
    (SELECT COUNT(*) 
     FROM events e2
     WHERE e2.venue_id = e.venue_id 
     AND e2.id != e.id
     AND e2.status IN ('ON_SALE', 'SOLD_OUT')
     AND EXISTS (
         SELECT 1 FROM event_schedules es2 
         WHERE es2.event_id = e2.id 
         AND es2.starts_at > NOW()
     )) AS related_events_count,
    
    -- Metadata
    e.created_at AS event_created_at,
    e.updated_at AS event_updated_at,
    CURRENT_TIMESTAMP AS view_generated_at

FROM events e
JOIN venues v ON e.venue_id = v.id
WHERE e.deleted_at IS NULL
AND v.deleted_at IS NULL;

-- Create indexes to support the view
CREATE INDEX IF NOT EXISTS idx_tickets_event_status_purchased 
ON tickets(event_id, status, purchased_at) 
WHERE status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED');

CREATE INDEX IF NOT EXISTS idx_event_schedules_event_starts 
ON event_schedules(event_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_event_capacity_event 
ON event_capacity(event_id);

-- Grant permissions
GRANT SELECT ON event_summary TO PUBLIC;
