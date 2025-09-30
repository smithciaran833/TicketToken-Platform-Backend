-- WP-2: Atomic Reservations System
-- Goal: Prevent oversells with atomic inventory operations

-- Add version column for optimistic locking on event_tiers
ALTER TABLE event_tiers 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Function for atomic reservation with SELECT FOR UPDATE
CREATE OR REPLACE FUNCTION reserve_tickets(
    p_user_id UUID,
    p_event_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER,
    p_order_id UUID,
    p_session_id VARCHAR,
    p_ip_address INET,
    p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
    reservation_id UUID,
    success BOOLEAN,
    message TEXT,
    available_quantity INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_reservation_id UUID;
    v_available INTEGER;
    v_tier RECORD;
BEGIN
    -- Lock the tier row to prevent concurrent modifications
    SELECT * INTO v_tier
    FROM event_tiers
    WHERE id = p_ticket_type_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            NULL::UUID,
            FALSE,
            'Ticket type not found',
            0;
        RETURN;
    END IF;
    
    -- Calculate actual availability
    v_available := v_tier.total_qty - v_tier.sold_qty - v_tier.reserved_qty;
    
    IF v_available < p_quantity THEN
        RETURN QUERY SELECT 
            NULL::UUID,
            FALSE,
            format('Only %s tickets available', v_available),
            v_available;
        RETURN;
    END IF;
    
    -- Generate reservation ID
    v_reservation_id := gen_random_uuid();
    
    -- Atomically update the reserved quantity
    UPDATE event_tiers
    SET reserved_qty = reserved_qty + p_quantity,
        version = version + 1
    WHERE id = p_ticket_type_id
    AND (total_qty - sold_qty - reserved_qty) >= p_quantity;
    
    IF NOT FOUND THEN
        -- Double-check failed, someone else got the tickets
        RETURN QUERY SELECT 
            NULL::UUID,
            FALSE,
            'Tickets no longer available',
            0;
        RETURN;
    END IF;
    
    -- Create reservation record
    INSERT INTO reservations (
        id,
        order_id,
        user_id,
        ticket_type_id,
        event_id,
        quantity,
        expires_at,
        status,
        session_id,
        ip_address
    ) VALUES (
        v_reservation_id,
        p_order_id,
        p_user_id,
        p_ticket_type_id,
        p_event_id,
        p_quantity,
        NOW() + (p_ttl_minutes || ' minutes')::INTERVAL,
        'ACTIVE',
        p_session_id,
        p_ip_address
    );
    
    RETURN QUERY SELECT 
        v_reservation_id,
        TRUE,
        'Reservation successful',
        v_available - p_quantity;
END;
$$;

-- Function to release expired reservations
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_released_count INTEGER := 0;
    v_reservation RECORD;
BEGIN
    -- Find and process expired reservations
    FOR v_reservation IN 
        SELECT r.*, et.id as tier_id
        FROM reservations r
        JOIN event_tiers et ON et.id = r.ticket_type_id
        WHERE r.status = 'ACTIVE'
        AND r.expires_at < NOW()
        FOR UPDATE OF r, et
    LOOP
        -- Update reservation status
        UPDATE reservations
        SET status = 'EXPIRED',
            released_at = NOW(),
            updated_at = NOW()
        WHERE id = v_reservation.id;
        
        -- Release the reserved quantity
        UPDATE event_tiers
        SET reserved_qty = reserved_qty - v_reservation.quantity,
            version = version + 1
        WHERE id = v_reservation.tier_id;
        
        v_released_count := v_released_count + 1;
    END LOOP;
    
    RETURN v_released_count;
END;
$$;

-- Function to convert reservation to purchase
CREATE OR REPLACE FUNCTION convert_reservation_to_purchase(
    p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_reservation RECORD;
BEGIN
    -- Lock the reservation
    SELECT * INTO v_reservation
    FROM reservations
    WHERE id = p_reservation_id
    AND status = 'ACTIVE'
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update reservation status
    UPDATE reservations
    SET status = 'CONVERTED',
        converted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_reservation_id;
    
    -- Move from reserved to sold
    UPDATE event_tiers
    SET reserved_qty = reserved_qty - v_reservation.quantity,
        sold_qty = sold_qty + v_reservation.quantity,
        version = version + 1
    WHERE id = v_reservation.ticket_type_id;
    
    RETURN TRUE;
END;
$$;

-- Index for finding expired reservations efficiently
CREATE INDEX IF NOT EXISTS idx_reservations_active_expires 
ON reservations(expires_at) 
WHERE status = 'ACTIVE';

-- Add composite index for tier lookups
CREATE INDEX IF NOT EXISTS idx_event_tiers_inventory 
ON event_tiers(id, total_qty, sold_qty, reserved_qty);

COMMENT ON FUNCTION reserve_tickets IS 'WP-2: Atomic reservation with SELECT FOR UPDATE preventing race conditions';
COMMENT ON FUNCTION release_expired_reservations IS 'WP-2: Batch release of expired reservations';
COMMENT ON FUNCTION convert_reservation_to_purchase IS 'WP-2: Convert active reservation to completed purchase';
