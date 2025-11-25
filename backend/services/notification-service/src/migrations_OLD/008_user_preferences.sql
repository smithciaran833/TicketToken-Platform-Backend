-- Migration: Create user notification preferences
-- Created: 2025-08-13

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY,
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    
    -- Category preferences
    email_payment BOOLEAN DEFAULT true,
    email_marketing BOOLEAN DEFAULT false,
    email_event_updates BOOLEAN DEFAULT true,
    email_account BOOLEAN DEFAULT true,
    
    sms_critical_only BOOLEAN DEFAULT true,
    sms_payment BOOLEAN DEFAULT true,
    sms_event_reminders BOOLEAN DEFAULT true,
    
    push_payment BOOLEAN DEFAULT true,
    push_event_updates BOOLEAN DEFAULT true,
    push_marketing BOOLEAN DEFAULT false,
    
    -- Quiet hours (stored in user's timezone)
    quiet_hours_enabled BOOLEAN DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Frequency limits
    max_emails_per_day INTEGER DEFAULT 50,
    max_sms_per_day INTEGER DEFAULT 10,
    
    -- Unsubscribe token
    unsubscribe_token VARCHAR(255) UNIQUE DEFAULT gen_random_uuid()::text,
    unsubscribed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_preferences_unsubscribe_token 
ON notification_preferences(unsubscribe_token) 
WHERE unsubscribe_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_preferences_unsubscribed 
ON notification_preferences(unsubscribed_at) 
WHERE unsubscribed_at IS NOT NULL;

-- Create preference history table for audit
CREATE TABLE IF NOT EXISTS notification_preference_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    changed_by UUID,
    changes JSONB NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES notification_preferences(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_preference_history_user 
ON notification_preference_history(user_id, created_at DESC);
