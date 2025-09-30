-- TicketToken Delivery Tracking Schema
-- Week 3, Day 13: Detailed tracking of notification delivery through providers
-- Purpose: Track delivery status, bounces, failures, and provider events for all notifications

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS notifications;

-- Set search path
SET search_path TO notifications, public;

-- Create delivery_tracking table
CREATE TABLE IF NOT EXISTS delivery_tracking (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key relationships
    notification_history_id UUID NOT NULL,              -- Link to notification_history
    campaign_id UUID,                                   -- Optional link to campaign
    
    -- Provider details
    provider_name VARCHAR(50) NOT NULL,                 -- sendgrid, twilio, fcm, etc.
    provider_account VARCHAR(100),                      -- Which account/subaccount used
    
    -- Message identification
    message_id VARCHAR(255) UNIQUE NOT NULL,            -- Our unique message identifier
    batch_id VARCHAR(255),                              -- For batch sends
    
    -- Delivery stages timestamps
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_to_provider_at TIMESTAMP WITH TIME ZONE,       -- When we sent to provider
    accepted_at TIMESTAMP WITH TIME ZONE,               -- When provider accepted
    delivered_at TIMESTAMP WITH TIME ZONE,              -- Final delivery confirmation
    
    -- Delivery status
    status VARCHAR(50) NOT NULL DEFAULT 'queued',      -- queued, sending, sent, delivered, failed, bounced
    
    -- Provider events tracking
    provider_events JSONB DEFAULT '[]',                 -- Array of all provider webhook events
    
    -- Bounce information
    bounce_type VARCHAR(20),                            -- soft, hard, block
    bounce_subtype VARCHAR(50),                         -- mailbox_full, invalid_domain, etc.
    
    -- Failure details
    failure_reason TEXT,                                -- Detailed failure explanation
    is_retryable BOOLEAN DEFAULT true,                 -- Whether we should retry
    retry_after TIMESTAMP WITH TIME ZONE,               -- When to retry
    
    -- Email specific tracking
    smtp_response TEXT,                                 -- SMTP server response
    spam_score DECIMAL(4,2),                            -- SpamAssassin or similar score
    spam_report JSONB,                                  -- Detailed spam analysis
    
    -- SMS specific tracking
    carrier VARCHAR(100),                               -- Mobile carrier name
    segment_count INTEGER DEFAULT 1,                    -- Number of SMS segments
    encoding VARCHAR(20),                               -- GSM, Unicode, etc.
    
    -- Push notification specific
    platform VARCHAR(20),                               -- ios, android, web
    device_type VARCHAR(50),                            -- iPhone, Pixel, etc.
    app_version VARCHAR(20),                            -- App version for compatibility
    
    -- IP and location tracking
    sender_ip INET,                                     -- IP address we sent from
    recipient_ip INET,                                  -- Recipient IP (if available)
    recipient_country VARCHAR(2),                       -- ISO country code
    
    -- Cost tracking
    provider_credits_used INTEGER DEFAULT 0,            -- Provider-specific credits
    actual_cost DECIMAL(10,4) DEFAULT 0,                -- Actual monetary cost
    
    -- Webhook tracking
    webhook_received_at TIMESTAMP WITH TIME ZONE,       -- When we got delivery webhook
    webhook_data JSONB,                                 -- Raw webhook payload
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_status CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced')),
    CONSTRAINT chk_bounce_type CHECK (bounce_type IS NULL OR bounce_type IN ('soft', 'hard', 'block')),
    CONSTRAINT chk_platform CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web', 'sms', 'email')),
    CONSTRAINT chk_segment_count CHECK (segment_count >= 1),
    CONSTRAINT chk_spam_score CHECK (spam_score IS NULL OR (spam_score >= 0 AND spam_score <= 10)),
    CONSTRAINT chk_provider_credits CHECK (provider_credits_used >= 0),
    CONSTRAINT chk_actual_cost CHECK (actual_cost >= 0)
);

-- Add comments to table and columns
COMMENT ON TABLE delivery_tracking IS 'Detailed tracking of notification delivery through external providers';

