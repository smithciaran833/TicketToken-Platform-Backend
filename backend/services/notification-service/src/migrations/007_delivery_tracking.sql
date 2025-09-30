-- Migration: Add delivery tracking columns to notification_history
-- Created: 2025-08-13

-- Add delivery tracking columns if they don't exist
ALTER TABLE notification_history 
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_reason TEXT,
ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_response JSONB,
ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP,
ADD COLUMN IF NOT EXISTS should_retry BOOLEAN DEFAULT true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_delivery_status 
ON notification_history(delivery_status) 
WHERE delivery_status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_notification_retry_after 
ON notification_history(retry_after) 
WHERE retry_after IS NOT NULL AND should_retry = true;

CREATE INDEX IF NOT EXISTS idx_notification_user_delivery 
ON notification_history(user_id, delivery_status, created_at DESC);

-- Create delivery tracking stats table
CREATE TABLE IF NOT EXISTS notification_delivery_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    channel VARCHAR(20) NOT NULL,
    provider VARCHAR(50),
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_retried INTEGER DEFAULT 0,
    avg_delivery_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, channel, provider)
);
