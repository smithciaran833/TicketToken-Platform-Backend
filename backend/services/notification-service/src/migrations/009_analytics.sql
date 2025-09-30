-- Migration: Create notification analytics tables
-- Created: 2025-08-13

-- Create main analytics table
CREATE TABLE IF NOT EXISTS notification_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    channel VARCHAR(20) NOT NULL,
    type VARCHAR(50),
    provider VARCHAR(50),
    
    -- Metrics
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    
    -- Performance metrics
    avg_delivery_time_ms INTEGER,
    min_delivery_time_ms INTEGER,
    max_delivery_time_ms INTEGER,
    
    -- Cost tracking (in cents)
    total_cost INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, hour, channel, type, provider)
);

-- Create user engagement table
CREATE TABLE IF NOT EXISTS notification_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL,
    user_id UUID NOT NULL,
    channel VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'opened', 'clicked', 'unsubscribed', etc.
    action_timestamp TIMESTAMP NOT NULL,
    metadata JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(notification_id, user_id, action)
);

-- Create click tracking table
CREATE TABLE IF NOT EXISTS notification_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL,
    user_id UUID NOT NULL,
    link_id VARCHAR(100),
    original_url TEXT,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    
    INDEX idx_clicks_notification (notification_id),
    INDEX idx_clicks_user (user_id),
    INDEX idx_clicks_date (clicked_at)
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_analytics_date_channel 
ON notification_analytics(date DESC, channel);

CREATE INDEX IF NOT EXISTS idx_analytics_type 
ON notification_analytics(type, date DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_user 
ON notification_engagement(user_id, action_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_notification 
ON notification_engagement(notification_id);

-- Create analytics aggregation function
CREATE OR REPLACE FUNCTION aggregate_notification_analytics()
RETURNS void AS $$
BEGIN
    INSERT INTO notification_analytics (
        date, hour, channel, type, provider,
        total_sent, total_delivered, total_failed, total_bounced
    )
    SELECT 
        DATE(created_at) as date,
        EXTRACT(HOUR FROM created_at) as hour,
        channel,
        type,
        metadata->>'provider' as provider,
        COUNT(*) FILTER (WHERE delivery_status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as total_delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'failed') as total_failed,
        COUNT(*) FILTER (WHERE delivery_status = 'bounced') as total_bounced
    FROM notification_history
    WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
    GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at), channel, type, metadata->>'provider'
    ON CONFLICT (date, hour, channel, type, provider) 
    DO UPDATE SET
        total_sent = EXCLUDED.total_sent,
        total_delivered = EXCLUDED.total_delivered,
        total_failed = EXCLUDED.total_failed,
        total_bounced = EXCLUDED.total_bounced,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
