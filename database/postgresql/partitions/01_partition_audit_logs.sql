-- Partition core.audit_logs by month
-- Run this BEFORE inserting any data!

BEGIN;

-- Drop existing table (it's empty)
DROP TABLE IF EXISTS core.audit_logs CASCADE;

-- Create partitioned table
CREATE TABLE core.audit_logs (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    request_id UUID,
    environment VARCHAR(20) DEFAULT 'production',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create indexes
CREATE INDEX idx_audit_logs_user_id ON core.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON core.audit_logs(action);
CREATE INDEX idx_audit_logs_table_record ON core.audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_created_at ON core.audit_logs(created_at);

-- Create initial partitions (6 months)
CREATE TABLE core.audit_logs_2025_01 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE core.audit_logs_2025_02 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE core.audit_logs_2025_03 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE core.audit_logs_2025_04 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE core.audit_logs_2025_05 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE core.audit_logs_2025_06 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE core.audit_logs_2025_07 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE core.audit_logs_2025_08 PARTITION OF core.audit_logs
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

COMMIT;
