-- =====================================================
-- TicketToken Platform - Core Audit Logs Schema
-- Week 1, Day 2 Development
-- =====================================================
-- Description: Comprehensive audit trail system for compliance and security
-- Version: 1.0
-- Created: 2025-07-16 14:16:46
-- Compliance: SOC2, GDPR, PCI DSS, HIPAA ready
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- For data encryption
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- For text search optimization

-- Create ENUM types for audit management
CREATE TYPE audit_category AS ENUM (
    'authentication',       -- Login, logout, password changes
    'authorization',        -- Permission grants, role changes
    'data_modification',    -- CRUD operations on business data
    'financial',           -- Payment processing, refunds, financial operations
    'security',            -- Security events, failed access attempts
    'system',              -- System configuration changes
    'privacy',             -- Data access, exports, privacy-related actions
    'compliance'           -- Compliance-related activities
);

CREATE TYPE audit_severity AS ENUM (
    'info',                -- Informational events
    'warning',             -- Warning conditions
    'error',               -- Error conditions
    'critical'             -- Critical security or system events
);

CREATE TYPE audit_action AS ENUM (
    'create',              -- Record creation
    'read',                -- Data access/viewing
    'update',              -- Record modification
    'delete',              -- Record deletion
    'login',               -- User authentication
    'logout',              -- Session termination
    'grant',               -- Permission/role granting
    'revoke',              -- Permission/role revocation
    'approve',             -- Approval actions
    'reject',              -- Rejection actions
    'export',              -- Data export
    'import',              -- Data import
    'backup',              -- Backup operations
    'restore',             -- Restore operations
    'configure',           -- Configuration changes
    'archive',             -- Data archival
    'purge'                -- Data purging
);

-- =====================================================
-- AUDIT_LOGS TABLE
-- =====================================================
-- Primary audit trail table for all system activities
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Request and session tracking
    request_id VARCHAR(100),                             -- Unique request identifier for tracing
    session_id UUID,                                     -- Reference to sessions.id
    correlation_id VARCHAR(100),                         -- Cross-service correlation ID
    
    -- User and actor information
    user_id UUID,                                        -- Reference to users.id (NULL for system actions)
    impersonated_by_user_id UUID,                       -- If action performed via impersonation
    actor_type VARCHAR(50) NOT NULL DEFAULT 'user',     -- Actor type (user, system, api, cron)
    actor_identifier VARCHAR(200),                       -- Additional actor identification
    
    -- Audit event classification
    category audit_category NOT NULL,                    -- Event category
    action audit_action NOT NULL,                        -- Action performed
    severity audit_severity NOT NULL DEFAULT 'info',    -- Event severity
    
    -- Entity information
    entity_type VARCHAR(100) NOT NULL,                  -- Type of entity affected (user, venue, event, etc.)
    entity_id VARCHAR(100),                             -- ID of affected entity
    entity_name VARCHAR(200),                           -- Human-readable entity name
    parent_entity_type VARCHAR(100),                    -- Parent entity type (for hierarchical data)
    parent_entity_id VARCHAR(100),                      -- Parent entity ID
    
    -- Change tracking
    before_data JSONB,                                  -- Entity state before change
    after_data JSONB,                                   -- Entity state after change
    changed_fields TEXT[],                              -- Array of field names that changed
    
    -- Event details
    event_description TEXT NOT NULL,                    -- Human-readable event description
    event_details JSONB,                               -- Additional structured event data
    failure_reason TEXT,                               -- Reason for failure (if applicable)
    
    -- Request context
    ip_address INET,                                    -- Client IP address
    user_agent TEXT,                                    -- Client user agent
    http_method VARCHAR(10),                            -- HTTP method (GET, POST, etc.)
    endpoint_url TEXT,                                  -- API endpoint or page URL
    http_status_code INTEGER,                           -- HTTP response status
    processing_time_ms INTEGER,                         -- Request processing time
    
    -- Geographic and network context
    country_code CHAR(2),                               -- ISO country code
    region VARCHAR(100),                                -- State/region
    city VARCHAR(100),                                  -- City
    timezone VARCHAR(100),                              -- Client timezone
    
    -- Security context
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,        -- Contains sensitive data
    is_anomalous BOOLEAN NOT NULL DEFAULT FALSE,        -- Flagged as anomalous behavior
    risk_score INTEGER DEFAULT 0,                      -- Risk assessment (0-100)
    security_flags JSONB DEFAULT '{}',                 -- Security-related metadata
    
    -- Compliance and retention
    retention_period INTERVAL DEFAULT INTERVAL '7 years', -- How long to retain this record
    is_gdpr_relevant BOOLEAN NOT NULL DEFAULT FALSE,    -- Subject to GDPR requirements
    is_pci_relevant BOOLEAN NOT NULL DEFAULT FALSE,     -- Subject to PCI DSS requirements
    is_hipaa_relevant BOOLEAN NOT NULL DEFAULT FALSE,   -- Subject to HIPAA requirements
    compliance_tags TEXT[],                             -- Additional compliance classifications
    
    -- Audit metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Event timestamp
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- When record was stored
    processed_at TIMESTAMPTZ,                          -- When record was processed/analyzed
    
    -- Data integrity
    checksum VARCHAR(64),                               -- Data integrity checksum
    is_tampered BOOLEAN NOT NULL DEFAULT FALSE,         -- Tampering detection flag
    
    -- Archival support
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,         -- Record is archived
    archived_at TIMESTAMPTZ,                           -- Archive timestamp
    archive_location TEXT,                              -- Archive storage location
    
    -- Constraints
    CONSTRAINT audit_logs_valid_processing_time CHECK (processing_time_ms IS NULL OR processing_time_ms >= 0),
    CONSTRAINT audit_logs_valid_risk_score CHECK (risk_score >= 0 AND risk_score <= 100),
    CONSTRAINT audit_logs_valid_http_status CHECK (http_status_code IS NULL OR (http_status_code >= 100 AND http_status_code < 600)),
    CONSTRAINT audit_logs_valid_archive CHECK ((is_archived = FALSE AND archived_at IS NULL) OR (is_archived = TRUE AND archived_at IS NOT NULL))
);

