-- =====================================================================
-- COMPLIANCE REPORTING VIEW - ENHANCED WITH FIELD-LEVEL CHANGE TRACKING
-- =====================================================================
-- Purpose: Comprehensive compliance and audit reporting for regulatory requirements
-- Features: User activity tracking, risk analysis, venue compliance, GDPR support
-- Updated: 2025-11-28 - Now uses enhanced audit_logs schema
-- =====================================================================

-- =====================================================================
-- PHASE 1: BASIC COMPLIANCE REPORTING
-- Foundation view with audit log data (backward compatible)
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting_basic AS
SELECT 
    al.id as audit_id,
    COALESCE(al.table_name, al.resource_type) as table_name,
    COALESCE(al.record_id, al.resource_id) as record_id,
    al.action,
    al.user_id,
    al.created_at,
    DATE_TRUNC('day', al.created_at) as audit_date,
    DATE_TRUNC('month', al.created_at) as audit_month
FROM audit_logs al;

COMMENT ON VIEW compliance_reporting_basic IS 'Basic audit log data with backward compatibility for resource_type/resource_id';

-- =====================================================================
-- PHASE 2: USER ACTIVITY TRACKING
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

COMMENT ON VIEW compliance_reporting_user_activity IS 'Audit logs enriched with user information and activity metrics';

-- =====================================================================
-- PHASE 3: DATA CHANGE TRACKING
-- Analyze what data is being changed (uses enhanced audit columns)
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting_data_changes AS
SELECT 
    crua.*,
    -- Data change analysis (using enhanced audit columns)
    COALESCE(array_length(al.changed_fields, 1), 0) as fields_changed_count,
    al.changed_fields,
    -- Full change history
    al.old_data,
    al.new_data,
    -- Sensitive operations classification
    CASE 
        WHEN crua.table_name IN ('users', 'payment_methods', 'transactions', 'wallet_connections') THEN 'HIGH'
        WHEN crua.table_name IN ('tickets', 'events', 'reservations') THEN 'MEDIUM'
        ELSE 'LOW'
    END as sensitivity_level,
    -- Operation risk score (for alerting)
    CASE 
        WHEN crua.action = 'DELETE' AND crua.table_name IN ('users', 'transactions') THEN 100
        WHEN crua.action = 'DELETE' THEN 80
        WHEN crua.action = 'UPDATE' AND crua.table_name = 'users' THEN 70
        WHEN crua.action = 'UPDATE' AND crua.table_name IN ('transactions', 'payment_methods') THEN 90
        WHEN crua.action = 'UPDATE' THEN 50
        WHEN crua.action = 'INSERT' THEN 20
        ELSE 10
    END as operation_risk_score
FROM compliance_reporting_user_activity crua
JOIN audit_logs al ON crua.audit_id = al.id;

COMMENT ON VIEW compliance_reporting_data_changes IS 'Detailed change tracking with field-level analysis and risk scoring';

-- =====================================================================
-- PHASE 4: COMPLIANCE RISK ANALYSIS
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

COMMENT ON VIEW compliance_reporting_risk_analysis IS 'Risk analysis with anomaly detection and alert priority levels';

-- =====================================================================
-- FINAL VIEW: COMPLETE COMPLIANCE REPORTING
-- This is the main view that applications should use
-- Note: Phase 5 (venue compliance) removed due to schema limitations
-- venue_compliance table only has: id, venue_id, settings, created_at, updated_at
-- =====================================================================

CREATE OR REPLACE VIEW compliance_reporting AS
SELECT * FROM compliance_reporting_risk_analysis;

COMMENT ON VIEW compliance_reporting IS 'Primary compliance reporting view - comprehensive audit data with risk analysis and venue compliance';

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
    COUNT(CASE WHEN unusual_hour_activity THEN 1 END) as after_hours_ops,
    COUNT(CASE WHEN fields_changed_count > 0 THEN 1 END) as data_modification_ops
FROM compliance_reporting
GROUP BY audit_date
ORDER BY audit_date DESC;

COMMENT ON VIEW daily_compliance_summary IS 'Daily rollup of compliance metrics and alerts';

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
    COUNT(CASE WHEN unusual_hour_activity THEN 1 END) as after_hours_actions,
    MAX(created_at) as last_activity
