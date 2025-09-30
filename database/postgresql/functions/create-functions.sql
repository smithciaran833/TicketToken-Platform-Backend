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
        SUM(t.price) as total_revenue,
        COUNT(t.id)::INTEGER as total_tickets_sold,
        COUNT(DISTINCT e.id)::INTEGER as total_events,
        AVG(t.price) as avg_ticket_price
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE e.venue_id = venue_id_param
    AND t.status = 'valid';
END;
$$ LANGUAGE plpgsql;

-- Function: Get available tickets for an event
CREATE OR REPLACE FUNCTION get_available_tickets(event_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
    available_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO available_count
    FROM ticket_types tt
    WHERE tt.event_id = event_id_param
    AND tt.available_quantity > 0;
    
    RETURN available_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Process ticket purchase (with transaction)
CREATE OR REPLACE FUNCTION purchase_ticket(
    p_event_id UUID,
    p_user_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    ticket_ids UUID[]
) AS $$
DECLARE
    v_available INTEGER;
    v_ticket_ids UUID[];
    v_ticket_id UUID;
BEGIN
    -- Start transaction
    -- Check availability
    SELECT available_quantity INTO v_available
    FROM ticket_types
    WHERE id = p_ticket_type_id
    FOR UPDATE;
    
    IF v_available < p_quantity THEN
        RETURN QUERY SELECT FALSE, 'Not enough tickets available', NULL::UUID[];
        RETURN;
    END IF;
    
    -- Update availability
    UPDATE ticket_types
    SET available_quantity = available_quantity - p_quantity
    WHERE id = p_ticket_type_id;
    
    -- Create tickets
    FOR i IN 1..p_quantity LOOP
        INSERT INTO tickets (event_id, user_id, ticket_type_id, status)
        VALUES (p_event_id, p_user_id, p_ticket_type_id, 'valid')
        RETURNING id INTO v_ticket_id;
        
        v_ticket_ids := array_append(v_ticket_ids, v_ticket_id);
    END LOOP;
    
    RETURN QUERY SELECT TRUE, 'Purchase successful', v_ticket_ids;
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
        (SELECT COUNT(*) FROM events WHERE event_date > NOW()),
        (SELECT COUNT(*) FROM tickets WHERE purchase_date > NOW() - INTERVAL '1 day' * days_back),
        (SELECT SUM(price) FROM tickets t 
         JOIN ticket_types tt ON t.ticket_type_id = tt.id 
         WHERE t.purchase_date > NOW() - INTERVAL '1 day' * days_back),
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
    AND purchase_date > NOW() - INTERVAL '1 hour';
    
    -- Check failed logins
    SELECT failed_login_attempts INTO failed_logins
    FROM users
    WHERE id = user_id_param;
    
    RETURN (recent_purchases > 20 OR failed_logins > 5);
END;
$$ LANGUAGE plpgsql;