-- =====================================================
-- AUDIT_LOG_SUMMARIES TABLE
-- =====================================================
-- Aggregated audit data for reporting and compliance
CREATE TABLE IF NOT EXISTS audit_log_summaries (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Summary period
    summary_date DATE NOT NULL,                         -- Date of summary
    summary_type VARCHAR(50) NOT NULL,                  -- Type of summary (daily, weekly, monthly)
    
    -- Aggregated counts by category
    authentication_events INTEGER NOT NULL DEFAULT 0,
    authorization_events INTEGER NOT NULL DEFAULT 0,
    data_modification_events INTEGER NOT NULL DEFAULT 0,
    financial_events INTEGER NOT NULL DEFAULT 0,
    security_events INTEGER NOT NULL DEFAULT 0,
    system_events INTEGER NOT NULL DEFAULT 0,
    privacy_events INTEGER NOT NULL DEFAULT 0,
    compliance_events INTEGER NOT NULL DEFAULT 0,
    
    -- Aggregated counts by severity
    info_events INTEGER NOT NULL DEFAULT 0,
    warning_events INTEGER NOT NULL DEFAULT 0,
    error_events INTEGER NOT NULL DEFAULT 0,
    critical_events INTEGER NOT NULL DEFAULT 0,
    
    -- Summary statistics
    total_events INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    unique_ip_addresses INTEGER NOT NULL DEFAULT 0,
    anomalous_events INTEGER NOT NULL DEFAULT 0,
    high_risk_events INTEGER NOT NULL DEFAULT 0,
    
    -- Compliance metrics
    gdpr_relevant_events INTEGER NOT NULL DEFAULT 0,
    pci_relevant_events INTEGER NOT NULL DEFAULT 0,
    hipaa_relevant_events INTEGER NOT NULL DEFAULT 0,
    
    -- Summary metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(summary_date, summary_type)
);

