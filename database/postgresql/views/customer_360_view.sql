-- customer_360_view.sql
-- Phase 1: Basic customer view (MUST WORK FIRST)
-- Start dead simple - just prove it works

CREATE OR REPLACE VIEW customer_360_basic AS
SELECT 
    u.id as customer_id,
    u.email,
    u.username,
    u.first_name,
    u.last_name,
    u.created_at,
    u.status,
    (SELECT COUNT(*) FROM tickets WHERE user_id = u.id AND status IN ('active', 'used', 'transferred')) as total_purchases,
    u.total_spent,
    (SELECT MAX(purchased_at) FROM tickets WHERE user_id = u.id) as last_purchase_at
FROM users u;

-- Test with: SELECT COUNT(*) FROM customer_360_basic;

-- =====================================================================
-- PHASE 2: ADD PREFERENCES AND CONTACT INFO
-- Expand with user preferences and communication details
-- =====================================================================

CREATE OR REPLACE VIEW customer_360_with_preferences AS
SELECT 
    c360.*,
    -- Contact information
    u.phone,
    u.phone_verified,
    u.email_verified,
    u.country_code,
    u.city,
    u.state_province,
    u.timezone,
    u.preferred_language,
    -- Preferences (JSON data)
    u.preferences,
    u.notification_preferences,
    -- Extract key preferences
    (u.notification_preferences->>'email')::jsonb as email_prefs,
    (u.notification_preferences->>'push')::jsonb as push_prefs,
    -- Marketing
    u.marketing_consent,
    u.marketing_consent_date,
    -- Activity
    u.last_login_at,
    u.login_count
FROM customer_360_basic c360
JOIN users u ON c360.customer_id = u.id;

-- Test with: SELECT COUNT(*) FROM customer_360_with_preferences;

-- =====================================================================
-- PHASE 3: ADD PURCHASE HISTORY AND PATTERNS
-- Include transaction history and buying patterns
-- =====================================================================

CREATE OR REPLACE VIEW customer_360_with_purchases AS
SELECT 
    cwp.*,
    -- Purchase metrics from transactions
    COUNT(DISTINCT t.id) as transaction_count,
    SUM(CASE WHEN t.type = 'payment' AND t.status = 'succeeded' THEN 1 ELSE 0 END) as successful_purchases,
    SUM(CASE WHEN t.type = 'payment' AND t.status = 'succeeded' THEN t.amount ELSE 0 END) as lifetime_value,
    AVG(CASE WHEN t.type = 'payment' AND t.status = 'succeeded' THEN t.amount END) as avg_purchase_amount,
    MAX(CASE WHEN t.type = 'payment' THEN t.created_at END) as last_transaction_date,
    -- Purchase frequency
    CASE 
        WHEN COUNT(DISTINCT DATE_TRUNC('month', t.created_at)) > 0 THEN
            COUNT(DISTINCT t.id)::float / COUNT(DISTINCT DATE_TRUNC('month', t.created_at))
        ELSE 0
    END as purchases_per_month
FROM customer_360_with_preferences cwp
LEFT JOIN payment_transactions t ON cwp.customer_id = t.user_id
GROUP BY 
    cwp.customer_id, cwp.email, cwp.username, cwp.first_name, cwp.last_name,
    cwp.created_at, cwp.status, cwp.total_purchases, cwp.total_spent, cwp.last_purchase_at,
    cwp.phone, cwp.phone_verified, cwp.email_verified, cwp.country_code, cwp.city,
    cwp.state_province, cwp.timezone, cwp.preferred_language, cwp.preferences,
    cwp.notification_preferences, cwp.email_prefs, cwp.push_prefs,
    cwp.marketing_consent, cwp.marketing_consent_date, cwp.last_login_at, cwp.login_count;

-- =====================================================================
-- PHASE 4: ADD ENGAGEMENT METRICS
-- Calculate customer engagement and activity scores
-- =====================================================================

