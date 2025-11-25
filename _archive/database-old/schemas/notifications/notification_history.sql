-- TicketToken Notification History Schema
-- Week 3, Day 12: Complete notification tracking and history
-- Purpose: Track all notifications sent through the system with delivery status and engagement metrics

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS notifications;

-- Set search path
SET search_path TO notifications, public;

-- Create notification_history table
CREATE TABLE IF NOT EXISTS notification_history (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key relationships
    customer_profile_id UUID NOT NULL,  -- Reference to customer who received the notification
    template_id UUID,                    -- Reference to template used (if any)
    campaign_id UUID,                    -- Reference to campaign (if part of a campaign)
    
    -- Notification details
    channel VARCHAR(50) NOT NULL,        -- Email, SMS, Push, In-App, etc.
    subject VARCHAR(500),                -- Email subject line or notification title
    preview_text VARCHAR(200),           -- Preview text for email or push notification
    
    -- Recipient information
    recipient_email VARCHAR(255),        -- Email address (for email notifications)
    recipient_phone VARCHAR(50),         -- Phone number (for SMS notifications)
    device_token VARCHAR(500),           -- Device token (for push notifications)
    
    -- Content
    rendered_content TEXT,               -- Final rendered content sent to recipient
    variables_used JSONB DEFAULT '{}',   -- Template variables used for rendering
    
    -- Delivery tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, sent, delivered, failed, bounced
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,  -- When notification was queued
    sent_at TIMESTAMP WITH TIME ZONE,    -- When notification was sent to provider
    delivered_at TIMESTAMP WITH TIME ZONE,  -- When notification was delivered
    failed_at TIMESTAMP WITH TIME ZONE,  -- When notification failed
    
    -- Provider information
    provider VARCHAR(100),               -- Which provider was used (SendGrid, Twilio, FCM, etc.)
    provider_message_id VARCHAR(255),    -- Message ID from provider
    provider_response JSONB DEFAULT '{}', -- Full response from provider
    
    -- Engagement tracking
    opened_at TIMESTAMP WITH TIME ZONE,  -- When email/notification was opened
    clicked_at TIMESTAMP WITH TIME ZONE, -- When link was first clicked
    click_count INTEGER DEFAULT 0,       -- Total number of clicks
    
    -- Bounce and failure information
    bounce_type VARCHAR(50),             -- hard, soft, blocked, etc.
    bounce_reason TEXT,                  -- Detailed reason for bounce/failure
    is_permanent_failure BOOLEAN DEFAULT FALSE,  -- Whether this is a permanent failure
    
    -- Cost tracking
    provider_cost DECIMAL(10, 4) DEFAULT 0,  -- Cost charged by provider
    credits_used INTEGER DEFAULT 0,      -- Internal credits consumed
    
    -- Retry information
    retry_count INTEGER DEFAULT 0,       -- Number of retry attempts
    next_retry_at TIMESTAMP WITH TIME ZONE,  -- When to retry next
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',            -- Array of tags for categorization
    context JSONB DEFAULT '{}',          -- Additional context data
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_status CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    CONSTRAINT chk_channel CHECK (channel IN ('email', 'sms', 'push', 'in_app', 'webhook')),
    CONSTRAINT chk_bounce_type CHECK (bounce_type IS NULL OR bounce_type IN ('hard', 'soft', 'blocked', 'complaint', 'other')),
    CONSTRAINT chk_retry_count CHECK (retry_count >= 0),
    CONSTRAINT chk_click_count CHECK (click_count >= 0),
    CONSTRAINT chk_provider_cost CHECK (provider_cost >= 0),
    CONSTRAINT chk_credits_used CHECK (credits_used >= 0)
);

-- Add comments to columns
COMMENT ON TABLE notification_history IS 'Complete history of all notifications sent through the system';

COMMENT ON COLUMN notification_history.id IS 'Unique identifier for each notification record';
COMMENT ON COLUMN notification_history.customer_profile_id IS 'Reference to the customer who received this notification';
COMMENT ON COLUMN notification_history.template_id IS 'Reference to the template used (nullable for custom notifications)';
COMMENT ON COLUMN notification_history.campaign_id IS 'Reference to campaign if this notification is part of a campaign';

COMMENT ON COLUMN notification_history.channel IS 'Communication channel used: email, sms, push, in_app, webhook';
COMMENT ON COLUMN notification_history.subject IS 'Subject line for emails or title for other notification types';
COMMENT ON COLUMN notification_history.preview_text IS 'Preview text shown in email clients or notification centers';

COMMENT ON COLUMN notification_history.recipient_email IS 'Email address for email notifications';
COMMENT ON COLUMN notification_history.recipient_phone IS 'Phone number for SMS notifications';
COMMENT ON COLUMN notification_history.device_token IS 'Device token for push notifications';

COMMENT ON COLUMN notification_history.rendered_content IS 'Final HTML/text content that was sent';
COMMENT ON COLUMN notification_history.variables_used IS 'Template variables and their values used for rendering';

