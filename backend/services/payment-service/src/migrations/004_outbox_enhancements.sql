-- Add missing columns to outbox table
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- Create dead letter queue for failed events
CREATE TABLE IF NOT EXISTS outbox_dlq (
    id SERIAL PRIMARY KEY,
    original_id INT,
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    moved_to_dlq_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add order_id to payment_state_transitions for easier queries
ALTER TABLE payment_state_transitions ADD COLUMN IF NOT EXISTS order_id UUID;

-- Add indexes for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_orders_status_updated ON orders(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_outbox_retry ON outbox(processed_at, attempts, last_attempt_at) 
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transitions_order ON payment_state_transitions(order_id);

-- Add retry_count to webhook_inbox
ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE webhook_inbox ADD COLUMN IF NOT EXISTS last_error TEXT;
