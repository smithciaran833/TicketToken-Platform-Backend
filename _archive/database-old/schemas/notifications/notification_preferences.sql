-- TicketToken Notification Preferences Schema
-- Week 3, Day 12: Customer notification preferences and settings
-- Purpose: Allow customers to control how, when, and what notifications they receive

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS notifications;

-- Set search path
SET search_path TO notifications, public;

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key to customer
    customer_profile_id UUID NOT NULL,
    
    -- Global notification settings
    all_notifications_enabled BOOLEAN DEFAULT true,      -- Master switch for all notifications
    pause_until TIMESTAMP WITH TIME ZONE,                -- Temporarily pause all notifications until this date
    
    -- Channel preferences (which channels can be used)
    email_enabled BOOLEAN DEFAULT true,                  -- Allow email notifications
    sms_enabled BOOLEAN DEFAULT false,                   -- Allow SMS notifications (opt-in)
    push_enabled BOOLEAN DEFAULT true,                   -- Allow push notifications
    in_app_enabled BOOLEAN DEFAULT true,                 -- Allow in-app notifications
    
    -- Category preferences (what types of content to receive)
    marketing_enabled BOOLEAN DEFAULT true,              -- Promotional offers, recommendations
    transactional_enabled BOOLEAN DEFAULT true,          -- Orders, tickets, confirmations (usually can't disable)
    reminders_enabled BOOLEAN DEFAULT true,              -- Event reminders, abandoned cart
    
    -- Specific notification types for events/tickets
    price_drops BOOLEAN DEFAULT true,                    -- Notify when ticket prices drop
    new_events BOOLEAN DEFAULT true,                     -- New events from followed artists/venues
    artist_updates BOOLEAN DEFAULT true,                 -- Updates from followed artists
    venue_updates BOOLEAN DEFAULT true,                  -- Updates from followed venues
    
    -- Frequency controls
    max_emails_per_day INTEGER DEFAULT 10,               -- Maximum emails allowed per day
    max_sms_per_week INTEGER DEFAULT 5,                  -- Maximum SMS messages per week
    
    -- Quiet hours settings
    quiet_hours_enabled BOOLEAN DEFAULT false,           -- Enable quiet hours
    quiet_start TIME DEFAULT '22:00:00',                 -- Start of quiet hours (10 PM)
    quiet_end TIME DEFAULT '08:00:00',                   -- End of quiet hours (8 AM)
    timezone VARCHAR(50) DEFAULT 'America/New_York',     -- Customer's timezone for quiet hours
    
    -- Unsubscribe tracking
    unsubscribed_all BOOLEAN DEFAULT false,              -- Has unsubscribed from all communications
    unsubscribe_token VARCHAR(255) UNIQUE,               -- Unique token for one-click unsubscribe
    
    -- Channel-specific settings
    sms_country_code VARCHAR(5) DEFAULT '+1',           -- Country code for SMS
    push_sound_enabled BOOLEAN DEFAULT true,             -- Enable sound for push notifications
    
    -- Language and localization
    notification_language VARCHAR(10) DEFAULT 'en',      -- Preferred language for notifications (ISO 639-1)
    
    -- Delivery preferences
    batch_notifications BOOLEAN DEFAULT false,           -- Batch similar notifications together
    instant_notifications BOOLEAN DEFAULT true,          -- Send notifications immediately (vs batched)
    
    -- Last interaction tracking
    last_email_open TIMESTAMP WITH TIME ZONE,            -- Last time customer opened an email
    last_sms_click TIMESTAMP WITH TIME ZONE,             -- Last time customer clicked SMS link
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_modified_by UUID,                               -- User/system that last modified preferences
    
    -- Constraints
    CONSTRAINT chk_max_emails_per_day CHECK (max_emails_per_day >= 0 AND max_emails_per_day <= 100),
    CONSTRAINT chk_max_sms_per_week CHECK (max_sms_per_week >= 0 AND max_sms_per_week <= 50),
    CONSTRAINT chk_notification_language CHECK (notification_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    CONSTRAINT chk_sms_country_code CHECK (sms_country_code ~ '^\+[0-9]{1,4}$'),
    CONSTRAINT chk_timezone CHECK (timezone IN (
        'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
        'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'America/Toronto',
        'America/Mexico_City', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Singapore', 'Pacific/Auckland'
    )),
    CONSTRAINT chk_quiet_hours CHECK (
        (quiet_hours_enabled = false) OR 
        (quiet_hours_enabled = true AND quiet_start IS NOT NULL AND quiet_end IS NOT NULL)
    ),
    CONSTRAINT chk_delivery_preference CHECK (
        NOT (batch_notifications = true AND instant_notifications = true)
    )
);

-- Add unique constraint on customer_profile_id (one preference per customer)
ALTER TABLE notification_preferences
    ADD CONSTRAINT uq_notification_preferences_customer_profile_id 
    UNIQUE (customer_profile_id);

-- Add comments to table and columns
COMMENT ON TABLE notification_preferences IS 'Customer preferences for notification delivery and content';

COMMENT ON COLUMN notification_preferences.id IS 'Unique identifier for preference record';
COMMENT ON COLUMN notification_preferences.customer_profile_id IS 'Reference to customer who owns these preferences';

COMMENT ON COLUMN notification_preferences.all_notifications_enabled IS 'Master switch to enable/disable all notifications';
COMMENT ON COLUMN notification_preferences.pause_until IS 'Temporarily pause notifications until this timestamp';

COMMENT ON COLUMN notification_preferences.email_enabled IS 'Whether customer accepts email notifications';
COMMENT ON COLUMN notification_preferences.sms_enabled IS 'Whether customer accepts SMS notifications (requires opt-in)';
COMMENT ON COLUMN notification_preferences.push_enabled IS 'Whether customer accepts push notifications';
COMMENT ON COLUMN notification_preferences.in_app_enabled IS 'Whether customer accepts in-app notifications';

COMMENT ON COLUMN notification_preferences.marketing_enabled IS 'Receive marketing and promotional notifications';
COMMENT ON COLUMN notification_preferences.transactional_enabled IS 'Receive transactional notifications (orders, confirmations)';
COMMENT ON COLUMN notification_preferences.reminders_enabled IS 'Receive reminder notifications (events, abandoned carts)';

COMMENT ON COLUMN notification_preferences.price_drops IS 'Notify when tracked ticket prices decrease';
COMMENT ON COLUMN notification_preferences.new_events IS 'Notify about new events from followed artists/venues';
COMMENT ON COLUMN notification_preferences.artist_updates IS 'Receive updates from followed artists';
COMMENT ON COLUMN notification_preferences.venue_updates IS 'Receive updates from followed venues';

COMMENT ON COLUMN notification_preferences.max_emails_per_day IS 'Maximum number of emails to send per day';
COMMENT ON COLUMN notification_preferences.max_sms_per_week IS 'Maximum number of SMS messages to send per week';

COMMENT ON COLUMN notification_preferences.quiet_hours_enabled IS 'Whether to respect quiet hours for non-urgent notifications';
COMMENT ON COLUMN notification_preferences.quiet_start IS 'Start time for quiet hours in customer timezone';
COMMENT ON COLUMN notification_preferences.quiet_end IS 'End time for quiet hours in customer timezone';
COMMENT ON COLUMN notification_preferences.timezone IS 'Customer timezone for calculating quiet hours';

COMMENT ON COLUMN notification_preferences.unsubscribed_all IS 'Customer has unsubscribed from all communications';
COMMENT ON COLUMN notification_preferences.unsubscribe_token IS 'Unique token for one-click unsubscribe links';

COMMENT ON COLUMN notification_preferences.sms_country_code IS 'Country code for SMS delivery';
COMMENT ON COLUMN notification_preferences.push_sound_enabled IS 'Whether push notifications should play sound';

COMMENT ON COLUMN notification_preferences.notification_language IS 'Preferred language for notification content (ISO 639-1)';

COMMENT ON COLUMN notification_preferences.batch_notifications IS 'Batch similar notifications together for digest delivery';
COMMENT ON COLUMN notification_preferences.instant_notifications IS 'Send notifications immediately as they occur';

COMMENT ON COLUMN notification_preferences.last_email_open IS 'Timestamp of last email open for engagement tracking';
COMMENT ON COLUMN notification_preferences.last_sms_click IS 'Timestamp of last SMS link click for engagement tracking';

COMMENT ON COLUMN notification_preferences.last_modified_by IS 'User or system that last updated these preferences';

-- Create indexes for performance

-- Primary lookup index
CREATE INDEX idx_notification_preferences_customer_profile_id 
    ON notification_preferences(customer_profile_id);

-- Unsubscribe token lookup (for one-click unsubscribe)
CREATE INDEX idx_notification_preferences_unsubscribe_token 
    ON notification_preferences(unsubscribe_token) 
    WHERE unsubscribe_token IS NOT NULL;

-- Active preferences (not unsubscribed)
CREATE INDEX idx_notification_preferences_active 
    ON notification_preferences(customer_profile_id) 
    WHERE all_notifications_enabled = true AND unsubscribed_all = false;

-- Paused notifications
CREATE INDEX idx_notification_preferences_paused 
    ON notification_preferences(pause_until) 
    WHERE pause_until IS NOT NULL AND pause_until > CURRENT_TIMESTAMP;

-- Channel enablement indexes
CREATE INDEX idx_notification_preferences_email_enabled 
    ON notification_preferences(customer_profile_id) 
    WHERE email_enabled = true AND all_notifications_enabled = true;

CREATE INDEX idx_notification_preferences_sms_enabled 
    ON notification_preferences(customer_profile_id) 
    WHERE sms_enabled = true AND all_notifications_enabled = true;

CREATE INDEX idx_notification_preferences_push_enabled 
    ON notification_preferences(customer_profile_id) 
    WHERE push_enabled = true AND all_notifications_enabled = true;

-- Marketing preferences
CREATE INDEX idx_notification_preferences_marketing 
    ON notification_preferences(customer_profile_id) 
    WHERE marketing_enabled = true AND all_notifications_enabled = true;

-- Language preferences for localization
CREATE INDEX idx_notification_preferences_language 
    ON notification_preferences(notification_language);

-- Last interaction indexes for engagement analysis
CREATE INDEX idx_notification_preferences_engagement 
    ON notification_preferences(last_email_open DESC, last_sms_click DESC) 
    WHERE last_email_open IS NOT NULL OR last_sms_click IS NOT NULL;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notification_preferences_updated_at 
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Create function to generate unsubscribe token
CREATE OR REPLACE FUNCTION generate_unsubscribe_token()
RETURNS VARCHAR AS $$
DECLARE
    token VARCHAR;
BEGIN
    -- Generate a URL-safe random token
    token := encode(gen_random_bytes(32), 'base64');
    -- Replace URL-unsafe characters
    token := replace(token, '+', '-');
    token := replace(token, '/', '_');
    token := replace(token, '=', '');
    RETURN token;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate unsubscribe token
CREATE OR REPLACE FUNCTION set_unsubscribe_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.unsubscribe_token IS NULL THEN
        NEW.unsubscribe_token := generate_unsubscribe_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_unsubscribe_token_on_insert
    BEFORE INSERT ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION set_unsubscribe_token();

-- Create view for active notification preferences
CREATE OR REPLACE VIEW active_notification_preferences AS
SELECT 
    np.*,
    CASE 
        WHEN np.pause_until IS NOT NULL AND np.pause_until > CURRENT_TIMESTAMP THEN true
        ELSE false 
    END AS currently_paused,
    CASE
        WHEN np.quiet_hours_enabled AND 
             CURRENT_TIME AT TIME ZONE np.timezone BETWEEN np.quiet_start AND np.quiet_end THEN true
        ELSE false
    END AS in_quiet_hours
FROM notification_preferences np
WHERE np.all_notifications_enabled = true 
  AND np.unsubscribed_all = false;

COMMENT ON VIEW active_notification_preferences IS 'View of active notification preferences with computed pause and quiet hour status';

-- Create foreign key constraint (commented out until customer_profiles table exists)
-- ALTER TABLE notification_preferences
--     ADD CONSTRAINT fk_notification_preferences_customer_profile
--     FOREIGN KEY (customer_profile_id) 
--     REFERENCES customer_profiles(id) ON DELETE CASCADE;

-- ALTER TABLE notification_preferences
--     ADD CONSTRAINT fk_notification_preferences_last_modified_by
--     FOREIGN KEY (last_modified_by) 
--     REFERENCES users(id) ON DELETE SET NULL;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON notification_preferences TO app_user;
-- GRANT SELECT ON active_notification_preferences TO app_user;
-- GRANT EXECUTE ON FUNCTION generate_unsubscribe_token() TO app_user;

-- Sample data for testing (commented out by default)
/*
INSERT INTO notification_preferences (
    customer_profile_id,
    email_enabled,
    sms_enabled,
    marketing_enabled,
    price_drops,
    max_emails_per_day,
    quiet_hours_enabled,
    quiet_start,
    quiet_end,
    timezone,
    notification_language
) VALUES (
    uuid_generate_v1(),
    true,
    true,
    false,
    true,
    5,
    true,
    '22:00:00',
    '08:00:00',
    'America/New_York',
    'en'
);
*/

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant_id ON notification_preferences(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant_created ON notification_preferences(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