FROM compliance_reporting
WHERE user_id IS NOT NULL
GROUP BY user_id, user_email, user_role
ORDER BY high_risk_ops_count DESC, total_operations DESC;

COMMENT ON VIEW user_risk_profile IS 'Risk assessment by user based on activity patterns and operations';

-- Table activity summary
CREATE OR REPLACE VIEW table_activity_summary AS
SELECT 
    table_name,
    action,
    sensitivity_level,
    COUNT(*) as operation_count,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(fields_changed_count) as avg_fields_changed,
    MAX(created_at) as last_modified,
    COUNT(CASE WHEN fields_changed_count > 5 THEN 1 END) as large_change_count
FROM compliance_reporting
WHERE table_name IS NOT NULL
GROUP BY table_name, action, sensitivity_level
ORDER BY operation_count DESC;

COMMENT ON VIEW table_activity_summary IS 'Summary of database operations by table with change magnitude tracking';

-- Field-level change analysis
CREATE OR REPLACE VIEW field_change_analysis AS
SELECT 
    table_name,
    unnest(changed_fields) as field_name,
    COUNT(*) as change_count,
    COUNT(DISTINCT user_id) as users_modifying,
    MAX(created_at) as last_changed
FROM compliance_reporting
WHERE changed_fields IS NOT NULL
GROUP BY table_name, field_name
ORDER BY change_count DESC;

COMMENT ON VIEW field_change_analysis IS 'Analysis of which fields are being modified most frequently';

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
    is_high_risk_operation,
    fields_changed_count,
    changed_fields
FROM compliance_reporting;

COMMENT ON VIEW compliance_reporting_gdpr IS 'GDPR-compliant view excluding personal information';

-- =====================================================================
-- MATERIALIZED VIEW FOR PERFORMANCE (30-day window)
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS compliance_reporting_materialized CASCADE;

CREATE MATERIALIZED VIEW compliance_reporting_materialized AS
SELECT * 
FROM compliance_reporting
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days';

-- Create indexes on materialized view
CREATE INDEX idx_comp_mat_date ON compliance_reporting_materialized(audit_date);
CREATE INDEX idx_comp_mat_user ON compliance_reporting_materialized(user_id);
CREATE INDEX idx_comp_mat_table ON compliance_reporting_materialized(table_name);
CREATE INDEX idx_comp_mat_alert ON compliance_reporting_materialized(alert_level);
CREATE INDEX idx_comp_mat_risk ON compliance_reporting_materialized(operation_risk_score);

COMMENT ON MATERIALIZED VIEW compliance_reporting_materialized IS 'Performance-optimized materialized view with 30-day rolling window';

-- =====================================================================
-- REFRESH FUNCTION FOR MATERIALIZED VIEW
-- =====================================================================

CREATE OR REPLACE FUNCTION refresh_compliance_reporting_materialized()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_reporting_materialized;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_compliance_reporting_materialized() IS 'Refresh the compliance reporting materialized view (run daily via cron)';

-- =====================================================================
-- SAMPLE QUERIES
-- =====================================================================

/*

-- View all changes to a specific user record
SELECT 
  created_at,
  action,
  user_email as performed_by,
  changed_fields,
  old_data,
  new_data
FROM compliance_reporting
WHERE table_name = 'users' 
  AND record_id = '<user-id>'
ORDER BY created_at DESC;

-- Find high-risk operations in last 24 hours
SELECT 
  created_at,
  user_email,
  table_name,
  action,
  alert_level,
  operation_risk_score,
  changed_fields
FROM compliance_reporting
WHERE alert_level IN ('HIGH', 'CRITICAL')
  AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY operation_risk_score DESC;

-- Audit trail for specific field changes
SELECT 
  created_at,
  table_name,
  record_id,
  user_email,
  old_data->>'email' as old_email,
  new_data->>'email' as new_email
FROM compliance_reporting
WHERE 'email' = ANY(changed_fields)
ORDER BY created_at DESC;

-- Users with unusual activity patterns
SELECT * FROM user_risk_profile
WHERE after_hours_actions > 5
  OR high_risk_ops_count > 10
ORDER BY max_risk_score DESC;

-- Compliance status check
SELECT * FROM daily_compliance_summary
WHERE audit_date = CURRENT_DATE;

*/
