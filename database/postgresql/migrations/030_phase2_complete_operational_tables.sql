-- ===================================================================
-- PHASE 2: COMPLETE OPERATIONAL TABLES FOR PRODUCTION
-- ===================================================================
-- This migration adds ALL operational tables needed for:
-- - Order management with state machine
-- - Payment processing with idempotency
-- - Reliable event publishing (outbox pattern)
-- - Webhook delivery management
-- - Service health monitoring
-- - Background job processing
-- ===================================================================

BEGIN;

-- Set application context for better error messages
SET application_name = 'phase2_migration';

-- ===================================================================
-- SECTION 1: CORE ORDER MANAGEMENT
-- ===================================================================

-- First ensure tickets table exists (referenced by order_items)
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE RESTRICT,
    event_id UUID REFERENCES events(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id UUID, -- Will add FK after orders table is updated
    
    -- Ticket identification
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(100) UNIQUE,
    qr_code VARCHAR(255) UNIQUE,
    
    -- Status and pricing
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    face_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    purchase_price DECIMAL(10,2),
    service_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Seating information
    section VARCHAR(50),
    row_number VARCHAR(20),
    seat_number VARCHAR(20),
    gate VARCHAR(20),
    
    -- NFT/Blockchain integration
    is_nft BOOLEAN DEFAULT false,
    is_minted BOOLEAN DEFAULT false,
    mint_transaction_id VARCHAR(255),
    token_id VARCHAR(255),
    wallet_address VARCHAR(255),
    
    -- Transfer and usage
    is_transferable BOOLEAN DEFAULT true,
    transfer_count INTEGER DEFAULT 0,
    max_transfers INTEGER,
    used_at TIMESTAMP,
    used_by UUID REFERENCES users(id),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reserved_until TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_ticket_status CHECK (status IN (
        'AVAILABLE', 'RESERVED', 'SOLD', 'TRANSFERRED', 
        'USED', 'CANCELLED', 'EXPIRED', 'REFUNDED'
    )),
    CONSTRAINT positive_face_value CHECK (face_value >= 0),
    CONSTRAINT positive_purchase_price CHECK (purchase_price IS NULL OR purchase_price >= 0),
    CONSTRAINT positive_service_fee CHECK (service_fee >= 0)
);

-- Comprehensive indexes for tickets
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_barcode ON tickets(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_token_id ON tickets(token_id) WHERE token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_available ON tickets(event_id, status) WHERE status = 'AVAILABLE';

-- Update orders table with ALL required fields
DO $$
BEGIN
    -- Add all missing columns with proper types and defaults
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_number') THEN
        ALTER TABLE orders ADD COLUMN order_number VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'status') THEN
        ALTER TABLE orders ADD COLUMN status VARCHAR(50) DEFAULT 'PENDING';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_status') THEN
        ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50) DEFAULT 'UNPAID';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'fulfillment_status') THEN
        ALTER TABLE orders ADD COLUMN fulfillment_status VARCHAR(50) DEFAULT 'UNFULFILLED';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'subtotal') THEN
        ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'tax_amount') THEN
        ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'service_fee') THEN
        ALTER TABLE orders ADD COLUMN service_fee DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'discount_amount') THEN
        ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_amount') THEN
        ALTER TABLE orders ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'currency') THEN
        ALTER TABLE orders ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_method') THEN
        ALTER TABLE orders ADD COLUMN payment_method VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_intent_id') THEN
        ALTER TABLE orders ADD COLUMN payment_intent_id VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_email') THEN
        ALTER TABLE orders ADD COLUMN customer_email VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_phone') THEN
        ALTER TABLE orders ADD COLUMN customer_phone VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'billing_address') THEN
        ALTER TABLE orders ADD COLUMN billing_address JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'ip_address') THEN
        ALTER TABLE orders ADD COLUMN ip_address INET;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'user_agent') THEN
        ALTER TABLE orders ADD COLUMN user_agent TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'expires_at') THEN
        ALTER TABLE orders ADD COLUMN expires_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'paid_at') THEN
        ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'fulfilled_at') THEN
        ALTER TABLE orders ADD COLUMN fulfilled_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cancelled_at') THEN
        ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'metadata') THEN
        ALTER TABLE orders ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- Generate order numbers for existing orders