CREATE OR REPLACE VIEW customer_360_with_engagement AS
SELECT 
    cwpu.*,
    -- Engagement scoring
    CASE 
        WHEN cwpu.last_login_at > CURRENT_DATE - INTERVAL '7 days' THEN 'ACTIVE'
        WHEN cwpu.last_login_at > CURRENT_DATE - INTERVAL '30 days' THEN 'ENGAGED'
        WHEN cwpu.last_login_at > CURRENT_DATE - INTERVAL '90 days' THEN 'DORMANT'
        ELSE 'INACTIVE'
    END as engagement_status,
    -- Days since last activity
    EXTRACT(DAY FROM (CURRENT_DATE - cwpu.last_login_at::date)) as days_since_login,
    EXTRACT(DAY FROM (CURRENT_DATE - cwpu.last_transaction_date::date)) as days_since_purchase,
    -- Lifetime in days
    EXTRACT(DAY FROM (CURRENT_DATE - cwpu.created_at::date)) as customer_lifetime_days,
    -- Activity score (0-100)
    LEAST(100, 
        (CASE WHEN cwpu.email_verified THEN 20 ELSE 0 END) +
        (CASE WHEN cwpu.phone_verified THEN 10 ELSE 0 END) +
        (CASE WHEN cwpu.login_count > 10 THEN 20 ELSE cwpu.login_count * 2 END) +
        (CASE WHEN cwpu.successful_purchases > 5 THEN 30 ELSE cwpu.successful_purchases * 6 END) +
        (CASE WHEN cwpu.last_login_at > CURRENT_DATE - INTERVAL '30 days' THEN 20 ELSE 0 END)
    ) as engagement_score
FROM customer_360_with_purchases cwpu;

-- =====================================================================
-- PHASE 5: ADD SEGMENTATION
-- Classify customers into segments
-- =====================================================================

CREATE OR REPLACE VIEW customer_360_with_segments AS
SELECT 
    cwe.*,
    -- Value segment
    CASE 
        WHEN cwe.lifetime_value > 10000 THEN 'VIP'
        WHEN cwe.lifetime_value > 5000 THEN 'HIGH_VALUE'
        WHEN cwe.lifetime_value > 1000 THEN 'REGULAR'
        WHEN cwe.lifetime_value > 0 THEN 'LOW_VALUE'
        ELSE 'PROSPECT'
    END as value_segment,
    -- Frequency segment
    CASE 
        WHEN cwe.purchases_per_month >= 4 THEN 'FREQUENT'
        WHEN cwe.purchases_per_month >= 1 THEN 'REGULAR'
        WHEN cwe.purchases_per_month > 0 THEN 'OCCASIONAL'
        ELSE 'ONE_TIME'
    END as frequency_segment,
    -- Recency segment
    CASE 
        WHEN cwe.days_since_purchase IS NULL THEN 'NEVER'
        WHEN cwe.days_since_purchase <= 30 THEN 'RECENT'
        WHEN cwe.days_since_purchase <= 90 THEN 'COOLING'
        WHEN cwe.days_since_purchase <= 180 THEN 'COLD'
        ELSE 'LOST'
    END as recency_segment,
    -- RFM Score (Recency, Frequency, Monetary)
    CONCAT(
        CASE 
            WHEN cwe.days_since_purchase IS NULL THEN '0'
            WHEN cwe.days_since_purchase <= 30 THEN '5'
            WHEN cwe.days_since_purchase <= 60 THEN '4'
            WHEN cwe.days_since_purchase <= 90 THEN '3'
            WHEN cwe.days_since_purchase <= 180 THEN '2'
            ELSE '1'
        END,
        CASE 
            WHEN cwe.purchases_per_month >= 4 THEN '5'
            WHEN cwe.purchases_per_month >= 2 THEN '4'
            WHEN cwe.purchases_per_month >= 1 THEN '3'
            WHEN cwe.purchases_per_month > 0 THEN '2'
            ELSE '1'
        END,
        CASE 
            WHEN cwe.lifetime_value > 10000 THEN '5'
            WHEN cwe.lifetime_value > 5000 THEN '4'
            WHEN cwe.lifetime_value > 1000 THEN '3'
            WHEN cwe.lifetime_value > 100 THEN '2'
            ELSE '1'
        END
    ) as rfm_score
FROM customer_360_with_engagement cwe;

-- Test queries
-- SELECT COUNT(*) FROM customer_360_with_purchases;
-- SELECT COUNT(*) FROM customer_360_with_engagement;
-- SELECT COUNT(*) FROM customer_360_with_segments;

-- Fix Phase 4: Engagement metrics with proper date handling
DROP VIEW IF EXISTS customer_360_with_engagement CASCADE;

