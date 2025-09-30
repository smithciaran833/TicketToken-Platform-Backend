-- compliance_reporting_view.sql
-- Phase 1: Basic compliance reporting (MUST WORK FIRST)
-- Start with audit logs analysis

CREATE OR REPLACE VIEW compliance_reporting_basic AS
SELECT 
    al.id as audit_id,
    al.table_name,
    al.record_id,
    al.action,
    al.user_id,
    al.created_at,
    DATE_TRUNC('day', al.created_at) as audit_date,
    DATE_TRUNC('month', al.created_at) as audit_month
FROM audit_logs al;

-- Test with: SELECT COUNT(*) FROM compliance_reporting_basic;

-- =====================================================================
-- PHASE 2: ADD USER ACTIVITY TRACKING
-- Expand with user details and activity patterns
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting_user_activity AS
SELECT 
    crb.*,
    -- User information
    u.email as user_email,
    u.username,
    u.role as user_role,
    u.status as user_status,
    -- Activity metrics
    COUNT(*) OVER (PARTITION BY crb.user_id) as total_actions_by_user,
    COUNT(*) OVER (PARTITION BY crb.user_id, crb.table_name) as actions_per_table,
    COUNT(*) OVER (PARTITION BY crb.user_id, crb.action) as actions_by_type,
    -- Time-based patterns
    EXTRACT(HOUR FROM crb.created_at) as activity_hour,
    EXTRACT(DOW FROM crb.created_at) as activity_day_of_week,
    -- Recent activity flag
    CASE 
        WHEN crb.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN true
        ELSE false
    END as is_recent_activity
FROM compliance_reporting_basic crb
LEFT JOIN users u ON crb.user_id = u.id;

-- Test with: SELECT COUNT(*) FROM compliance_reporting_user_activity;

-- =====================================================================
-- PHASE 3: ADD DATA CHANGE TRACKING
-- Analyze what data is being changed
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting_data_changes AS
SELECT 
    crua.*,
    -- Data change analysis
    jsonb_array_length(COALESCE(al.changed_fields, '{}')) as fields_changed_count,
    al.changed_fields,
    -- Sensitive operations
    CASE 
        WHEN crua.table_name IN ('users', 'payment_methods', 'transactions') THEN 'HIGH'
        WHEN crua.table_name IN ('tickets', 'events') THEN 'MEDIUM'
        ELSE 'LOW'
    END as sensitivity_level,
    -- Operation risk score
    CASE 
        WHEN crua.action = 'DELETE' THEN 100
        WHEN crua.action = 'UPDATE' AND crua.table_name = 'users' THEN 80
        WHEN crua.action = 'UPDATE' AND crua.table_name = 'transactions' THEN 90
        WHEN crua.action = 'UPDATE' THEN 50
        WHEN crua.action = 'INSERT' THEN 20
        ELSE 10
    END as operation_risk_score
FROM compliance_reporting_user_activity crua
JOIN audit_logs al ON crua.audit_id = al.id;

-- =====================================================================
-- PHASE 4: ADD COMPLIANCE RISK ANALYSIS
-- Identify high-risk patterns and anomalies
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting_risk_analysis AS
SELECT 
    crdc.*,
    -- Anomaly detection
    CASE 
        WHEN crdc.activity_hour BETWEEN 0 AND 5 THEN true
        ELSE false
    END as unusual_hour_activity,
    -- Bulk operation detection
    COUNT(*) OVER (
        PARTITION BY crdc.user_id, crdc.table_name, DATE_TRUNC('hour', crdc.created_at)
    ) as operations_per_hour,
    -- High-risk operation flag
    CASE 
        WHEN crdc.operation_risk_score >= 80 THEN true
        ELSE false
    END as is_high_risk_operation,
    -- Compliance alert level
    CASE 
        WHEN crdc.operation_risk_score >= 90 THEN 'CRITICAL'
        WHEN crdc.operation_risk_score >= 70 THEN 'HIGH'
        WHEN crdc.operation_risk_score >= 50 THEN 'MEDIUM'
        ELSE 'LOW'
    END as alert_level
FROM compliance_reporting_data_changes crdc;

-- =====================================================================
-- PHASE 5: ADD VENUE COMPLIANCE STATUS
-- Include venue compliance information
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting_with_venues AS
SELECT 
    crra.*,
    -- Venue compliance for venue-related operations
    vc.license_type,
    vc.status as compliance_status,
    vc.expiry_date as license_expiry,
    vc.is_verified as venue_verified,
    -- Days until expiry
    CASE 
        WHEN vc.expiry_date IS NOT NULL THEN 
            EXTRACT(DAY FROM (vc.expiry_date - CURRENT_DATE))
        ELSE NULL
    END as days_until_expiry,
    -- Compliance warnings
    CASE 
        WHEN vc.expiry_date < CURRENT_DATE THEN 'EXPIRED'
        WHEN vc.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
        WHEN vc.status != 'APPROVED' THEN 'NOT_APPROVED'
        ELSE 'COMPLIANT'
    END as compliance_warning