UPDATE orders 
SET order_number = 'ORD-' || TO_CHAR(COALESCE(created_at, CURRENT_TIMESTAMP), 'YYYY') || '-' || 
                  LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 6, '0')
WHERE order_number IS NULL;

-- Make order_number required and unique
ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- Add foreign key from tickets to orders
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_order 
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- Add all order constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'orders' AND constraint_name = 'valid_order_status') THEN
        ALTER TABLE orders ADD CONSTRAINT valid_order_status CHECK (status IN (
            'PENDING', 'RESERVED', 'PAYMENT_PROCESSING', 'PAYMENT_FAILED',
            'PAID', 'FULFILLING', 'FULFILLED', 'COMPLETED', 
            'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED'
        ));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'orders' AND constraint_name = 'valid_payment_status') THEN
        ALTER TABLE orders ADD CONSTRAINT valid_payment_status CHECK (payment_status IN (
            'UNPAID', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
        ));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'orders' AND constraint_name = 'valid_fulfillment_status') THEN
        ALTER TABLE orders ADD CONSTRAINT valid_fulfillment_status CHECK (fulfillment_status IN (
            'UNFULFILLED', 'PENDING', 'PROCESSING', 'FULFILLED', 'PARTIALLY_FULFILLED', 'CANCELLED'
        ));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'orders' AND constraint_name = 'positive_amounts') THEN
        ALTER TABLE orders ADD CONSTRAINT positive_amounts CHECK (
            subtotal >= 0 AND tax_amount >= 0 AND service_fee >= 0 
            AND discount_amount >= 0 AND total_amount >= 0
        );
    END IF;
END $$;

-- Create comprehensive indexes for orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_venue_id ON orders(venue_id);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at) WHERE expires_at IS NOT NULL;

-- ORDER_ITEMS table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE RESTRICT,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    
    -- Item details
    item_type VARCHAR(50) NOT NULL DEFAULT 'TICKET', -- TICKET, MERCHANDISE, FEE, etc
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Quantities and pricing
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    service_fee DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'PENDING',
    fulfilled_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    refunded_at TIMESTAMP,
    refund_amount DECIMAL(10,2),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_order_item_status CHECK (status IN (
        'PENDING', 'RESERVED', 'PAID', 'FULFILLED', 
        'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    )),
    CONSTRAINT positive_quantity CHECK (quantity > 0),
    CONSTRAINT positive_prices CHECK (
        unit_price >= 0 AND total_price >= 0 
        AND discount_amount >= 0 AND tax_amount >= 0
    ),
    CONSTRAINT valid_item_type CHECK (item_type IN (
        'TICKET', 'MERCHANDISE', 'FEE', 'DONATION', 'OTHER'
    ))
);

-- Indexes for order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_id ON order_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type_id ON order_items(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);

-- ORDER_STATE_TRANSITIONS table
CREATE TABLE IF NOT EXISTS order_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- State transition details
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    transition_type VARCHAR(50) DEFAULT 'STATUS_CHANGE',
    
    -- Context
    reason TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Triggering information
    triggered_by UUID REFERENCES users(id),
    triggered_by_service VARCHAR(100),
    triggered_by_ip INET,
    
    -- Timing
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for state transitions
CREATE INDEX IF NOT EXISTS idx_order_transitions_order_id ON order_state_transitions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_transitions_created_at ON order_state_transitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_transitions_to_status ON order_state_transitions(to_status);

-- RESERVATIONS table
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Reservation details
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    
    -- Quantity and timing
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'ACTIVE',
    released_at TIMESTAMP,
    converted_at TIMESTAMP,
    expired_at TIMESTAMP,
    
    -- Session tracking
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_reservation_status CHECK (status IN (
        'ACTIVE', 'EXPIRED', 'RELEASED', 'CONVERTED', 'CANCELLED'
    )),
    CONSTRAINT positive_reservation_quantity CHECK (quantity > 0),
    CONSTRAINT positive_reservation_prices CHECK (unit_price >= 0 AND total_price >= 0),
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Indexes for reservations
CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_event_id ON reservations(event_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

-- ===================================================================
-- SECTION 2: INTEGRATION INFRASTRUCTURE
-- ===================================================================

-- OUTBOX_EVENTS table
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version INTEGER DEFAULT 1,
    sequence_number BIGSERIAL,
    
    -- Event data
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    
    -- Processing status
    status VARCHAR(50) DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Scheduling
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    next_retry_at TIMESTAMP,
    processed_at TIMESTAMP,
    failed_at TIMESTAMP,
    
    -- Error tracking
    error_message TEXT,
    error_details JSONB,
    
    -- Correlation
    correlation_id UUID DEFAULT gen_random_uuid(),
    causation_id UUID,
    partition_key VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_outbox_status CHECK (status IN (
        'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER', 'SKIPPED'
    ))
);

-- Indexes for outbox
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, scheduled_at) 
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_processing ON outbox_events(status, next_retry_at) 
    WHERE status = 'PROCESSING';
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_correlation ON outbox_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_outbox_sequence ON outbox_events(sequence_number);

