-- ===================================================================
-- MIGRATION: 026_create_order_management_tables.sql
-- PURPOSE: Add order management tables with state machine
-- CRITICAL: Required for payment processing and order tracking
-- ===================================================================

BEGIN;

-- -----------------------------
-- ORDER_ITEMS TABLE
-- -----------------------------
-- Individual tickets within an order
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id UUID REFERENCES ticket_types(id),
    ticket_id UUID REFERENCES tickets(id),
    
    -- Quantities and pricing
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    discount_amount DECIMAL(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
    
    -- Status for partial fulfillment
    status VARCHAR(50) DEFAULT 'PENDING',
    fulfilled_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_order_item_status CHECK (status IN (
        'PENDING', 'RESERVED', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'
    )),
    CONSTRAINT valid_price_calculation CHECK (
        total_price = (unit_price * quantity) - discount_amount + tax_amount
    )
);

-- Indexes for order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_id ON order_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type_id ON order_items(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status) WHERE status != 'FULFILLED';

-- -----------------------------
-- ORDER_STATE_TRANSITIONS TABLE
-- -----------------------------
-- Audit trail of all order state changes
CREATE TABLE IF NOT EXISTS order_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- State transition
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    
    -- Reason and context
    reason TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Who triggered it
    triggered_by UUID REFERENCES users(id),
    triggered_by_service VARCHAR(100),
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_transition_status CHECK (to_status IN (
        'PENDING', 'RESERVED', 'PAYMENT_PROCESSING', 'PAID', 
        'FULFILLED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 
        'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    ))
);

-- Indexes for state transitions
CREATE INDEX IF NOT EXISTS idx_order_transitions_order_id ON order_state_transitions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_transitions_created_at ON order_state_transitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_transitions_to_status ON order_state_transitions(to_status);

-- -----------------------------
-- RESERVATIONS TABLE
-- -----------------------------
-- Temporary ticket holds during checkout
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    -- What's being reserved
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    event_id UUID NOT NULL REFERENCES events(id),
    
    -- Quantity and timing
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    expires_at TIMESTAMP NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'ACTIVE',
    released_at TIMESTAMP,
    converted_at TIMESTAMP,
    
    -- Session tracking
    session_id VARCHAR(255),
    ip_address INET,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_reservation_status CHECK (status IN (
        'ACTIVE', 'EXPIRED', 'RELEASED', 'CONVERTED'
    )),
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Indexes for reservations
CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_ticket_type_id ON reservations(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_reservations_event_id ON reservations(event_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status) WHERE status = 'ACTIVE';

-- -----------------------------
-- UPDATE ORDERS TABLE
-- -----------------------------
-- Add missing columns to existing orders table if needed
DO $$
BEGIN
    -- Add state machine status if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'status') THEN
        ALTER TABLE orders ADD COLUMN status VARCHAR(50) DEFAULT 'PENDING';
        ALTER TABLE orders ADD CONSTRAINT valid_order_status CHECK (status IN (
            'PENDING', 'RESERVED', 'PAYMENT_PROCESSING', 'PAID', 
            'FULFILLED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 
            'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
        ));
    END IF;
    
    -- Add order number if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'order_number') THEN
        ALTER TABLE orders ADD COLUMN order_number VARCHAR(20);
        -- Generate order numbers for existing orders
        UPDATE orders SET order_number = 'ORD-' || EXTRACT(YEAR FROM created_at) || '-' || 
                                        LPAD(id::text, 6, '0')
        WHERE order_number IS NULL;
        ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    END IF;
    
    -- Add expires_at for reservation expiry
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'expires_at') THEN
        ALTER TABLE orders ADD COLUMN expires_at TIMESTAMP;
    END IF;
    
    -- Add customer contact info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'customer_email') THEN
        ALTER TABLE orders ADD COLUMN customer_email VARCHAR(255);
        ALTER TABLE orders ADD COLUMN customer_phone VARCHAR(20);
    END IF;
    
    -- Add tracking fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'orders' AND column_name = 'ip_address') THEN
        ALTER TABLE orders ADD COLUMN ip_address INET;
        ALTER TABLE orders ADD COLUMN user_agent TEXT;
    END IF;