-- =====================================================
-- AUDIT_LOG_ALERTS TABLE
-- =====================================================
-- Alert rules and notifications for audit events
CREATE TABLE IF NOT EXISTS audit_log_alerts (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Alert definition
    alert_name VARCHAR(200) NOT NULL UNIQUE,            -- Alert rule name
    alert_description TEXT,                             -- Alert description
    
    -- Alert conditions
    category_filter audit_category[],                   -- Categories to monitor
    severity_filter audit_severity[],                   -- Severities to monitor
    entity_type_filter VARCHAR(100)[],                 -- Entity types to monitor
    action_filter audit_action[],                      -- Actions to monitor
    
    -- Alert criteria
    threshold_count INTEGER,                            -- Event count threshold
    threshold_period INTERVAL,                          -- Time period for threshold
    risk_score_threshold INTEGER,                       -- Risk score threshold
    
    -- Alert conditions (JSON for complex rules)
    conditions JSONB,                                   -- Complex alert conditions
    
    -- Alert configuration
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Alert is active
    notification_channels TEXT[],                       -- Notification methods (email, slack, webhook)
    escalation_rules JSONB,                            -- Escalation configuration
    
    -- Alert metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Alert statistics
    last_triggered_at TIMESTAMPTZ,                     -- When alert last fired
    trigger_count INTEGER NOT NULL DEFAULT 0,           -- How many times alert has fired
    
    -- Constraints
    CONSTRAINT audit_alerts_valid_threshold CHECK (threshold_count IS NULL OR threshold_count > 0),
    CONSTRAINT audit_alerts_valid_risk_threshold CHECK (risk_score_threshold IS NULL OR (risk_score_threshold >= 0 AND risk_score_threshold <= 100))
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Time-based indexes (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON audit_logs(created_at DESC);

-- User and entity indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id) WHERE entity_id IS NOT NULL;

-- Classification indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- Request tracking indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;

-- Security and monitoring indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_anomalous ON audit_logs(is_anomalous) WHERE is_anomalous = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_sensitive ON audit_logs(is_sensitive) WHERE is_sensitive = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk_score ON audit_logs(risk_score) WHERE risk_score > 0;

-- Compliance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_gdpr ON audit_logs(is_gdpr_relevant) WHERE is_gdpr_relevant = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_pci ON audit_logs(is_pci_relevant) WHERE is_pci_relevant = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_hipaa ON audit_logs(is_hipaa_relevant) WHERE is_hipaa_relevant = TRUE;

-- Archive and retention indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_archived ON audit_logs(is_archived, archived_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_retention ON audit_logs(created_at, retention_period);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category_severity ON audit_logs(category, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_security_monitoring ON audit_logs(category, severity, is_anomalous, risk_score, created_at DESC) 
    WHERE category = 'security' OR severity IN ('error', 'critical') OR is_anomalous = TRUE OR risk_score > 50;

-- Full text search index for event descriptions
CREATE INDEX IF NOT EXISTS idx_audit_logs_description_search ON audit_logs USING gin(to_tsvector('english', event_description));

-- JSON data indexes for before/after data searches
CREATE INDEX IF NOT EXISTS idx_audit_logs_before_data ON audit_logs USING gin(before_data) WHERE before_data IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_after_data ON audit_logs USING gin(after_data) WHERE after_data IS NOT NULL;

-- Summary table indexes
CREATE INDEX IF NOT EXISTS idx_audit_summaries_date_type ON audit_log_summaries(summary_date, summary_type);
CREATE INDEX IF NOT EXISTS idx_audit_summaries_created_at ON audit_log_summaries(created_at);

-- Alerts table indexes
CREATE INDEX IF NOT EXISTS idx_audit_alerts_active ON audit_log_alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_alerts_last_triggered ON audit_log_alerts(last_triggered_at);

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to calculate data integrity checksum
CREATE OR REPLACE FUNCTION calculate_audit_checksum(record_data JSONB)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(record_data::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to detect data tampering
CREATE OR REPLACE FUNCTION detect_audit_tampering()
RETURNS TRIGGER AS $$
DECLARE
    calculated_checksum VARCHAR(64);
    record_data JSONB;
BEGIN
    -- Only check for tampering on updates
    IF TG_OP = 'UPDATE' THEN
        -- Create a JSON representation of the original record for checksum
        record_data = jsonb_build_object(
            'id', OLD.id,
            'user_id', OLD.user_id,
            'category', OLD.category,
            'action', OLD.action,
            'entity_type', OLD.entity_type,
            'entity_id', OLD.entity_id,
            'before_data', OLD.before_data,
            'after_data', OLD.after_data,
            'event_description', OLD.event_description,
            'created_at', OLD.created_at
        );
        
        calculated_checksum = calculate_audit_checksum(record_data);
        
        -- If checksum doesn't match, flag as tampered
        IF OLD.checksum IS NOT NULL AND OLD.checksum != calculated_checksum THEN
            NEW.is_tampered = TRUE;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically set checksum and process audit records
CREATE OR REPLACE FUNCTION process_audit_record()
RETURNS TRIGGER AS $$
DECLARE
    record_data JSONB;
BEGIN
    -- Set ingestion timestamp
    NEW.ingested_at = NOW();
    
    -- Calculate and set checksum for new records
    IF TG_OP = 'INSERT' THEN
        record_data = jsonb_build_object(
            'id', NEW.id,
            'user_id', NEW.user_id,
            'category', NEW.category,
            'action', NEW.action,
            'entity_type', NEW.entity_type,
            'entity_id', NEW.entity_id,
            'before_data', NEW.before_data,
            'after_data', NEW.after_data,
            'event_description', NEW.event_description,
            'created_at', NEW.created_at
        );
        
        NEW.checksum = calculate_audit_checksum(record_data);
        
        -- Auto-detect anomalous behavior based on patterns
        IF NEW.risk_score >= 70 OR 
           (NEW.severity IN ('error', 'critical') AND NEW.category = 'security') OR
           NEW.ip_address IS DISTINCT FROM (
               SELECT ip_address FROM audit_logs 
               WHERE user_id = NEW.user_id 
               AND created_at > NOW() - INTERVAL '24 hours'
               ORDER BY created_at DESC LIMIT 1
           ) THEN
            NEW.is_anomalous = TRUE;
        END IF;
        
        -- Set compliance flags based on content
        IF NEW.entity_type IN ('user', 'user_data', 'personal_info') OR 
           NEW.event_description ILIKE '%personal%' OR 
           NEW.event_description ILIKE '%privacy%' THEN
            NEW.is_gdpr_relevant = TRUE;
        END IF;
        
        IF NEW.entity_type IN ('payment', 'card', 'financial') OR 
           NEW.category = 'financial' THEN
            NEW.is_pci_relevant = TRUE;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_audit_tampering_detection ON audit_logs;
CREATE TRIGGER trigger_audit_tampering_detection
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION detect_audit_tampering();

DROP TRIGGER IF EXISTS trigger_audit_record_processing ON audit_logs;
CREATE TRIGGER trigger_audit_record_processing
    BEFORE INSERT OR UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION process_audit_record();

-- =====================================================
-- AUDIT LOGGING HELPER FUNCTIONS
-- =====================================================

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_category audit_category,
    p_action audit_action,
    p_entity_type VARCHAR(100),
    p_entity_id VARCHAR(100) DEFAULT NULL,
    p_entity_name VARCHAR(200) DEFAULT NULL,
    p_event_description TEXT DEFAULT NULL,
    p_before_data JSONB DEFAULT NULL,
    p_after_data JSONB DEFAULT NULL,
    p_severity audit_severity DEFAULT 'info',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_session_id UUID DEFAULT NULL,
    p_request_id VARCHAR(100) DEFAULT NULL,
    p_additional_data JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    audit_log_id UUID;
    calculated_changed_fields TEXT[];
BEGIN
    -- Calculate changed fields if before and after data provided
    IF p_before_data IS NOT NULL AND p_after_data IS NOT NULL THEN
        SELECT array_agg(key) INTO calculated_changed_fields
        FROM (
            SELECT key FROM jsonb_each(p_before_data)
            EXCEPT
            SELECT key FROM jsonb_each(p_after_data)
            UNION
            SELECT key FROM jsonb_each(p_after_data)
            EXCEPT  
            SELECT key FROM jsonb_each(p_before_data)
            UNION
            SELECT b.key FROM jsonb_each(p_before_data) b
            JOIN jsonb_each(p_after_data) a ON b.key = a.key
            WHERE b.value != a.value
        ) changed;
    END IF;
    
    -- Insert audit log record
    INSERT INTO audit_logs (
        user_id, category, action, entity_type, entity_id, entity_name,
        event_description, before_data, after_data, changed_fields,
        severity, ip_address, user_agent, session_id, request_id,
        event_details
    ) VALUES (
        p_user_id, p_category, p_action, p_entity_type, p_entity_id, p_entity_name,
        COALESCE(p_event_description, p_action::text || ' ' || p_entity_type),
        p_before_data, p_after_data, calculated_changed_fields,
        p_severity, p_ip_address, p_user_agent, p_session_id, p_request_id,
        p_additional_data
    ) RETURNING id INTO audit_log_id;
    
    RETURN audit_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get user audit trail
CREATE OR REPLACE FUNCTION get_user_audit_trail(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW(),
    p_category audit_category DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
) RETURNS TABLE(
    id UUID,
    created_at TIMESTAMPTZ,
    category audit_category,
    action audit_action,
    entity_type VARCHAR(100),
    entity_name VARCHAR(200),
    event_description TEXT,
    severity audit_severity,
    ip_address INET
) AS $$
BEGIN
    RETURN QUERY
    SELECT al.id, al.created_at, al.category, al.action, al.entity_type,
           al.entity_name, al.event_description, al.severity, al.ip_address
    FROM audit_logs al
    WHERE al.user_id = p_user_id
    AND al.created_at BETWEEN p_start_date AND p_end_date
    AND (p_category IS NULL OR al.category = p_category)
    AND al.is_archived = FALSE
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get entity audit trail
CREATE OR REPLACE FUNCTION get_entity_audit_trail(
    p_entity_type VARCHAR(100),
    p_entity_id VARCHAR(100),
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW(),
    p_limit INTEGER DEFAULT 100
) RETURNS TABLE(
    id UUID,
    created_at TIMESTAMPTZ,
    user_id UUID,
    action audit_action,
    event_description TEXT,
    before_data JSONB,
    after_data JSONB,
    changed_fields TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT al.id, al.created_at, al.user_id, al.action, al.event_description,
           al.before_data, al.after_data, al.changed_fields
    FROM audit_logs al
    WHERE al.entity_type = p_entity_type
    AND al.entity_id = p_entity_id
    AND al.created_at BETWEEN p_start_date AND p_end_date
    AND al.is_archived = FALSE
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search audit logs
CREATE OR REPLACE FUNCTION search_audit_logs(
    p_search_text TEXT,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW(),
    p_categories audit_category[] DEFAULT NULL,
    p_severities audit_severity[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    id UUID,
    created_at TIMESTAMPTZ,
    user_id UUID,
    category audit_category,
    action audit_action,
    entity_type VARCHAR(100),
    event_description TEXT,
    severity audit_severity,
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT al.id, al.created_at, al.user_id, al.category, al.action,
           al.entity_type, al.event_description, al.severity,
           ts_rank(to_tsvector('english', al.event_description), plainto_tsquery('english', p_search_text)) as relevance_score
    FROM audit_logs al
    WHERE al.created_at BETWEEN p_start_date AND p_end_date
    AND to_tsvector('english', al.event_description) @@ plainto_tsquery('english', p_search_text)
    AND (p_categories IS NULL OR al.category = ANY(p_categories))
    AND (p_severities IS NULL OR al.severity = ANY(p_severities))
    AND al.is_archived = FALSE
    ORDER BY relevance_score DESC, al.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to generate compliance report
CREATE OR REPLACE FUNCTION generate_compliance_report(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_compliance_type VARCHAR(20) DEFAULT 'all'  -- 'gdpr', 'pci', 'hipaa', 'all'
) RETURNS TABLE(
    report_period TEXT,
    total_events BIGINT,
    gdpr_events BIGINT,
    pci_events BIGINT,
    hipaa_events BIGINT,
    critical_events BIGINT,
    anomalous_events BIGINT,
    user_data_access_events BIGINT,
    financial_events BIGINT,
    security_events BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_start_date::date || ' to ' || p_end_date::date as report_period,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE is_gdpr_relevant = TRUE) as gdpr_events,
        COUNT(*) FILTER (WHERE is_pci_relevant = TRUE) as pci_events,
        COUNT(*) FILTER (WHERE is_hipaa_relevant = TRUE) as hipaa_events,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
        COUNT(*) FILTER (WHERE is_anomalous = TRUE) as anomalous_events,
        COUNT(*) FILTER (WHERE category = 'privacy' OR action = 'read' AND entity_type = 'user') as user_data_access_events,
        COUNT(*) FILTER (WHERE category = 'financial') as financial_events,
        COUNT(*) FILTER (WHERE category = 'security') as security_events
    FROM audit_logs
    WHERE created_at BETWEEN p_start_date AND p_end_date
    AND is_archived = FALSE
    AND CASE 
        WHEN p_compliance_type = 'gdpr' THEN is_gdpr_relevant = TRUE
        WHEN p_compliance_type = 'pci' THEN is_pci_relevant = TRUE
        WHEN p_compliance_type = 'hipaa' THEN is_hipaa_relevant = TRUE
        ELSE TRUE
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RETENTION AND ARCHIVAL FUNCTIONS
-- =====================================================

-- Function to archive old audit logs
CREATE OR REPLACE FUNCTION archive_audit_logs(
    p_archive_before_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 year',
    p_batch_size INTEGER DEFAULT 1000
) RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER := 0;
    batch_count INTEGER;
BEGIN
    LOOP
        -- Archive records in batches
        UPDATE audit_logs
        SET is_archived = TRUE,
            archived_at = NOW(),
            archive_location = 'cold_storage'
        WHERE id IN (
            SELECT id FROM audit_logs
            WHERE created_at < p_archive_before_date
            AND is_archived = FALSE
            ORDER BY created_at
            LIMIT p_batch_size
        );
        
        GET DIAGNOSTICS batch_count = ROW_COUNT;
        archived_count := archived_count + batch_count;
        
        -- Exit if no more records to archive
        EXIT WHEN batch_count = 0;
        
        -- Commit batch and pause to avoid long locks
        COMMIT;
    END LOOP;
    
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Function to purge expired audit logs
CREATE OR REPLACE FUNCTION purge_expired_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    purged_count INTEGER := 0;
BEGIN
    -- Only purge records that have exceeded their retention period
    -- and are already archived
    DELETE FROM audit_logs
    WHERE is_archived = TRUE
    AND archived_at < NOW() - retention_period
    AND archived_at < NOW() - INTERVAL '30 days'; -- Safety buffer
    
    GET DIAGNOSTICS purged_count = ROW_COUNT;
    
    RETURN purged_count;
END;
$$ LANGUAGE plpgsql;

-- Function to generate daily audit summary
CREATE OR REPLACE FUNCTION generate_daily_audit_summary(p_summary_date DATE DEFAULT CURRENT_DATE)
RETURNS UUID AS $$
DECLARE
    summary_id UUID;
BEGIN
    INSERT INTO audit_log_summaries (
        summary_date, summary_type,
        authentication_events, authorization_events, data_modification_events,
        financial_events, security_events, system_events, privacy_events, compliance_events,
        info_events, warning_events, error_events, critical_events,
        total_events, unique_users, unique_ip_addresses, anomalous_events, high_risk_events,
        gdpr_relevant_events, pci_relevant_events, hipaa_relevant_events
    )
    SELECT 
        p_summary_date, 'daily',
        COUNT(*) FILTER (WHERE category = 'authentication'),
        COUNT(*) FILTER (WHERE category = 'authorization'),
        COUNT(*) FILTER (WHERE category = 'data_modification'),
        COUNT(*) FILTER (WHERE category = 'financial'),
        COUNT(*) FILTER (WHERE category = 'security'),
        COUNT(*) FILTER (WHERE category = 'system'),
        COUNT(*) FILTER (WHERE category = 'privacy'),
        COUNT(*) FILTER (WHERE category = 'compliance'),
        COUNT(*) FILTER (WHERE severity = 'info'),
        COUNT(*) FILTER (WHERE severity = 'warning'),
        COUNT(*) FILTER (WHERE severity = 'error'),
        COUNT(*) FILTER (WHERE severity = 'critical'),
        COUNT(*),
        COUNT(DISTINCT user_id),
        COUNT(DISTINCT ip_address),
        COUNT(*) FILTER (WHERE is_anomalous = TRUE),
        COUNT(*) FILTER (WHERE risk_score >= 70),
        COUNT(*) FILTER (WHERE is_gdpr_relevant = TRUE),
        COUNT(*) FILTER (WHERE is_pci_relevant = TRUE),
        COUNT(*) FILTER (WHERE is_hipaa_relevant = TRUE)
    FROM audit_logs
    WHERE DATE(created_at) = p_summary_date
    ON CONFLICT (summary_date, summary_type) 
    DO UPDATE SET
        authentication_events = EXCLUDED.authentication_events,
        authorization_events = EXCLUDED.authorization_events,
        data_modification_events = EXCLUDED.data_modification_events,
        financial_events = EXCLUDED.financial_events,
        security_events = EXCLUDED.security_events,
        system_events = EXCLUDED.system_events,
        privacy_events = EXCLUDED.privacy_events,
        compliance_events = EXCLUDED.compliance_events,
        info_events = EXCLUDED.info_events,
        warning_events = EXCLUDED.warning_events,
        error_events = EXCLUDED.error_events,
        critical_events = EXCLUDED.critical_events,
        total_events = EXCLUDED.total_events,
        unique_users = EXCLUDED.unique_users,
        unique_ip_addresses = EXCLUDED.unique_ip_addresses,
        anomalous_events = EXCLUDED.anomalous_events,
        high_risk_events = EXCLUDED.high_risk_events,
        gdpr_relevant_events = EXCLUDED.gdpr_relevant_events,
        pci_relevant_events = EXCLUDED.pci_relevant_events,
        hipaa_relevant_events = EXCLUDED.hipaa_relevant_events
    RETURNING id INTO summary_id;
    
    RETURN summary_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail system for compliance, security, and change tracking';
COMMENT ON TABLE audit_log_summaries IS 'Aggregated audit data for reporting and compliance analytics';
COMMENT ON TABLE audit_log_alerts IS 'Alert rules and notifications for suspicious audit events';

-- Audit logs table comments
COMMENT ON COLUMN audit_logs.request_id IS 'Request identifier: unique ID for tracing requests across services';
COMMENT ON COLUMN audit_logs.correlation_id IS 'Correlation identifier: links related events across different systems';
COMMENT ON COLUMN audit_logs.before_data IS 'Before state: JSON snapshot of entity before change';
COMMENT ON COLUMN audit_logs.after_data IS 'After state: JSON snapshot of entity after change';
COMMENT ON COLUMN audit_logs.changed_fields IS 'Changed fields: array of field names that were modified';
COMMENT ON COLUMN audit_logs.is_sensitive IS 'Sensitive data flag: contains personally identifiable information';
COMMENT ON COLUMN audit_logs.is_anomalous IS 'Anomaly flag: flagged by automated anomaly detection';
COMMENT ON COLUMN audit_logs.risk_score IS 'Risk assessment: automated scoring of event risk level (0-100)';
COMMENT ON COLUMN audit_logs.retention_period IS 'Retention period: how long to retain this audit record';
COMMENT ON COLUMN audit_logs.checksum IS 'Data integrity: SHA-256 checksum for tampering detection';
COMMENT ON COLUMN audit_logs.is_tampered IS 'Tampering flag: indicates if record has been modified';

-- =====================================================
-- AUDIT TRAIL SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive audit trail system with:
-- - Complete change tracking with before/after snapshots
-- - Compliance-ready audit logs (SOC2, GDPR, PCI DSS, HIPAA)
-- - Security monitoring and anomaly detection
-- - Data integrity protection with checksums
-- - Automated retention and archival policies
-- - Helper functions for audit logging and querying
-- - Performance-optimized indexes
-- - Alert system for suspicious activities
-- - Comprehensive reporting and analytics
-- Ready for TicketToken Week 1 development
-- =====================================================