CREATE OR REPLACE VIEW customer_360_with_engagement AS
SELECT 
    cwpu.*,
    -- Engagement scoring
    CASE 
        WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 'ACTIVE'
        WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'ENGAGED'
        WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'DORMANT'
        ELSE 'INACTIVE'
    END as engagement_status,
    -- Days since last activity (handle NULLs)
    CASE 
        WHEN cwpu.last_login_at IS NOT NULL THEN 
            DATE_PART('day', CURRENT_TIMESTAMP - cwpu.last_login_at)::integer
        ELSE NULL
    END as days_since_login,
    CASE 
        WHEN cwpu.last_transaction_date IS NOT NULL THEN 
            DATE_PART('day', CURRENT_TIMESTAMP - cwpu.last_transaction_date)::integer
        ELSE NULL
    END as days_since_purchase,
    -- Lifetime in days
    DATE_PART('day', CURRENT_TIMESTAMP - cwpu.created_at)::integer as customer_lifetime_days,
    -- Activity score (0-100)
    LEAST(100, 
        (CASE WHEN cwpu.email_verified THEN 20 ELSE 0 END) +
        (CASE WHEN cwpu.phone_verified THEN 10 ELSE 0 END) +
        (CASE WHEN cwpu.login_count > 10 THEN 20 ELSE cwpu.login_count * 2 END) +
        (CASE WHEN cwpu.successful_purchases > 5 THEN 30 ELSE cwpu.successful_purchases * 6 END) +
        (CASE WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 20 ELSE 0 END)
    ) as engagement_score
FROM customer_360_with_purchases cwpu;

-- Now create Phase 5 again
DROP VIEW IF EXISTS customer_360_with_segments CASCADE;

CREATE OR REPLACE VIEW customer_360_with_segments AS
SELECT 
    cwe.*,
    -- Value segment
    CASE 
        WHEN cwe.lifetime_value > 10000 THEN 'VIP'
        WHEN cwe.lifetime_value > 5000 THEN 'HIGH_VALUE'
        WHEN cwe.lifetime_value > 1000 THEN 'REGULAR'
        WHEN cwe.lifetime_value > 0 THEN 'LOW_VALUE'
        ELSE 'PROSPECT'
    END as value_segment,
    -- Frequency segment
    CASE 
        WHEN cwe.purchases_per_month >= 4 THEN 'FREQUENT'
        WHEN cwe.purchases_per_month >= 1 THEN 'REGULAR'
        WHEN cwe.purchases_per_month > 0 THEN 'OCCASIONAL'
        ELSE 'ONE_TIME'
    END as frequency_segment,
    -- Recency segment
    CASE 
        WHEN cwe.days_since_purchase IS NULL THEN 'NEVER'
        WHEN cwe.days_since_purchase <= 30 THEN 'RECENT'
        WHEN cwe.days_since_purchase <= 90 THEN 'COOLING'
        WHEN cwe.days_since_purchase <= 180 THEN 'COLD'
        ELSE 'LOST'
    END as recency_segment
FROM customer_360_with_engagement cwe;

-- =====================================================================
-- PHASE 6: ADD CHURN RISK PREDICTION
-- Calculate churn risk based on multiple factors
-- =====================================================================

CREATE OR REPLACE VIEW customer_360_with_churn_risk AS
SELECT 
    cws.*,
    -- Churn risk factors
    CASE 
        WHEN cws.days_since_login IS NULL THEN 100
        WHEN cws.days_since_login > 180 THEN 80
        WHEN cws.days_since_login > 90 THEN 60
        WHEN cws.days_since_login > 30 THEN 40
        WHEN cws.days_since_login > 7 THEN 20
        ELSE 0
    END as login_risk_score,
    CASE 
        WHEN cws.days_since_purchase IS NULL AND cws.customer_lifetime_days > 30 THEN 100
        WHEN cws.days_since_purchase > 180 THEN 80
        WHEN cws.days_since_purchase > 90 THEN 60
        WHEN cws.days_since_purchase > 60 THEN 40
        WHEN cws.days_since_purchase > 30 THEN 20
        ELSE 0
    END as purchase_risk_score,
    -- Overall churn risk
    CASE 
        WHEN cws.engagement_status = 'INACTIVE' THEN 'HIGH'
        WHEN cws.engagement_status = 'DORMANT' THEN 'MEDIUM'
        WHEN cws.recency_segment IN ('COLD', 'LOST') THEN 'MEDIUM'
        WHEN cws.engagement_score < 30 THEN 'MEDIUM'
        WHEN cws.engagement_score < 50 THEN 'LOW'
        ELSE 'MINIMAL'
    END as churn_risk_level,
    -- Retention priority
    CASE 
        WHEN cws.value_segment IN ('VIP', 'HIGH_VALUE') AND cws.recency_segment IN ('COOLING', 'COLD') THEN 'CRITICAL'
        WHEN cws.value_segment IN ('VIP', 'HIGH_VALUE') THEN 'HIGH'
        WHEN cws.frequency_segment = 'FREQUENT' THEN 'HIGH'
        WHEN cws.successful_purchases > 0 THEN 'MEDIUM'
        ELSE 'LOW'
    END as retention_priority