COMMENT ON COLUMN notification_history.status IS 'Current delivery status: pending, sent, delivered, failed, bounced';
COMMENT ON COLUMN notification_history.queued_at IS 'Timestamp when notification was queued for sending';
COMMENT ON COLUMN notification_history.sent_at IS 'Timestamp when notification was sent to provider';
COMMENT ON COLUMN notification_history.delivered_at IS 'Timestamp when provider confirmed delivery';
COMMENT ON COLUMN notification_history.failed_at IS 'Timestamp when notification failed';

COMMENT ON COLUMN notification_history.provider IS 'External provider used (SendGrid, Twilio, Firebase, etc.)';
COMMENT ON COLUMN notification_history.provider_message_id IS 'Unique message ID from the provider';
COMMENT ON COLUMN notification_history.provider_response IS 'Complete response data from provider';

COMMENT ON COLUMN notification_history.opened_at IS 'Timestamp when recipient opened the notification';
COMMENT ON COLUMN notification_history.clicked_at IS 'Timestamp of first click on any link';
COMMENT ON COLUMN notification_history.click_count IS 'Total number of clicks on links';

COMMENT ON COLUMN notification_history.bounce_type IS 'Type of bounce: hard, soft, blocked, complaint';
COMMENT ON COLUMN notification_history.bounce_reason IS 'Detailed explanation of bounce or failure';
COMMENT ON COLUMN notification_history.is_permanent_failure IS 'Whether this recipient should be blacklisted';

COMMENT ON COLUMN notification_history.provider_cost IS 'Cost in dollars charged by the provider';
COMMENT ON COLUMN notification_history.credits_used IS 'Internal credits consumed for this notification';

COMMENT ON COLUMN notification_history.retry_count IS 'Number of times this notification has been retried';
COMMENT ON COLUMN notification_history.next_retry_at IS 'Scheduled time for next retry attempt';

COMMENT ON COLUMN notification_history.tags IS 'Array of tags for filtering and categorization';
COMMENT ON COLUMN notification_history.context IS 'Additional context data (order ID, event type, etc.)';

-- Create indexes for performance

-- Primary lookup indexes
CREATE INDEX idx_notification_history_customer_profile_id 
    ON notification_history(customer_profile_id);

CREATE INDEX idx_notification_history_status 
    ON notification_history(status);

CREATE INDEX idx_notification_history_channel 
    ON notification_history(channel);

-- Timestamp indexes for time-based queries
CREATE INDEX idx_notification_history_created_at 
    ON notification_history(created_at DESC);

CREATE INDEX idx_notification_history_sent_at 
    ON notification_history(sent_at DESC) 
    WHERE sent_at IS NOT NULL;

CREATE INDEX idx_notification_history_delivered_at 
    ON notification_history(delivered_at DESC) 
    WHERE delivered_at IS NOT NULL;

-- Partial indexes for specific statuses
CREATE INDEX idx_notification_history_pending 
    ON notification_history(created_at, id) 
    WHERE status = 'pending';

CREATE INDEX idx_notification_history_failed 
    ON notification_history(failed_at DESC, customer_profile_id) 
    WHERE status = 'failed';

-- Campaign and template indexes
CREATE INDEX idx_notification_history_campaign_id 
    ON notification_history(campaign_id) 
    WHERE campaign_id IS NOT NULL;

CREATE INDEX idx_notification_history_template_id 
    ON notification_history(template_id) 
    WHERE template_id IS NOT NULL;

-- Provider tracking indexes
CREATE INDEX idx_notification_history_provider 
    ON notification_history(provider, provider_message_id) 
    WHERE provider IS NOT NULL;

-- Engagement tracking indexes
CREATE INDEX idx_notification_history_engagement 
    ON notification_history(opened_at, clicked_at) 
    WHERE opened_at IS NOT NULL OR clicked_at IS NOT NULL;

-- Retry management index
CREATE INDEX idx_notification_history_retry 
    ON notification_history(next_retry_at, retry_count) 
    WHERE next_retry_at IS NOT NULL AND status = 'failed';

-- Tag search index (GIN for array operations)
CREATE INDEX idx_notification_history_tags 
    ON notification_history USING GIN(tags);

-- Context search index (GIN for JSONB)
CREATE INDEX idx_notification_history_context 
    ON notification_history USING GIN(context);

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notification_history_updated_at 
    BEFORE UPDATE ON notification_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create foreign key constraints (assuming these tables exist)
-- Note: These are commented out by default. Uncomment when the referenced tables exist.

-- ALTER TABLE notification_history
--     ADD CONSTRAINT fk_notification_history_customer_profile
--     FOREIGN KEY (customer_profile_id) 
--     REFERENCES customer_profiles(id) ON DELETE CASCADE;

-- ALTER TABLE notification_history
--     ADD CONSTRAINT fk_notification_history_template
--     FOREIGN KEY (template_id) 
--     REFERENCES notification_templates(id) ON DELETE SET NULL;

-- ALTER TABLE notification_history
--     ADD CONSTRAINT fk_notification_history_campaign
--     FOREIGN KEY (campaign_id) 
--     REFERENCES marketing_campaigns(id) ON DELETE SET NULL;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON notification_history TO app_user;
-- GRANT SELECT ON notification_history TO readonly_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_notification_history_tenant_id ON notification_history(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_history_tenant_created ON notification_history(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