END $$;

-- -----------------------------
-- TRIGGER FUNCTIONS
-- -----------------------------

-- Function to automatically track state transitions
CREATE OR REPLACE FUNCTION track_order_state_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_state_transitions (
            order_id,
            from_status,
            to_status,
            reason,
            metadata,
            created_at
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'Automatic transition tracking',
            jsonb_build_object(
                'old_updated_at', OLD.updated_at,
                'new_updated_at', NEW.updated_at
            ),
            CURRENT_TIMESTAMP
        );
    END IF;
    
    -- Update the updated_at timestamp
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order state tracking
DROP TRIGGER IF EXISTS trigger_track_order_state ON orders;
CREATE TRIGGER trigger_track_order_state
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION track_order_state_change();

-- Function to handle reservation expiry
CREATE OR REPLACE FUNCTION check_reservation_expiry()
RETURNS void AS $$
BEGIN
    -- Mark expired reservations
    UPDATE reservations
    SET status = 'EXPIRED',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'ACTIVE'
    AND expires_at <= CURRENT_TIMESTAMP;
    
    -- Update related orders
    UPDATE orders
    SET status = 'EXPIRED',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'RESERVED'
    AND expires_at <= CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to update order totals when items change
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update order totals based on order_items
    UPDATE orders
    SET subtotal = (
            SELECT COALESCE(SUM(unit_price * quantity), 0)
            FROM order_items
            WHERE order_id = NEW.order_id
        ),
        tax_amount = (
            SELECT COALESCE(SUM(tax_amount), 0)
            FROM order_items
            WHERE order_id = NEW.order_id
        ),
        total_amount = (
            SELECT COALESCE(SUM(total_price), 0)
            FROM order_items
            WHERE order_id = NEW.order_id
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.order_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order total updates
DROP TRIGGER IF EXISTS trigger_update_order_totals ON order_items;
CREATE TRIGGER trigger_update_order_totals
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_order_totals();

-- -----------------------------
-- HELPER FUNCTIONS
-- -----------------------------

-- Function to create a reservation
CREATE OR REPLACE FUNCTION create_ticket_reservation(
    p_user_id UUID,
    p_ticket_type_id UUID,
    p_event_id UUID,
    p_quantity INTEGER,
    p_duration_minutes INTEGER DEFAULT 15
)
RETURNS UUID AS $$
DECLARE
    v_reservation_id UUID;
    v_available_count INTEGER;
BEGIN
    -- Check availability
    SELECT available INTO v_available_count
    FROM ticket_types
    WHERE id = p_ticket_type_id
    FOR UPDATE;
    
    IF v_available_count < p_quantity THEN
        RAISE EXCEPTION 'Insufficient tickets available';
    END IF;
    
    -- Create reservation
    INSERT INTO reservations (
        user_id,
        ticket_type_id,
        event_id,
        quantity,
        expires_at,
        status
    ) VALUES (
        p_user_id,
        p_ticket_type_id,
        p_event_id,
        p_quantity,
        CURRENT_TIMESTAMP + (p_duration_minutes || ' minutes')::INTERVAL,
        'ACTIVE'
    ) RETURNING id INTO v_reservation_id;
    
    -- Decrease available count
    UPDATE ticket_types
    SET available = available - p_quantity
    WHERE id = p_ticket_type_id;
    
    RETURN v_reservation_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------
-- COMMENTS
-- -----------------------------
COMMENT ON TABLE order_items IS 'Individual line items within an order';
COMMENT ON TABLE order_state_transitions IS 'Audit trail of order state changes';
COMMENT ON TABLE reservations IS 'Temporary ticket holds during checkout process';

COMMIT;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON order_items TO authenticated;
GRANT SELECT, INSERT ON order_state_transitions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reservations TO authenticated;