-- WEBHOOK_DELIVERIES table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Webhook configuration
    webhook_endpoint_id UUID,
    event_id UUID,
    
    -- Delivery details
    event_type VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    method VARCHAR(10) DEFAULT 'POST',
    
    -- Request data
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    query_params JSONB,
    
    -- Security
    signature VARCHAR(255),
    secret_hash VARCHAR(255),
    
    -- Delivery status
    status VARCHAR(50) DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    
    -- Response tracking
    response_status INTEGER,
    response_body TEXT,
    response_headers JSONB,
    response_time_ms INTEGER,
    
    -- Timing
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    next_retry_at TIMESTAMP,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP,
    
    -- Error tracking
    last_error TEXT,
    error_details JSONB,
    
    -- Metadata
    idempotency_key VARCHAR(255),
    correlation_id UUID,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_webhook_status CHECK (status IN (
        'PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'CANCELLED', 'DEAD_LETTER'
    )),
    CONSTRAINT valid_http_method CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'))
);

-- Indexes for webhooks
CREATE INDEX IF NOT EXISTS idx_webhook_pending ON webhook_deliveries(status, scheduled_at) 
    WHERE status IN ('PENDING', 'SENDING');
CREATE INDEX IF NOT EXISTS idx_webhook_retry ON webhook_deliveries(next_retry_at) 
    WHERE status = 'SENDING';
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_correlation ON webhook_deliveries(correlation_id);

-- IDEMPOTENCY_KEYS table (create or update)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    
    -- Request information
    request_method VARCHAR(10),
    request_path VARCHAR(255),
    request_headers JSONB,
    request_body TEXT,
    request_hash VARCHAR(64),
    
    -- Response information
    response_status INTEGER,
    response_headers JSONB,
    response_body TEXT,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'PROCESSING',
    
    -- Expiry
    expires_at TIMESTAMP NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_idempotency_status CHECK (status IN (
        'PROCESSING', 'COMPLETED', 'FAILED'
    ))
);

-- Indexes for idempotency
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