FROM customer_360_with_segments cws;

-- =====================================================================
-- FINAL VIEW: COMPLETE CUSTOMER 360
-- This is the main view that applications should use
-- =====================================================================

CREATE OR REPLACE VIEW customer_360 AS
SELECT * FROM customer_360_with_churn_risk;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_customer_360_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_customer_360_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_customer_360_status ON users(status);

-- =====================================================================
-- MATERIALIZED VIEW FOR PERFORMANCE
-- For production use with large customer bases
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS customer_360_materialized CASCADE;

CREATE MATERIALIZED VIEW customer_360_materialized AS
SELECT * FROM customer_360;

-- Create indexes on materialized view
CREATE INDEX idx_cust360_mat_id ON customer_360_materialized(customer_id);
CREATE INDEX idx_cust360_mat_email ON customer_360_materialized(email);
CREATE INDEX idx_cust360_mat_segment ON customer_360_materialized(value_segment);
CREATE INDEX idx_cust360_mat_churn ON customer_360_materialized(churn_risk_level);

-- =====================================================================
-- HELPER VIEWS FOR COMMON QUERIES
-- =====================================================================

-- Customer segment summary
CREATE OR REPLACE VIEW customer_segment_summary AS
SELECT 
    value_segment,
    frequency_segment,
    recency_segment,
    COUNT(*) as customer_count,
    AVG(lifetime_value) as avg_lifetime_value,
    AVG(engagement_score) as avg_engagement_score
FROM customer_360
GROUP BY value_segment, frequency_segment, recency_segment
ORDER BY avg_lifetime_value DESC;

-- Churn risk dashboard
CREATE OR REPLACE VIEW churn_risk_dashboard AS
SELECT 
    churn_risk_level,
    retention_priority,
    COUNT(*) as customer_count,
    AVG(lifetime_value) as avg_lifetime_value,
    SUM(lifetime_value) as total_at_risk_value
FROM customer_360
GROUP BY churn_risk_level, retention_priority
ORDER BY churn_risk_level, retention_priority;

-- Active customer metrics
CREATE OR REPLACE VIEW active_customer_metrics AS
SELECT 
    engagement_status,
    COUNT(*) as customer_count,
    AVG(login_count) as avg_logins,
    AVG(successful_purchases) as avg_purchases,
    AVG(lifetime_value) as avg_lifetime_value
FROM customer_360
WHERE status = 'ACTIVE'
GROUP BY engagement_status
ORDER BY engagement_status;

-- =====================================================================
-- GDPR COMPLIANT VIEW (excludes sensitive data)
-- =====================================================================

CREATE OR REPLACE VIEW customer_360_gdpr AS
SELECT 
    customer_id,
    username,
    created_at,
    status,
    country_code,
    timezone,
    preferred_language,
    total_purchases,
    engagement_status,
    value_segment,
    frequency_segment,
    recency_segment,
    churn_risk_level
FROM customer_360;

-- =====================================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================================

COMMENT ON VIEW customer_360 IS 'Comprehensive customer intelligence view with purchase history, engagement metrics, segmentation, and churn risk analysis';
COMMENT ON VIEW customer_segment_summary IS 'Summary of customers by RFM segments';
COMMENT ON VIEW churn_risk_dashboard IS 'Customer churn risk analysis for retention campaigns';
COMMENT ON VIEW active_customer_metrics IS 'Metrics for active customers by engagement level';
COMMENT ON VIEW customer_360_gdpr IS 'GDPR-compliant customer view excluding sensitive personal data';
