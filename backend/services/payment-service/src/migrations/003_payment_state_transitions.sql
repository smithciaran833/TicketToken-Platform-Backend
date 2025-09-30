-- Payment state transitions table for audit trail
CREATE TABLE IF NOT EXISTS payment_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payment_intents(id),
    from_state VARCHAR(50),
    to_state VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_transitions_payment ON payment_state_transitions(payment_id);
CREATE INDEX idx_payment_transitions_created ON payment_state_transitions(created_at);

-- Webhook events table
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    processor VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMP,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processor ON webhook_events(processor);

-- Add missing columns to payment_intents if not exists
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) UNIQUE;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS client_secret VARCHAR(500);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS processor VARCHAR(50);

-- Add indexes if not exists
CREATE INDEX IF NOT EXISTS idx_payment_intents_external ON payment_intents(external_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