-- SERVICE_HEALTH table
CREATE TABLE IF NOT EXISTS service_health (
    service_name VARCHAR(100) PRIMARY KEY,
    service_type VARCHAR(50),
    
    -- Health status
    status VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
    health_score INTEGER DEFAULT 100,
    
    -- Heartbeat tracking
    last_heartbeat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    heartbeat_interval_seconds INTEGER DEFAULT 30,
    missed_heartbeats INTEGER DEFAULT 0,
    
    -- Version and deployment
    version VARCHAR(50),
    deployment_id VARCHAR(100),
    host_name VARCHAR(255),
    ip_address INET,
    port INTEGER,
    pid INTEGER,
    
    -- Metrics
    request_count BIGINT DEFAULT 0,
    error_count BIGINT DEFAULT 0,
    average_response_time_ms INTEGER,
    p95_response_time_ms INTEGER,
    p99_response_time_ms INTEGER,
    
    -- Resource usage
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb INTEGER,
    disk_usage_mb INTEGER,
    
    -- Error tracking
    last_error TEXT,
    last_error_at TIMESTAMP,
    consecutive_errors INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    capabilities JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_service_status CHECK (status IN (
        'HEALTHY', 'DEGRADED', 'UNHEALTHY', 'OFFLINE', 'UNKNOWN'
    ))
);

-- Indexes for service health
CREATE INDEX IF NOT EXISTS idx_service_health_status ON service_health(status);
CREATE INDEX IF NOT EXISTS idx_service_health_heartbeat ON service_health(last_heartbeat DESC);

-- API_KEYS table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Owner identification
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Key details
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Permissions and scopes
    permissions JSONB DEFAULT '[]',
    scopes JSONB DEFAULT '[]',
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_minute INTEGER DEFAULT 100,
    
    -- IP restrictions
    allowed_ips JSONB DEFAULT '[]',
    blocked_ips JSONB DEFAULT '[]',
    
    -- Usage tracking
    last_used_at TIMESTAMP,
    last_used_ip INET,
    usage_count BIGINT DEFAULT 0,
    
    -- Validity
    expires_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    
    -- Audit
    created_by UUID REFERENCES users(id),
    revoked_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP,
    revoke_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_api_key_status CHECK (status IN (
        'ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED'
    )),
    CONSTRAINT venue_or_user CHECK (
        (venue_id IS NOT NULL AND user_id IS NULL) OR 
        (venue_id IS NULL AND user_id IS NOT NULL)
    )
);

-- Indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_api_keys_venue ON api_keys(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- ===================================================================
-- SECTION 3: FINANCIAL TABLES
-- ===================================================================

-- PAYMENT_INTENTS table (update if exists)
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Stripe/payment provider reference
    stripe_intent_id VARCHAR(255) UNIQUE,
    provider VARCHAR(50) DEFAULT 'stripe',
    
    -- Order reference
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Amount details
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    application_fee DECIMAL(10,2),
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    
    -- Payment details
    payment_method_id VARCHAR(255),
    customer_id VARCHAR(255),
    
    -- 3D Secure
    authentication_required BOOLEAN DEFAULT false,
    authentication_status VARCHAR(50),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_payment_intent_status CHECK (status IN (
        'CREATED', 'REQUIRES_PAYMENT_METHOD', 'REQUIRES_CONFIRMATION',
        'REQUIRES_ACTION', 'PROCESSING', 'REQUIRES_CAPTURE',
        'SUCCEEDED', 'CANCELED', 'FAILED'
    )),
    CONSTRAINT positive_payment_amount CHECK (amount > 0)
);

