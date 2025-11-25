-- Customer Analytics Schema for TicketToken
-- Designed to work with your existing customer_profiles and venues tables

-- Enable UUID extension (already exists in your DB)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects if they exist
DROP MATERIALIZED VIEW IF EXISTS customer_analytics_realtime CASCADE;
DROP TABLE IF EXISTS customer_analytics CASCADE;

-- Create the customer analytics table
CREATE TABLE customer_analytics (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key to your existing customer_profiles table
    customer_profile_id UUID NOT NULL,
    
    -- Purchase metrics (complementing what's already in customer_profiles)
    total_purchases INTEGER NOT NULL DEFAULT 0,
    average_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    highest_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    lowest_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    
    -- Event attendance details (your customer_profiles has total_events_attended)
    last_event_date DATE,
    favorite_venue_id UUID,
    events_per_month DECIMAL(6, 2) DEFAULT 0.00,
    
    -- Frequency metrics
    purchase_frequency_days DECIMAL(6, 2),
    days_since_last_purchase INTEGER,
    days_since_first_purchase INTEGER,
    
    -- Category preferences (stored as JSONB for flexibility)
    preferred_categories JSONB NOT NULL DEFAULT '[]'::JSONB,
    category_distribution JSONB NOT NULL DEFAULT '{}'::JSONB,
    
    -- Time patterns
    preferred_purchase_day VARCHAR(10),
    preferred_purchase_hour INTEGER CHECK (preferred_purchase_hour >= 0 AND preferred_purchase_hour <= 23),
    weekend_vs_weekday_ratio DECIMAL(5, 2),
    
    -- Channel metrics
    mobile_purchases INTEGER NOT NULL DEFAULT 0,
    web_purchases INTEGER NOT NULL DEFAULT 0,
    api_purchases INTEGER NOT NULL DEFAULT 0,
    kiosk_purchases INTEGER NOT NULL DEFAULT 0,
    
    -- Engagement scores (0-100 scale)
    engagement_score DECIMAL(5, 2) NOT NULL DEFAULT 0.00 
        CHECK (engagement_score >= 0 AND engagement_score <= 100),
    activity_score DECIMAL(5, 2) NOT NULL DEFAULT 0.00 
        CHECK (activity_score >= 0 AND activity_score <= 100),
    loyalty_score DECIMAL(5, 2) NOT NULL DEFAULT 0.00 
        CHECK (loyalty_score >= 0 AND loyalty_score <= 100),
    
    -- Predictive fields
    churn_probability DECIMAL(5, 4) NOT NULL DEFAULT 0.0000 
        CHECK (churn_probability >= 0 AND churn_probability <= 1),
    ltv_prediction DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    next_purchase_prediction DATE,
    
    -- Behavioral flags
    is_early_adopter BOOLEAN NOT NULL DEFAULT FALSE,
    is_influencer BOOLEAN NOT NULL DEFAULT FALSE,
    is_bulk_buyer BOOLEAN NOT NULL DEFAULT FALSE,
    is_seasonal_buyer BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Cohort information
    acquisition_cohort VARCHAR(20),
    acquisition_channel VARCHAR(50),
    acquisition_campaign VARCHAR(100),
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT fk_customer_analytics_customer_profiles 
        FOREIGN KEY (customer_profile_id) 
        REFERENCES customer_profiles(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_customer_analytics_venues 
        FOREIGN KEY (favorite_venue_id) 
        REFERENCES venues(id) 
        ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_customer_analytics_customer_profile_id 
    ON customer_analytics(customer_profile_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_engagement_score 
    ON customer_analytics(engagement_score DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_activity_score 
    ON customer_analytics(activity_score DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_loyalty_score 
    ON customer_analytics(loyalty_score DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_churn_probability 
    ON customer_analytics(churn_probability DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_ltv_prediction 
    ON customer_analytics(ltv_prediction DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_behavioral_flags 
    ON customer_analytics(is_early_adopter, is_influencer, is_bulk_buyer) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_acquisition_cohort 
    ON customer_analytics(acquisition_cohort) WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_analytics_calculated_at 
    ON customer_analytics(calculated_at DESC);

-- Create GIN indexes for JSONB columns
CREATE INDEX idx_customer_analytics_preferred_categories_gin 
    ON customer_analytics USING GIN (preferred_categories);

CREATE INDEX idx_customer_analytics_category_distribution_gin 
    ON customer_analytics USING GIN (category_distribution);

-- Create materialized view for real-time analytics
CREATE MATERIALIZED VIEW customer_analytics_realtime AS
SELECT 
    ca.*,
    cp.email,
    cp.first_name,
    cp.last_name,
    cp.total_spent as profile_total_spent,
    cp.total_events_attended,
    cp.risk_score,
    -- Customer status based on activity
    CASE 
        WHEN ca.days_since_last_purchase <= 30 THEN 'active'
        WHEN ca.days_since_last_purchase <= 90 THEN 'at_risk'
        WHEN ca.days_since_last_purchase <= 180 THEN 'dormant'
        ELSE 'churned'
    END AS customer_status,
    
    -- Segment classification
    CASE 
        WHEN ca.loyalty_score >= 80 AND ca.ltv_prediction >= 1000 THEN 'champions'
        WHEN ca.loyalty_score >= 60 AND ca.ltv_prediction >= 500 THEN 'loyal_customers'
        WHEN ca.activity_score >= 70 AND ca.days_since_last_purchase <= 60 THEN 'potential_loyalists'
        WHEN ca.churn_probability >= 0.7 THEN 'at_risk'
        WHEN ca.total_purchases = 1 THEN 'new_customers'
        ELSE 'regular'
    END AS customer_segment,
    
    -- Channel preference
    CASE 
        WHEN ca.mobile_purchases > GREATEST(ca.web_purchases, ca.api_purchases, ca.kiosk_purchases) THEN 'mobile'
        WHEN ca.web_purchases > GREATEST(ca.mobile_purchases, ca.api_purchases, ca.kiosk_purchases) THEN 'web'
        WHEN ca.api_purchases > GREATEST(ca.mobile_purchases, ca.web_purchases, ca.kiosk_purchases) THEN 'api'
        WHEN ca.kiosk_purchases > GREATEST(ca.mobile_purchases, ca.web_purchases, ca.api_purchases) THEN 'kiosk'
        ELSE 'mixed'
    END AS preferred_channel,
    
    -- Value tier
    CASE 
        WHEN ca.ltv_prediction >= 5000 THEN 'platinum'
        WHEN ca.ltv_prediction >= 2000 THEN 'gold'
        WHEN ca.ltv_prediction >= 500 THEN 'silver'
        ELSE 'bronze'
    END AS value_tier
FROM customer_analytics ca
JOIN customer_profiles cp ON ca.customer_profile_id = cp.id
WHERE ca.deleted_at IS NULL 
  AND cp.deleted_at IS NULL
  AND ca.calculated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Create indexes on materialized view
CREATE INDEX idx_mv_customer_analytics_customer_status 
    ON customer_analytics_realtime(customer_status);

CREATE INDEX idx_mv_customer_analytics_customer_segment 
    ON customer_analytics_realtime(customer_segment);

CREATE INDEX idx_mv_customer_analytics_value_tier 
    ON customer_analytics_realtime(value_tier);

-- Add table and view comments
COMMENT ON TABLE customer_analytics IS 
    'Aggregated analytics data for each customer, updated periodically to track behavior, preferences, and predictive metrics';

COMMENT ON MATERIALIZED VIEW customer_analytics_realtime IS 
    'Real-time view of customer analytics with additional calculated segments and classifications';

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_customer_analytics_realtime()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY customer_analytics_realtime;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your environment)
GRANT SELECT ON customer_analytics TO analytics_read_role;
GRANT SELECT, INSERT, UPDATE ON customer_analytics TO analytics_write_role;
GRANT SELECT ON customer_analytics_realtime TO analytics_read_role;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_customer_analytics_tenant_id ON customer_analytics(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_analytics_tenant_created ON customer_analytics(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
GRANT EXECUTE ON FUNCTION refresh_customer_analytics_realtime() TO analytics_write_role;