COMMENT ON COLUMN delivery_tracking.id IS 'Unique identifier for delivery tracking record';
COMMENT ON COLUMN delivery_tracking.notification_history_id IS 'Reference to the notification being tracked';
COMMENT ON COLUMN delivery_tracking.campaign_id IS 'Optional reference to campaign if part of one';

COMMENT ON COLUMN delivery_tracking.provider_name IS 'External provider used (SendGrid, Twilio, FCM, etc.)';
COMMENT ON COLUMN delivery_tracking.provider_account IS 'Specific account or subaccount identifier';

COMMENT ON COLUMN delivery_tracking.message_id IS 'Our unique message identifier for tracking';
COMMENT ON COLUMN delivery_tracking.batch_id IS 'Batch identifier for grouped sends';

COMMENT ON COLUMN delivery_tracking.queued_at IS 'When notification was queued for delivery';
COMMENT ON COLUMN delivery_tracking.sent_to_provider_at IS 'When we sent to external provider';
COMMENT ON COLUMN delivery_tracking.accepted_at IS 'When provider accepted the message';
COMMENT ON COLUMN delivery_tracking.delivered_at IS 'When final delivery was confirmed';

COMMENT ON COLUMN delivery_tracking.status IS 'Current delivery status';

COMMENT ON COLUMN delivery_tracking.provider_events IS 'Array of all webhook events from provider';

COMMENT ON COLUMN delivery_tracking.bounce_type IS 'Type of bounce: soft (temporary), hard (permanent), block';
COMMENT ON COLUMN delivery_tracking.bounce_subtype IS 'Specific bounce reason from provider';

COMMENT ON COLUMN delivery_tracking.failure_reason IS 'Detailed explanation of delivery failure';
COMMENT ON COLUMN delivery_tracking.is_retryable IS 'Whether this failure can be retried';
COMMENT ON COLUMN delivery_tracking.retry_after IS 'Earliest time to retry delivery';

COMMENT ON COLUMN delivery_tracking.smtp_response IS 'SMTP server response for email';
COMMENT ON COLUMN delivery_tracking.spam_score IS 'Spam score from provider (0-10)';
COMMENT ON COLUMN delivery_tracking.spam_report IS 'Detailed spam analysis from provider';

COMMENT ON COLUMN delivery_tracking.carrier IS 'Mobile carrier for SMS delivery';
COMMENT ON COLUMN delivery_tracking.segment_count IS 'Number of SMS segments sent';
COMMENT ON COLUMN delivery_tracking.encoding IS 'Character encoding used for SMS';

COMMENT ON COLUMN delivery_tracking.platform IS 'Platform for push notifications';
COMMENT ON COLUMN delivery_tracking.device_type IS 'Specific device model';
COMMENT ON COLUMN delivery_tracking.app_version IS 'App version for compatibility tracking';

COMMENT ON COLUMN delivery_tracking.sender_ip IS 'IP address message was sent from';
COMMENT ON COLUMN delivery_tracking.recipient_ip IS 'Recipient IP if available';
COMMENT ON COLUMN delivery_tracking.recipient_country IS 'Recipient country from IP or provider';

COMMENT ON COLUMN delivery_tracking.provider_credits_used IS 'Provider-specific credits consumed';
COMMENT ON COLUMN delivery_tracking.actual_cost IS 'Monetary cost of delivery';

COMMENT ON COLUMN delivery_tracking.webhook_received_at IS 'When delivery webhook was received';
COMMENT ON COLUMN delivery_tracking.webhook_data IS 'Raw webhook payload for debugging';

-- Create indexes for performance

-- Primary lookup indexes
CREATE INDEX idx_delivery_tracking_message_id 
    ON delivery_tracking(message_id);

CREATE INDEX idx_delivery_tracking_notification_history_id 
    ON delivery_tracking(notification_history_id);

CREATE INDEX idx_delivery_tracking_campaign_id 
    ON delivery_tracking(campaign_id) 
    WHERE campaign_id IS NOT NULL;

-- Status and provider indexes
CREATE INDEX idx_delivery_tracking_status 
    ON delivery_tracking(status);

CREATE INDEX idx_delivery_tracking_provider 
    ON delivery_tracking(provider_name, provider_account);