-- Indexes for payment intents
CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON payment_intents(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_stripe ON payment_intents(stripe_intent_id);

-- REFUND_REQUESTS table
CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    payment_intent_id UUID REFERENCES payment_intents(id),
    
    -- Refund details
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    reason VARCHAR(255),
    reason_details TEXT,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'PENDING',
    
    -- Provider details
    stripe_refund_id VARCHAR(255),
    provider_response JSONB,
    
    -- Processing
    processed_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    
    -- Approval workflow
    requested_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejected_by UUID REFERENCES users(id),
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_refund_status CHECK (status IN (
        'PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 
        'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    CONSTRAINT positive_refund_amount CHECK (amount > 0)
);

-- Indexes for refunds
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created ON refund_requests(created_at DESC);

-- SETTLEMENT_BATCHES table
CREATE TABLE IF NOT EXISTS settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Venue reference
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
    
    -- Batch details
    batch_number VARCHAR(50) UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Financial summary
    gross_amount DECIMAL(10,2) NOT NULL,
    platform_fee_amount DECIMAL(10,2) NOT NULL,
    processing_fee_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    adjustments_amount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Order and ticket counts
    order_count INTEGER DEFAULT 0,
    ticket_count INTEGER DEFAULT 0,
    refund_count INTEGER DEFAULT 0,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'PENDING',
    
    -- Payout details
    payout_method VARCHAR(50),
    payout_reference VARCHAR(255),
    bank_account_id UUID,
    paid_at TIMESTAMP,
    
    -- Approval workflow
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_settlement_status CHECK (status IN (
        'PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'
    )),
    CONSTRAINT valid_settlement_amounts CHECK (
        gross_amount >= 0 AND net_amount >= 0 
        AND platform_fee_amount >= 0
    ),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Indexes for settlements
CREATE INDEX IF NOT EXISTS idx_settlements_venue ON settlement_batches(venue_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlement_batches(status);
CREATE INDEX IF NOT EXISTS idx_settlements_date ON settlement_batches(end_date DESC);

-- SETTLEMENT_ITEMS table
CREATE TABLE IF NOT EXISTS settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    batch_id UUID NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Item details
    item_type VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Amounts
    gross_amount DECIMAL(10,2) NOT NULL,
    platform_fee_amount DECIMAL(10,2) DEFAULT 0,
    processing_fee_amount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2) NOT NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_settlement_item_type CHECK (item_type IN (
        'TICKET_SALE', 'REFUND', 'ADJUSTMENT', 'FEE', 'OTHER'
    ))
);

-- Indexes for settlement items
CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON settlement_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_order ON settlement_items(order_id);

-- ===================================================================
-- SECTION 4: OPERATIONAL SUPPORT TABLES
-- ===================================================================

-- DEAD_LETTER_QUEUE table
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source identification
    source_table VARCHAR(100) NOT NULL,
    source_id UUID,
    source_type VARCHAR(100),
    
    -- Message details
    message_type VARCHAR(100),
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    
    -- Error information
    error_message TEXT NOT NULL,
    error_details JSONB,
    error_count INTEGER DEFAULT 1,
    
    -- Processing attempts
    last_retry_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    max_retries INTEGER DEFAULT 5,
    
    -- Resolution
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    resolution_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for dead letter queue
CREATE INDEX IF NOT EXISTS idx_dlq_source ON dead_letter_queue(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON dead_letter_queue(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_created ON dead_letter_queue(created_at DESC);

-- AUDIT_LOG_ENTRIES table
CREATE TABLE IF NOT EXISTS audit_log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity identification
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name VARCHAR(255),
    
    -- Action details
    action VARCHAR(50) NOT NULL,
    action_details TEXT,
    
    -- Changes tracking
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    
    -- User and session information
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    
    -- Additional context
    service_name VARCHAR(100),
    correlation_id UUID,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamp
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_audit_action CHECK (action IN (
        'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT',
        'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'OTHER'
    ))
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log_entries(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log_entries(action);

-- FEATURE_FLAGS table
CREATE TABLE IF NOT EXISTS feature_flags (
    name VARCHAR(100) PRIMARY KEY,
    
    -- Flag configuration
    enabled BOOLEAN DEFAULT false,
    description TEXT,
    
    -- Rollout configuration
    rollout_percentage INTEGER DEFAULT 0,
    rollout_strategy VARCHAR(50) DEFAULT 'PERCENTAGE',
    
    -- Targeting
    venue_ids UUID[],
    user_ids UUID[],
    user_segments JSONB DEFAULT '[]',
    
    -- Rules and conditions
    conditions JSONB DEFAULT '[]',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    
    -- Audit
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_rollout_percentage CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    CONSTRAINT valid_rollout_strategy CHECK (rollout_strategy IN (
        'PERCENTAGE', 'USER_LIST', 'VENUE_LIST', 'GRADUAL', 'CUSTOM'
    ))
);

-- Indexes for feature flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX IF NOT EXISTS idx_feature_flags_expires ON feature_flags(expires_at) WHERE expires_at IS NOT NULL;

-- BACKGROUND_JOBS table
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job identification
    job_type VARCHAR(100) NOT NULL,
    job_name VARCHAR(255),
    priority INTEGER DEFAULT 5,
    
    -- Job data
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    
    -- Queue management
    queue_name VARCHAR(100) DEFAULT 'default',
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'PENDING',
    
    -- Execution details
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    
    -- Error tracking
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    error_details JSONB,
    
    -- Results
    result JSONB,
    
    -- Scheduling
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    next_retry_at TIMESTAMP,
    
    -- Dependencies
    depends_on UUID[],
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    correlation_id UUID,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_job_status CHECK (status IN (
        'PENDING', 'SCHEDULED', 'RUNNING', 'COMPLETED', 
        'FAILED', 'CANCELLED', 'DEAD_LETTER'
    )),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10)
);

-- Indexes for background jobs
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON background_jobs(status, priority DESC, scheduled_at) 
    WHERE status IN ('PENDING', 'SCHEDULED');
CREATE INDEX IF NOT EXISTS idx_jobs_running ON background_jobs(status) WHERE status = 'RUNNING';
CREATE INDEX IF NOT EXISTS idx_jobs_type ON background_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON background_jobs(queue_name);
CREATE INDEX IF NOT EXISTS idx_jobs_correlation ON background_jobs(correlation_id);

-- ===================================================================
-- SECTION 5: TRIGGER FUNCTIONS AND PROCEDURES
-- ===================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables that need it
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE TRIGGER trigger_update_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()',
            t, t);
    END LOOP;
END $$;

-- Function to track order state changes
CREATE OR REPLACE FUNCTION track_order_state_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_state_transitions (
            order_id,
            from_status,
            to_status,
            transition_type,
            reason,
            metadata,
            created_at
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'STATUS_CHANGE',
            'Automatic transition tracking',
            jsonb_build_object(
                'old_payment_status', OLD.payment_status,
                'new_payment_status', NEW.payment_status,
                'old_fulfillment_status', OLD.fulfillment_status,
                'new_fulfillment_status', NEW.fulfillment_status
            ),
            CURRENT_TIMESTAMP
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order state tracking
DROP TRIGGER IF EXISTS trigger_track_order_state ON orders;
CREATE TRIGGER trigger_track_order_state
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION track_order_state_change();

-- Function to publish events to outbox
CREATE OR REPLACE FUNCTION publish_outbox_event(
    p_aggregate_id UUID,
    p_aggregate_type VARCHAR,
    p_event_type VARCHAR,
    p_payload JSONB,
    p_correlation_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO outbox_events (
        aggregate_id,
        aggregate_type,
        event_type,
        payload,
        correlation_id,
        scheduled_at
    ) VALUES (
        p_aggregate_id,
        p_aggregate_type,
        p_event_type,
        p_payload,
        COALESCE(p_correlation_id, gen_random_uuid()),
        CURRENT_TIMESTAMP
    ) RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to handle reservation expiry
CREATE OR REPLACE FUNCTION expire_reservations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE reservations
        SET status = 'EXPIRED',
            expired_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'ACTIVE'
        AND expires_at <= CURRENT_TIMESTAMP
        RETURNING id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;
    
    -- Also expire related orders
    UPDATE orders
    SET status = 'EXPIRED',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'RESERVED'
    AND expires_at <= CURRENT_TIMESTAMP;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate order totals
CREATE OR REPLACE FUNCTION calculate_order_totals(p_order_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE orders
    SET subtotal = (
            SELECT COALESCE(SUM(total_price - tax_amount - service_fee), 0)
            FROM order_items
            WHERE order_id = p_order_id
            AND status NOT IN ('CANCELLED', 'REFUNDED')
        ),
        tax_amount = (
            SELECT COALESCE(SUM(tax_amount), 0)
            FROM order_items
            WHERE order_id = p_order_id
            AND status NOT IN ('CANCELLED', 'REFUNDED')
        ),
        service_fee = (
            SELECT COALESCE(SUM(service_fee), 0)
            FROM order_items
            WHERE order_id = p_order_id
            AND status NOT IN ('CANCELLED', 'REFUNDED')
        ),
        total_amount = (
            SELECT COALESCE(SUM(total_price), 0)
            FROM order_items
            WHERE order_id = p_order_id
            AND status NOT IN ('CANCELLED', 'REFUNDED')
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update order totals when items change
CREATE OR REPLACE FUNCTION trigger_update_order_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM calculate_order_totals(OLD.order_id);
        RETURN OLD;
    ELSE
        PERFORM calculate_order_totals(NEW.order_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_order_totals ON order_items;
CREATE TRIGGER trigger_update_order_totals
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_order_totals();

-- ===================================================================
-- SECTION 6: PERMISSIONS
-- ===================================================================

-- Grant appropriate permissions (adjust based on your user roles)
DO $$
BEGIN
    -- Grant permissions to authenticated role if it exists
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        -- Read permissions
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
        
        -- Write permissions for specific tables
        GRANT INSERT, UPDATE ON orders, order_items, reservations TO authenticated;
        GRANT INSERT ON order_state_transitions, audit_log_entries TO authenticated;
        GRANT INSERT ON outbox_events, webhook_deliveries TO authenticated;
        
        -- Sequence permissions
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    END IF;
    
    -- Grant permissions to service role if it exists
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    END IF;
END $$;

-- ===================================================================
-- SECTION 7: COMMENTS FOR DOCUMENTATION
-- ===================================================================

COMMENT ON TABLE tickets IS 'Individual tickets for events with NFT support';
COMMENT ON TABLE orders IS 'Customer orders with complete state machine';
COMMENT ON TABLE order_items IS 'Line items within orders';
COMMENT ON TABLE order_state_transitions IS 'Complete audit trail of order state changes';
COMMENT ON TABLE reservations IS 'Temporary ticket holds during checkout';
COMMENT ON TABLE outbox_events IS 'Transactional outbox for reliable event publishing';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery tracking with retry logic';
COMMENT ON TABLE idempotency_keys IS 'Prevent duplicate processing of requests';
COMMENT ON TABLE service_health IS 'Monitor health of all microservices';
COMMENT ON TABLE api_keys IS 'API authentication for venues and integrations';
COMMENT ON TABLE payment_intents IS 'Payment processing with Stripe integration';
COMMENT ON TABLE refund_requests IS 'Refund management with approval workflow';
COMMENT ON TABLE settlement_batches IS 'Venue payout batches';
COMMENT ON TABLE settlement_items IS 'Individual items in settlement batches';
COMMENT ON TABLE dead_letter_queue IS 'Failed messages for manual intervention';
COMMENT ON TABLE audit_log_entries IS 'Complete audit trail for compliance';
COMMENT ON TABLE feature_flags IS 'Feature toggle management';
COMMENT ON TABLE background_jobs IS 'Async job processing queue';

COMMIT;

-- ===================================================================
-- VERIFICATION QUERIES
-- ===================================================================

-- Show summary of what was created
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public';
    
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'public';
    
    RAISE NOTICE 'Phase 2 Complete: % tables, % indexes, % triggers', 
        table_count, index_count, trigger_count;
END $$;
