-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customer Preferences Schema for TicketToken
-- Week 3, Day 11
-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This schema defines the customer_preferences table which stores all
-- customer preference settings including notifications, privacy,
-- accessibility, and display preferences.
-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Create ENUM type for notification frequency
DO $$ BEGIN
    CREATE TYPE notification_frequency_enum AS ENUM ('realtime', 'daily', 'weekly', 'never');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create customer_preferences table
CREATE TABLE IF NOT EXISTS customer_preferences (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key to customer_profiles table
    customer_profile_id UUID NOT NULL UNIQUE, -- One preference record per customer
    
    -- Notification channel preferences
    email_notifications BOOLEAN DEFAULT true, -- Global toggle for email notifications
    sms_notifications BOOLEAN DEFAULT false, -- Global toggle for SMS notifications
    push_notifications BOOLEAN DEFAULT true, -- Global toggle for push notifications
    
    -- Communication type preferences
    marketing_emails BOOLEAN DEFAULT false, -- Opt-in for marketing communications
    transactional_emails BOOLEAN DEFAULT true, -- Order confirmations, tickets, etc.
    event_reminders BOOLEAN DEFAULT true, -- Reminders for upcoming events
    price_alerts BOOLEAN DEFAULT false, -- Notifications when ticket prices drop
    
    -- Notification frequency settings
    notification_frequency notification_frequency_enum DEFAULT 'realtime', -- How often to batch notifications
    
    -- Quiet hours settings
    quiet_hours_start TIME, -- Start of quiet period (e.g., 22:00)
    quiet_hours_end TIME, -- End of quiet period (e.g., 08:00)
    timezone VARCHAR(50) DEFAULT 'UTC', -- IANA timezone (e.g., 'America/New_York')
    
    -- Language preference
    preferred_language VARCHAR(5) DEFAULT 'en', -- ISO 639-1 language code (e.g., 'en', 'es', 'fr')
    
    -- Accessibility settings
    high_contrast BOOLEAN DEFAULT false, -- Enable high contrast mode
    screen_reader BOOLEAN DEFAULT false, -- Optimize for screen readers
    large_text BOOLEAN DEFAULT false, -- Enable larger text sizes
    
    -- Privacy settings
    show_profile_public BOOLEAN DEFAULT false, -- Make profile visible to other users
    allow_transfers_from_anyone BOOLEAN DEFAULT false, -- Allow ticket transfers from non-contacts
    
    -- Event preferences
    preferred_genres TEXT[], -- Array of preferred event genres/categories
    preferred_venues UUID[], -- Array of preferred venue IDs
    max_ticket_price DECIMAL(10, 2), -- Maximum price willing to pay per ticket
    
    -- Display preferences
    currency_display VARCHAR(3) DEFAULT 'USD', -- ISO 4217 currency code
    date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY', -- Preferred date display format
    time_format VARCHAR(20) DEFAULT '12h', -- '12h' or '24h' time format
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_preferences_customer_profile 
        FOREIGN KEY (customer_profile_id) 
        REFERENCES customer_profiles(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT chk_quiet_hours_valid 
        CHECK (
            (quiet_hours_start IS NULL AND quiet_hours_end IS NULL) OR
            (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
        ),
    
    CONSTRAINT chk_timezone_format 
        CHECK (
            timezone IS NULL OR 
            timezone ~* '^[A-Za-z]+/[A-Za-z_]+$' OR -- e.g., America/New_York
            timezone = 'UTC' OR
            timezone ~* '^(UTC|GMT)[+-]\d{1,2}$' -- e.g., UTC+5, GMT-8
        ),
    
    CONSTRAINT chk_language_format 
        CHECK (
            preferred_language ~* '^[a-z]{2}(-[A-Z]{2})?$' -- e.g., 'en' or 'en-US'
        ),
    
    CONSTRAINT chk_currency_format 
        CHECK (
            currency_display ~* '^[A-Z]{3}$' -- ISO 4217 format
        ),
    
    CONSTRAINT chk_date_format_valid 
        CHECK (
            date_format IN ('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY')
        ),
    
    CONSTRAINT chk_time_format_valid 
        CHECK (
            time_format IN ('12h', '24h')
        ),
    
    CONSTRAINT chk_max_price_positive 
        CHECK (
            max_ticket_price IS NULL OR max_ticket_price > 0
        )
);

-- Create indexes for performance
CREATE INDEX idx_preferences_customer_profile 
    ON customer_preferences(customer_profile_id);

CREATE INDEX idx_preferences_notification_settings 
    ON customer_preferences(email_notifications, sms_notifications, push_notifications) 
    WHERE email_notifications = true OR sms_notifications = true OR push_notifications = true;

CREATE INDEX idx_preferences_language 
    ON customer_preferences(preferred_language);

CREATE INDEX idx_preferences_timezone 
    ON customer_preferences(timezone);

CREATE INDEX idx_preferences_privacy_settings 
    ON customer_preferences(show_profile_public) 
    WHERE show_profile_public = true;

-- Create GIN indexes for array fields
CREATE INDEX idx_preferences_genres 
    ON customer_preferences USING GIN (preferred_genres);

CREATE INDEX idx_preferences_venues 
    ON customer_preferences USING GIN (preferred_venues);

-- Create index for finding users with specific communication preferences
CREATE INDEX idx_preferences_marketing_enabled 
    ON customer_preferences(marketing_emails, email_notifications) 
    WHERE marketing_emails = true AND email_notifications = true;

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_customer_preferences_updated_at 
    BEFORE UPDATE ON customer_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments to table and columns
COMMENT ON TABLE customer_preferences IS 'Stores all customer preference settings including notifications, privacy, accessibility, and display preferences';

COMMENT ON COLUMN customer_preferences.id IS 'Unique identifier for the preference record';
COMMENT ON COLUMN customer_preferences.customer_profile_id IS 'Reference to the customer profile - one preference record per customer';
COMMENT ON COLUMN customer_preferences.email_notifications IS 'Global toggle for all email notifications';
COMMENT ON COLUMN customer_preferences.sms_notifications IS 'Global toggle for all SMS notifications';
COMMENT ON COLUMN customer_preferences.push_notifications IS 'Global toggle for all push notifications';
COMMENT ON COLUMN customer_preferences.marketing_emails IS 'Opt-in consent for marketing email communications';
COMMENT ON COLUMN customer_preferences.transactional_emails IS 'Preference for transactional emails (orders, tickets, etc.)';
COMMENT ON COLUMN customer_preferences.event_reminders IS 'Preference for event reminder notifications';
COMMENT ON COLUMN customer_preferences.price_alerts IS 'Preference for ticket price drop notifications';
COMMENT ON COLUMN customer_preferences.notification_frequency IS 'How often to send batched notifications';
COMMENT ON COLUMN customer_preferences.quiet_hours_start IS 'Start time for notification quiet period';
COMMENT ON COLUMN customer_preferences.quiet_hours_end IS 'End time for notification quiet period';
COMMENT ON COLUMN customer_preferences.timezone IS 'User timezone in IANA format (e.g., America/New_York)';
COMMENT ON COLUMN customer_preferences.preferred_language IS 'ISO 639-1 language code for UI and communications';
COMMENT ON COLUMN customer_preferences.high_contrast IS 'Enable high contrast mode for accessibility';
COMMENT ON COLUMN customer_preferences.screen_reader IS 'Optimize UI for screen reader compatibility';
COMMENT ON COLUMN customer_preferences.large_text IS 'Enable larger text sizes for better readability';
COMMENT ON COLUMN customer_preferences.show_profile_public IS 'Allow other users to view this customer profile';
COMMENT ON COLUMN customer_preferences.allow_transfers_from_anyone IS 'Allow receiving ticket transfers from non-contacts';
COMMENT ON COLUMN customer_preferences.preferred_genres IS 'Array of preferred event genres/categories';
COMMENT ON COLUMN customer_preferences.preferred_venues IS 'Array of preferred venue IDs for personalization';
COMMENT ON COLUMN customer_preferences.max_ticket_price IS 'Maximum price per ticket for recommendations';
COMMENT ON COLUMN customer_preferences.currency_display IS 'ISO 4217 currency code for price display';
COMMENT ON COLUMN customer_preferences.date_format IS 'Preferred date display format';
COMMENT ON COLUMN customer_preferences.time_format IS 'Preferred time format (12-hour or 24-hour)';
COMMENT ON COLUMN customer_preferences.created_at IS 'When the preference record was created';
COMMENT ON COLUMN customer_preferences.updated_at IS 'When the preference record was last updated';

-- Create function to automatically create preference record when customer profile is created
CREATE OR REPLACE FUNCTION create_default_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO customer_preferences (customer_profile_id)
    VALUES (NEW.id)
    ON CONFLICT (customer_profile_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create preferences for new customer profiles
CREATE TRIGGER create_preferences_for_new_customer
    AFTER INSERT ON customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_preferences();

-- Grant appropriate permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON customer_preferences TO tickettoken_app;
-- GRANT USAGE ON SEQUENCE customer_preferences_id_seq TO tickettoken_app;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_customer_preferences_tenant_id ON customer_preferences(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_preferences_tenant_created ON customer_preferences(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