-- Failed and bounced messages (partial index)
CREATE INDEX idx_delivery_tracking_failed_bounced 
    ON delivery_tracking(status, bounce_type, is_retryable, retry_after) 
    WHERE status IN ('failed', 'bounced');

-- Batch processing
CREATE INDEX idx_delivery_tracking_batch 
    ON delivery_tracking(batch_id) 
    WHERE batch_id IS NOT NULL;

-- Time-based queries
CREATE INDEX idx_delivery_tracking_queued_at 
    ON delivery_tracking(queued_at DESC);

CREATE INDEX idx_delivery_tracking_delivered_at 
    ON delivery_tracking(delivered_at DESC) 
    WHERE delivered_at IS NOT NULL;

-- Retry management
CREATE INDEX idx_delivery_tracking_retry 
    ON delivery_tracking(retry_after, is_retryable) 
    WHERE is_retryable = true AND retry_after IS NOT NULL;

-- Cost tracking
CREATE INDEX idx_delivery_tracking_cost 
    ON delivery_tracking(actual_cost DESC) 
    WHERE actual_cost > 0;

-- Platform specific
CREATE INDEX idx_delivery_tracking_platform 
    ON delivery_tracking(platform) 
    WHERE platform IS NOT NULL;

-- Provider events (GIN index for JSONB)
CREATE INDEX idx_delivery_tracking_provider_events 
    ON delivery_tracking USING GIN(provider_events);

-- Webhook data (GIN index for JSONB)
CREATE INDEX idx_delivery_tracking_webhook_data 
    ON delivery_tracking USING GIN(webhook_data);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_delivery_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_delivery_tracking_updated_at 
    BEFORE UPDATE ON delivery_tracking
    FOR EACH ROW EXECUTE FUNCTION update_delivery_tracking_updated_at();

-- Create function to add provider event
CREATE OR REPLACE FUNCTION add_provider_event(
    p_message_id VARCHAR,
    p_event_type VARCHAR,
    p_event_data JSONB
) RETURNS VOID AS $$
BEGIN
    UPDATE delivery_tracking
    SET provider_events = provider_events || jsonb_build_array(
        jsonb_build_object(
            'type', p_event_type,
            'timestamp', CURRENT_TIMESTAMP,
            'data', p_event_data
        )
    ),
    webhook_received_at = CURRENT_TIMESTAMP,
    webhook_data = p_event_data
    WHERE message_id = p_message_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for delivery metrics
CREATE OR REPLACE VIEW delivery_metrics AS
SELECT 
    dt.provider_name,
    dt.status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (dt.delivered_at - dt.queued_at))) as avg_delivery_time_seconds,
    SUM(dt.actual_cost) as total_cost,
    SUM(dt.provider_credits_used) as total_credits,
    COUNT(*) FILTER (WHERE dt.bounce_type IS NOT NULL) as bounce_count,
    COUNT(*) FILTER (WHERE dt.bounce_type = 'hard') as hard_bounce_count,
    COUNT(*) FILTER (WHERE dt.spam_score > 5) as high_spam_count
FROM delivery_tracking dt
WHERE dt.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY dt.provider_name, dt.status;

COMMENT ON VIEW delivery_metrics IS 'Aggregated delivery metrics by provider and status for the last 30 days';

-- Create foreign key constraints
ALTER TABLE delivery_tracking
    ADD CONSTRAINT fk_delivery_tracking_notification_history
    FOREIGN KEY (notification_history_id) 
    REFERENCES notification_history(id) ON DELETE CASCADE;

-- Campaign foreign key (commented until campaigns table exists)
-- ALTER TABLE delivery_tracking
--     ADD CONSTRAINT fk_delivery_tracking_campaign
--     FOREIGN KEY (campaign_id) 
--     REFERENCES campaigns(id) ON DELETE SET NULL;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON delivery_tracking TO app_user;
-- GRANT SELECT ON delivery_metrics TO app_user;
-- GRANT EXECUTE ON FUNCTION add_provider_event(VARCHAR, VARCHAR, JSONB) TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_tenant_id ON delivery_tracking(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_tenant_created ON delivery_tracking(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

