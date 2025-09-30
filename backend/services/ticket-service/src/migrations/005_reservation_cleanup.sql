-- Add missing columns to reservations table if not exists
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS release_reason VARCHAR(50);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

-- Add indexes for cleanup queries
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires ON reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON reservations(order_id);

-- Add similar columns to ticket_reservations for compatibility
ALTER TABLE ticket_reservations ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ticket_reservations ADD COLUMN IF NOT EXISTS release_reason VARCHAR(50);
ALTER TABLE ticket_reservations ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE ticket_reservations ADD COLUMN IF NOT EXISTS ticket_type_id UUID;

-- Create table for tracking reservation history
CREATE TABLE IF NOT EXISTS reservation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL,
    order_id UUID,
    user_id UUID,
    status_from VARCHAR(50),
    status_to VARCHAR(50),
    reason VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reservation_history_reservation ON reservation_history(reservation_id);
CREATE INDEX idx_reservation_history_created ON reservation_history(created_at);

-- Create or replace the stored procedure for releasing expired reservations
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
    released_count INTEGER := 0;
    reservation RECORD;
    ticket RECORD;
BEGIN
    -- Start transaction
    FOR reservation IN
        SELECT r.*, 
               COALESCE(r.tickets, '[]'::jsonb) as ticket_items
        FROM reservations r
        WHERE r.status IN ('PENDING', 'ACTIVE')
          AND r.expires_at < NOW()
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Update reservation status
        UPDATE reservations
        SET status = 'EXPIRED',
            released_at = NOW(),
            release_reason = 'timeout',
            updated_at = NOW()
        WHERE id = reservation.id;

        -- Release inventory for each ticket type
        FOR ticket IN
            SELECT 
                (value->>'ticketTypeId')::uuid as ticket_type_id,
                (value->>'quantity')::integer as quantity
            FROM jsonb_array_elements(reservation.ticket_items)
        LOOP
            IF ticket.ticket_type_id IS NOT NULL AND ticket.quantity IS NOT NULL THEN
                UPDATE ticket_types
                SET available_quantity = available_quantity + ticket.quantity,
                    updated_at = NOW()
                WHERE id = ticket.ticket_type_id;
            END IF;
        END LOOP;

        -- Record in history
        INSERT INTO reservation_history (
            reservation_id,
            order_id,
            user_id,
            status_from,
            status_to,
            reason,
            metadata
        ) VALUES (
            reservation.id,
            reservation.order_id,
            reservation.user_id,
            'PENDING',
            'EXPIRED',
            'Automatic expiration',
            jsonb_build_object(
                'expires_at', reservation.expires_at,
                'released_at', NOW(),
                'quantity', reservation.quantity
            )
        );

        released_count := released_count + 1;
    END LOOP;

    -- Also handle ticket_reservations table for compatibility
    UPDATE ticket_reservations
    SET status = 'expired',
        released_at = NOW()
    WHERE status = 'active'
      AND expires_at < NOW();

    RETURN released_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to find orphan reservations
CREATE OR REPLACE FUNCTION find_orphan_reservations()
RETURNS TABLE(
    reservation_id UUID,
    order_id UUID,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50),
    quantity INTEGER,
    issue_type VARCHAR(100)
) AS $$
BEGIN
    -- Find reservations with no corresponding order
    RETURN QUERY
    SELECT 
        r.id,
        r.order_id,
        r.user_id,
        r.created_at,
        r.expires_at,
        r.status,
        r.quantity,
        'no_order'::VARCHAR(100) as issue_type
    FROM reservations r
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.status = 'PENDING'
      AND o.id IS NULL
      AND r.created_at < NOW() - INTERVAL '10 minutes'
    
    UNION ALL
    
    -- Find reservations for cancelled/failed orders
    SELECT 
        r.id,
        r.order_id,
        r.user_id,
        r.created_at,
        r.expires_at,
        r.status,
        r.quantity,
        'order_failed'::VARCHAR(100) as issue_type
    FROM reservations r
    JOIN orders o ON r.order_id = o.id
    WHERE r.status = 'PENDING'
      AND o.status IN ('CANCELLED', 'PAYMENT_FAILED', 'EXPIRED')
    
    UNION ALL
    
    -- Find old pending reservations that should have expired
    SELECT 
        r.id,
        r.order_id,
        r.user_id,
        r.created_at,
        r.expires_at,
        r.status,
        r.quantity,
        'should_be_expired'::VARCHAR(100) as issue_type
    FROM reservations r
    WHERE r.status = 'PENDING'
      AND r.expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