FROM compliance_reporting_risk_analysis crra
LEFT JOIN venues v ON crra.record_id = v.id AND crra.table_name = 'venues'
LEFT JOIN venue_compliance vc ON v.id = vc.venue_id;

-- Test queries
-- SELECT COUNT(*) FROM compliance_reporting_data_changes;
-- SELECT COUNT(*) FROM compliance_reporting_risk_analysis;
-- SELECT COUNT(*) FROM compliance_reporting_with_venues;

-- Fix Phase 3: Data change tracking with correct types
DROP VIEW IF EXISTS compliance_reporting_data_changes CASCADE;

CREATE OR REPLACE VIEW compliance_reporting_data_changes AS
SELECT 
    crua.*,
    -- Data change analysis (changed_fields is text[])
    COALESCE(array_length(al.changed_fields, 1), 0) as fields_changed_count,
    al.changed_fields,
    -- Extract old and new data
    al.old_data,
    al.new_data,
    -- Sensitive operations
    CASE 
        WHEN crua.table_name IN ('users', 'payment_methods', 'transactions') THEN 'HIGH'
        WHEN crua.table_name IN ('tickets', 'events') THEN 'MEDIUM'
        ELSE 'LOW'
    END as sensitivity_level,
    -- Operation risk score
    CASE 
        WHEN crua.action = 'DELETE' THEN 100
        WHEN crua.action = 'UPDATE' AND crua.table_name = 'users' THEN 80
        WHEN crua.action = 'UPDATE' AND crua.table_name = 'transactions' THEN 90
        WHEN crua.action = 'UPDATE' THEN 50
        WHEN crua.action = 'INSERT' THEN 20
        ELSE 10
    END as operation_risk_score
FROM compliance_reporting_user_activity crua
JOIN audit_logs al ON crua.audit_id = al.id;

-- Now recreate Phase 4
DROP VIEW IF EXISTS compliance_reporting_risk_analysis CASCADE;

CREATE OR REPLACE VIEW compliance_reporting_risk_analysis AS
SELECT 
    crdc.*,
    -- Anomaly detection
    CASE 
        WHEN crdc.activity_hour BETWEEN 0 AND 5 THEN true
        ELSE false
    END as unusual_hour_activity,
    -- Bulk operation detection
    COUNT(*) OVER (
        PARTITION BY crdc.user_id, crdc.table_name, DATE_TRUNC('hour', crdc.created_at)
    ) as operations_per_hour,
    -- High-risk operation flag
    CASE 
        WHEN crdc.operation_risk_score >= 80 THEN true
        ELSE false
    END as is_high_risk_operation,
    -- Compliance alert level
    CASE 
        WHEN crdc.operation_risk_score >= 90 THEN 'CRITICAL'
        WHEN crdc.operation_risk_score >= 70 THEN 'HIGH'
        WHEN crdc.operation_risk_score >= 50 THEN 'MEDIUM'
        ELSE 'LOW'
    END as alert_level
FROM compliance_reporting_data_changes crdc;

-- Recreate Phase 5
DROP VIEW IF EXISTS compliance_reporting_with_venues CASCADE;

CREATE OR REPLACE VIEW compliance_reporting_with_venues AS
SELECT 
    crra.*,
    -- Venue compliance for venue-related operations
    vc.license_type,
    vc.status as compliance_status,
    vc.expiry_date as license_expiry,
    vc.is_verified as venue_verified,
    -- Days until expiry
    CASE 
        WHEN vc.expiry_date IS NOT NULL THEN 
            DATE_PART('day', vc.expiry_date - CURRENT_DATE)::integer
        ELSE NULL
    END as days_until_expiry,
    -- Compliance warnings
    CASE 
        WHEN vc.expiry_date < CURRENT_DATE THEN 'EXPIRED'
        WHEN vc.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
        WHEN vc.status != 'APPROVED' THEN 'NOT_APPROVED'
        ELSE 'COMPLIANT'
    END as compliance_warning
FROM compliance_reporting_risk_analysis crra
LEFT JOIN venues v ON crra.record_id = v.id AND crra.table_name = 'venues'
LEFT JOIN venue_compliance vc ON v.id = vc.venue_id;

