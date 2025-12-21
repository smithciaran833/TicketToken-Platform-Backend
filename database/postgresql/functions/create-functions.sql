-- ============================================
-- DATABASE FUNCTIONS & STORED PROCEDURES
-- ============================================

-- Function: Calculate total revenue for a venue
CREATE OR REPLACE FUNCTION calculate_venue_revenue(venue_id_param UUID)
RETURNS TABLE(
    total_revenue NUMERIC,
    total_tickets_sold INTEGER,
    total_events INTEGER,
    avg_ticket_price NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        SUM(t.price_cents)::NUMERIC / 100 as total_revenue,
        COUNT(t.id)::INTEGER as total_tickets_sold,
        COUNT(DISTINCT tt.event_id)::INTEGER as total_events,
        (AVG(t.price_cents)::NUMERIC / 100) as avg_ticket_price
    FROM tickets t
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    JOIN events e ON tt.event_id = e.id
    WHERE e.venue_id = venue_id_param
    AND t.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function: Get available tickets for an event
CREATE OR REPLACE FUNCTION get_available_tickets(event_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
    available_count INTEGER;
BEGIN
    SELECT COALESCE(SUM(available), 0) INTO available_count
    FROM ticket_types tt
    WHERE tt.event_id = event_id_param
    AND tt.available > 0
    AND tt.is_active = true;
    
    RETURN available_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate platform metrics
CREATE OR REPLACE FUNCTION get_platform_metrics(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    total_users BIGINT,
    total_venues BIGINT,
    total_events BIGINT,
    total_tickets_sold BIGINT,
    total_revenue NUMERIC,
    active_listings BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 day' * days_back),
        (SELECT COUNT(*) FROM venues WHERE is_verified = true),
        (SELECT COUNT(*) FROM events WHERE starts_at > NOW()),
        (SELECT COUNT(*) FROM tickets WHERE purchased_at > NOW() - INTERVAL '1 day' * days_back),
        (SELECT COALESCE(SUM(price_cents), 0)::NUMERIC / 100 FROM tickets
         WHERE purchased_at > NOW() - INTERVAL '1 day' * days_back),
        (SELECT COUNT(*) FROM marketplace_listings WHERE status = 'active');
END;
$$ LANGUAGE plpgsql;

-- Function: Fraud detection
CREATE OR REPLACE FUNCTION check_suspicious_activity(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    recent_purchases INTEGER;
    failed_logins INTEGER;
BEGIN
    -- Check rapid purchases
    SELECT COUNT(*) INTO recent_purchases
    FROM tickets
    WHERE user_id = user_id_param
    AND purchased_at > NOW() - INTERVAL '1 hour';
    
    -- Check failed logins
    SELECT COALESCE(failed_login_attempts, 0) INTO failed_logins
    FROM users
    WHERE id = user_id_param;
    
    RETURN (recent_purchases > 20 OR failed_logins > 5);
END;
$$ LANGUAGE plpgsql;
