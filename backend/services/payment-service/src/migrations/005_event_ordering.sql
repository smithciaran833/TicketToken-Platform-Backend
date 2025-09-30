-- Add event sequencing and idempotency tracking
CREATE TABLE IF NOT EXISTS payment_event_sequence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL,
    order_id UUID,
    event_type VARCHAR(100) NOT NULL,
    sequence_number BIGINT NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    stripe_event_id VARCHAR(255) UNIQUE,
    idempotency_key VARCHAR(255),
    payload JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(payment_id, sequence_number),
    UNIQUE(payment_id, event_type, idempotency_key)
);

CREATE INDEX idx_payment_event_sequence_payment ON payment_event_sequence(payment_id, sequence_number);
CREATE INDEX idx_payment_event_sequence_timestamp ON payment_event_sequence(event_timestamp);
CREATE INDEX idx_payment_event_sequence_unprocessed ON payment_event_sequence(processed_at) WHERE processed_at IS NULL;

-- Add sequence tracking to payment_intents
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS last_sequence_number BIGINT DEFAULT 0;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS last_event_timestamp TIMESTAMP WITH TIME ZONE;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create idempotency table for payment operations
CREATE TABLE IF NOT EXISTS payment_idempotency (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    operation VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response JSONB,
    status_code INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_payment_idempotency_expires ON payment_idempotency(expires_at);

-- State machine definition for payment states
CREATE TABLE IF NOT EXISTS payment_state_machine (
    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    is_valid BOOLEAN DEFAULT true,
    PRIMARY KEY (from_state, to_state, event_type)
);

-- Insert valid state transitions
INSERT INTO payment_state_machine (from_state, to_state, event_type) VALUES
    ('PENDING', 'PROCESSING', 'payment.processing'),
    ('PENDING', 'PAID', 'payment.succeeded'),
    ('PENDING', 'PAYMENT_FAILED', 'payment.failed'),
    ('PENDING', 'CANCELLED', 'payment.cancelled'),
    ('PROCESSING', 'PAID', 'payment.succeeded'),
    ('PROCESSING', 'PAYMENT_FAILED', 'payment.failed'),
    ('PROCESSING', 'CANCELLED', 'payment.cancelled'),
    ('PAID', 'REFUNDING', 'refund.initiated'),
    ('PAID', 'PARTIALLY_REFUNDED', 'refund.partial'),
    ('PAID', 'REFUNDED', 'refund.completed'),
    ('REFUNDING', 'PARTIALLY_REFUNDED', 'refund.partial'),
    ('REFUNDING', 'REFUNDED', 'refund.completed'),
    ('REFUNDING', 'PAID', 'refund.failed')
ON CONFLICT DO NOTHING;

-- Function to validate state transitions
CREATE OR REPLACE FUNCTION validate_payment_state_transition(
    current_state VARCHAR(50),
    new_state VARCHAR(50),
    event_type VARCHAR(100)
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM payment_state_machine
        WHERE from_state = current_state
          AND to_state = new_state
          AND event_type = event_type
          AND is_valid = true
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get next sequence number
CREATE OR REPLACE FUNCTION get_next_sequence_number(p_payment_id UUID)
RETURNS BIGINT AS $$
DECLARE
    next_seq BIGINT;
BEGIN
    UPDATE payment_intents
    SET last_sequence_number = last_sequence_number + 1
    WHERE id = p_payment_id
    RETURNING last_sequence_number INTO next_seq;
    
    IF next_seq IS NULL THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
    END IF;
    
    RETURN next_seq;
END;
$$ LANGUAGE plpgsql;