-- Fix Phase 5 with proper date calculation
DROP VIEW IF EXISTS compliance_reporting_with_venues CASCADE;

CREATE OR REPLACE VIEW compliance_reporting_with_venues AS
SELECT 
    crra.*,
    -- Venue compliance for venue-related operations
    vc.license_type,
    vc.status as compliance_status,
    vc.expiry_date as license_expiry,
    vc.is_verified as venue_verified,
    -- Days until expiry (cast to integer)
    CASE 
        WHEN vc.expiry_date IS NOT NULL THEN 
            (vc.expiry_date - CURRENT_DATE)::integer
        ELSE NULL
    END as days_until_expiry,
    -- Compliance warnings
    CASE 
        WHEN vc.expiry_date < CURRENT_DATE THEN 'EXPIRED'
        WHEN vc.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
        WHEN vc.status != 'APPROVED' THEN 'NOT_APPROVED'
        ELSE 'COMPLIANT'
    END as compliance_warning
FROM compliance_reporting_risk_analysis crra
LEFT JOIN venues v ON crra.record_id = v.id AND crra.table_name = 'venues'
LEFT JOIN venue_compliance vc ON v.id = vc.venue_id;

-- =====================================================================
-- FINAL VIEW: COMPLETE COMPLIANCE REPORTING
-- This is the main view that applications should use
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting AS
SELECT * FROM compliance_reporting_with_venues;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- =====================================================================
-- HELPER VIEWS FOR COMMON QUERIES
-- =====================================================================

-- Daily compliance summary
CREATE OR REPLACE VIEW daily_compliance_summary AS
SELECT 
    audit_date,
    COUNT(*) as total_operations,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(CASE WHEN sensitivity_level = 'HIGH' THEN 1 END) as high_sensitivity_ops,
    COUNT(CASE WHEN alert_level = 'CRITICAL' THEN 1 END) as critical_alerts,
    COUNT(CASE WHEN unusual_hour_activity THEN 1 END) as after_hours_ops
FROM compliance_reporting
GROUP BY audit_date
ORDER BY audit_date DESC;

-- User risk profile
CREATE OR REPLACE VIEW user_risk_profile AS
SELECT 
    user_id,
    user_email,
    user_role,
    COUNT(*) as total_operations,
    MAX(operation_risk_score) as max_risk_score,
    COUNT(CASE WHEN is_high_risk_operation THEN 1 END) as high_risk_ops_count,
    COUNT(DISTINCT table_name) as tables_accessed,
    MAX(created_at) as last_activity
FROM compliance_reporting
WHERE user_id IS NOT NULL
GROUP BY user_id, user_email, user_role
ORDER BY high_risk_ops_count DESC, total_operations DESC;

-- Table activity summary
CREATE OR REPLACE VIEW table_activity_summary AS
SELECT 
    table_name,
    action,
    sensitivity_level,
    COUNT(*) as operation_count,
    COUNT(DISTINCT user_id) as unique_users,
    MAX(created_at) as last_modified
FROM compliance_reporting
GROUP BY table_name, action, sensitivity_level
ORDER BY operation_count DESC;

-- GDPR compliance view (anonymized)
CREATE OR REPLACE VIEW compliance_reporting_gdpr AS
SELECT 
    audit_id,
    table_name,
    action,
    sensitivity_level,
    alert_level,
    audit_date,
    is_recent_activity,
    unusual_hour_activity,
    is_high_risk_operation
FROM compliance_reporting;

-- =====================================================================
-- MATERIALIZED VIEW FOR PERFORMANCE
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS compliance_reporting_materialized CASCADE;

CREATE MATERIALIZED VIEW compliance_reporting_materialized AS
SELECT * FROM compliance_reporting;

-- Create indexes on materialized view
CREATE INDEX idx_comp_mat_date ON compliance_reporting_materialized(audit_date);
CREATE INDEX idx_comp_mat_user ON compliance_reporting_materialized(user_id);
CREATE INDEX idx_comp_mat_alert ON compliance_reporting_materialized(alert_level);

-- =====================================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================================

COMMENT ON VIEW compliance_reporting IS 'Comprehensive compliance and audit reporting with risk analysis';
COMMENT ON VIEW daily_compliance_summary IS 'Daily summary of compliance metrics and alerts';
COMMENT ON VIEW user_risk_profile IS 'Risk assessment by user based on activity patterns';
COMMENT ON VIEW table_activity_summary IS 'Summary of database operations by table';
COMMENT ON VIEW compliance_reporting_gdpr IS 'GDPR-compliant view excluding personal information';
