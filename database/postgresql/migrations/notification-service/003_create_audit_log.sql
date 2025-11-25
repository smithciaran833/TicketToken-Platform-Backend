-- Migration: Create audit_log table for compliance tracking
-- Service: notification-service
-- Created: 2025-11-17

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(20) DEFAULT 'system',
    subject_id VARCHAR(255),
    subject_type VARCHAR(50),
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for common queries
    CONSTRAINT audit_log_actor_type_check CHECK (actor_type IN ('user', 'system', 'admin')),
    CONSTRAINT audit_log_severity_check CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Create indexes for efficient querying
CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX idx_audit_log_subject_id ON audit_log(subject_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_severity ON audit_log(severity);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Combined indexes for common query patterns
CREATE INDEX idx_audit_log_user_actions ON audit_log(subject_id, action, created_at DESC);
CREATE INDEX idx_audit_log_critical_events ON audit_log(severity, created_at DESC) WHERE severity = 'critical';

-- Add comment
COMMENT ON TABLE audit_log IS 'Audit trail for compliance and security tracking';
COMMENT ON COLUMN audit_log.action IS 'Action performed (e.g., pii_access, data_export)';
COMMENT ON COLUMN audit_log.actor_id IS 'ID of the entity performing the action';
COMMENT ON COLUMN audit_log.actor_type IS 'Type of actor: user, system, or admin';
COMMENT ON COLUMN audit_log.subject_id IS 'ID of the entity being acted upon';
COMMENT ON COLUMN audit_log.subject_type IS 'Type of subject: user, notification, consent';
COMMENT ON COLUMN audit_log.resource_type IS 'Type of resource accessed';
COMMENT ON COLUMN audit_log.resource_id IS 'ID of the resource accessed';
COMMENT ON COLUMN audit_log.details IS 'Additional details about the action';
COMMENT ON COLUMN audit_log.severity IS 'Severity level: info, warning, or critical';
