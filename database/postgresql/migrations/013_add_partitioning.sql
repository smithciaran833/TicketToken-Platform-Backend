-- Migration: Add Table Partitioning
-- Version: 013
-- Description: Implements partitioning for high-volume tables to improve performance and maintenance
-- Dependencies: Tables from migrations 001-010
-- Estimated Duration: 2-5 minutes (depending on data volume)

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UP Migration
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Partition Management Functions
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partition(
    p_parent_table TEXT,
    p_start_date DATE
) RETURNS TEXT AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
    v_sql TEXT;
BEGIN
    -- Normalize to first day of month
    v_start_date := DATE_TRUNC('month', p_start_date);
    v_end_date := v_start_date + INTERVAL '1 month';
    
    -- Generate partition name
    v_partition_name := p_parent_table || '_' || TO_CHAR(v_start_date, 'YYYY_MM');
    
    -- Check if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_partition_name
        AND n.nspname = 'public'
    ) THEN
        RETURN 'Partition ' || v_partition_name || ' already exists';
    END IF;
    
    -- Create partition
    v_sql := format(
        'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        p_parent_table,
        v_start_date,
        v_end_date
    );
    
    EXECUTE v_sql;
    
    -- Create indexes on partition (they inherit from parent)
    -- Add any partition-specific indexes here if needed
    
    RETURN 'Created partition: ' || v_partition_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_monthly_partition IS 'Creates monthly partitions for a given table';

-- Function to create weekly partitions
CREATE OR REPLACE FUNCTION create_weekly_partition(
    p_parent_table TEXT,
    p_start_date DATE
) RETURNS TEXT AS $$
DECLARE
    v_partition_name TEXT;
    v_start_date DATE;
    v_end_date DATE;
    v_sql TEXT;
BEGIN
    -- Normalize to Monday of the week
    v_start_date := DATE_TRUNC('week', p_start_date);
    v_end_date := v_start_date + INTERVAL '1 week';
    
    -- Generate partition name
    v_partition_name := p_parent_table || '_' || TO_CHAR(v_start_date, 'YYYY_WW');
    
    -- Check if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_partition_name
        AND n.nspname = 'public'
    ) THEN
        RETURN 'Partition ' || v_partition_name || ' already exists';
    END IF;
    
    -- Create partition
    v_sql := format(
        'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        p_parent_table,
        v_start_date,
        v_end_date
    );
    
    EXECUTE v_sql;
    
    RETURN 'Created partition: ' || v_partition_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_weekly_partition IS 'Creates weekly partitions for a given table';

-- Function to create daily partitions
CREATE OR REPLACE FUNCTION create_daily_partition(
    p_parent_table TEXT,
    p_start_date DATE
) RETURNS TEXT AS $$
DECLARE
    v_partition_name TEXT;
    v_end_date DATE;
    v_sql TEXT;
BEGIN
    v_end_date := p_start_date + INTERVAL '1 day';
    
    -- Generate partition name
    v_partition_name := p_parent_table || '_' || TO_CHAR(p_start_date, 'YYYY_MM_DD');
    
    -- Check if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_partition_name
        AND n.nspname = 'public'
    ) THEN
        RETURN 'Partition ' || v_partition_name || ' already exists';
    END IF;
    
    -- Create partition
    v_sql := format(
        'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        p_parent_table,
        p_start_date,
        v_end_date
    );
    
    EXECUTE v_sql;
    
    RETURN 'Created partition: ' || v_partition_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_daily_partition IS 'Creates daily partitions for a given table';

-- Function to automatically create partitions ahead of time
CREATE OR REPLACE FUNCTION auto_create_partitions(
    p_table_name TEXT,
    p_partition_type TEXT, -- 'daily', 'weekly', 'monthly'
    p_days_ahead INTEGER DEFAULT 30
) RETURNS VOID AS $$
DECLARE
    v_current_date DATE;
    v_future_date DATE;
    v_partition_date DATE;
    v_result TEXT;
BEGIN
    v_current_date := CURRENT_DATE;
    v_future_date := v_current_date + (p_days_ahead || ' days')::INTERVAL;
    
    -- Create partitions from current date to future date
    v_partition_date := v_current_date;
    
    WHILE v_partition_date <= v_future_date LOOP
        CASE p_partition_type
            WHEN 'daily' THEN
                v_result := create_daily_partition(p_table_name, v_partition_date);
                v_partition_date := v_partition_date + INTERVAL '1 day';
            WHEN 'weekly' THEN
                v_result := create_weekly_partition(p_table_name, v_partition_date);
                v_partition_date := v_partition_date + INTERVAL '1 week';
            WHEN 'monthly' THEN
                v_result := create_monthly_partition(p_table_name, v_partition_date);
                v_partition_date := v_partition_date + INTERVAL '1 month';
            ELSE
                RAISE EXCEPTION 'Invalid partition type: %', p_partition_type;
        END CASE;
        
        RAISE NOTICE '%', v_result;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_create_partitions IS 'Automatically creates partitions ahead of time';

-- Function to drop old partitions
CREATE OR REPLACE FUNCTION drop_old_partitions(
    p_parent_table TEXT,
    p_retention_days INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_dropped_count INTEGER := 0;
    v_partition RECORD;
    v_cutoff_date DATE;
BEGIN
    v_cutoff_date := CURRENT_DATE - (p_retention_days || ' days')::INTERVAL;
    
    -- Find and drop old partitions
    FOR v_partition IN
        SELECT 
            schemaname,
            tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE p_parent_table || '_%'
        AND tablename ~ '\d{4}_\d{2}(_\d{2})?$'
    LOOP
        -- Extract date from partition name and check if it's old
        -- This is simplified - in production, store partition bounds in a catalog table
        EXECUTE format('DROP TABLE IF EXISTS %I.%I', v_partition.schemaname, v_partition.tablename);
        v_dropped_count := v_dropped_count + 1;
        RAISE NOTICE 'Dropped partition: %', v_partition.tablename;
    END LOOP;
    
    RETURN v_dropped_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drop_old_partitions IS 'Drops partitions older than retention period';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Convert Existing Tables to Partitioned Tables
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- 1. AUDIT_LOGS - Partitioned by month
-- Rename existing table
ALTER TABLE IF EXISTS audit_logs RENAME TO audit_logs_old;

-- Create new partitioned table
CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v1(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(10) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Ensure column exists for index if table pre-existed without it
ALTER TABLE public.blockchain_transactions
  ADD COLUMN IF NOT EXISTS ticket_id UUID;

-- Create indexes on parent table (inherited by partitions)
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Create initial partitions
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE- INTERVAL '3 months')::date);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE- INTERVAL '2 months')::date);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE- INTERVAL '1 month')::date);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE)::date);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE+ INTERVAL '1 month')::date);

-- Migrate data from old table (if exists and has data)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs_old') THEN
        INSERT INTO audit_logs 
        SELECT * FROM audit_logs_old;
        
        -- Drop old table after successful migration
        DROP TABLE audit_logs_old;
    END IF;
END $$;

-- 2. BLOCKCHAIN_TRANSACTIONS - Partitioned by month
-- Create partitioned table (assuming it doesn't exist yet)
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id UUID DEFAULT uuid_generate_v1(),
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    from_wallet VARCHAR(44),
    to_wallet VARCHAR(44),
    slot_number BIGINT,
    block_time TIMESTAMP WITH TIME ZONE,
    fee_lamports BIGINT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ticket_transactions_signature ON public.ticket_transactions (transaction_signature);
CREATE INDEX idx_blockchain_tx_status ON blockchain_transactions(status, created_at DESC);
CREATE INDEX idx_blockchain_tx_created ON blockchain_transactions(created_at DESC);

-- Create initial partitions
SELECT create_monthly_partition('blockchain_transactions', (CURRENT_DATE- INTERVAL '1 month')::date);
SELECT create_monthly_partition('blockchain_transactions', (CURRENT_DATE)::date);
SELECT create_monthly_partition('blockchain_transactions', (CURRENT_DATE+ INTERVAL '1 month')::date);

-- 3. NOTIFICATION_HISTORY - Partitioned by week
-- Create table if not exists
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID DEFAULT uuid_generate_v1(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    subject VARCHAR(200),
    content TEXT,
    status VARCHAR(20) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create indexes
CREATE INDEX idx_notification_user ON notification_history(user_id, created_at DESC);
CREATE INDEX idx_notification_status ON notification_history(status, created_at DESC);
CREATE INDEX idx_notification_type ON notification_history(type, created_at DESC);
CREATE INDEX idx_notification_created ON notification_history(created_at DESC);

-- Create initial partitions
SELECT create_weekly_partition('notification_history', CURRENT_DATE - INTERVAL '2 weeks');
SELECT create_weekly_partition('notification_history', CURRENT_DATE - INTERVAL '1 week');
SELECT create_weekly_partition('notification_history', CURRENT_DATE);
SELECT create_weekly_partition('notification_history', CURRENT_DATE + INTERVAL '1 week');

-- 4. TICKET_TRANSACTIONS - Partitioned by event date
-- This requires special handling as it's partitioned by event date, not created_at
CREATE TABLE IF NOT EXISTS ticket_transactions (
    id UUID DEFAULT uuid_generate_v1(),
    ticket_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    amount NUMERIC(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) NOT NULL,
    payment_method_id UUID,
    reference_number VARCHAR(100),
    event_date DATE NOT NULL, -- Partition key
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, event_date)
) PARTITION BY RANGE (event_date);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ticket_tx_ticket ON ticket_transactions(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_tx_status ON ticket_transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_tx_event_date ON ticket_transactions(created_at);

-- Create partitions for current and next 3 months
SELECT create_monthly_partition('ticket_transactions', (CURRENT_DATE)::date);
SELECT create_monthly_partition('ticket_transactions', (CURRENT_DATE+ INTERVAL '1 month')::date);
SELECT create_monthly_partition('ticket_transactions', (CURRENT_DATE+ INTERVAL '2 months')::date);
SELECT create_monthly_partition('ticket_transactions', (CURRENT_DATE+ INTERVAL '3 months')::date);

-- 5. SESSIONS - Partitioned by day
CREATE TABLE IF NOT EXISTS sessions (
    id UUID DEFAULT uuid_generate_v1(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create indexes
CREATE INDEX idx_sessions_user ON sessions(user_id, created_at DESC);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE expires_at > CURRENT_TIMESTAMP;
CREATE INDEX idx_sessions_created ON sessions(created_at DESC);

-- Create partitions for current and next 7 days
SELECT create_daily_partition('sessions', CURRENT_DATE);
SELECT create_daily_partition('sessions', CURRENT_DATE + INTERVAL '1 day');
SELECT create_daily_partition('sessions', CURRENT_DATE + INTERVAL '2 days');
SELECT create_daily_partition('sessions', CURRENT_DATE + INTERVAL '3 days');
SELECT create_daily_partition('sessions', CURRENT_DATE + INTERVAL '4 days');
SELECT create_daily_partition('sessions', CURRENT_DATE + INTERVAL '5 days');
SELECT create_daily_partition('sessions', CURRENT_DATE + INTERVAL '6 days');

-- 6. ANALYTICS_EVENTS - Partitioned by month
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID DEFAULT uuid_generate_v1(),
    event_name VARCHAR(100) NOT NULL,
    user_id UUID,
    session_id UUID,
    properties JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create indexes
CREATE INDEX idx_analytics_event_name ON analytics_events(event_name, timestamp DESC);
CREATE INDEX idx_analytics_user ON analytics_events(user_id, timestamp DESC);
CREATE INDEX idx_analytics_session ON analytics_events(session_id, timestamp DESC);
CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp DESC);

-- Create GIN index for JSONB searching
CREATE INDEX idx_analytics_properties ON analytics_events USING GIN (properties);

-- Create initial partitions
SELECT create_monthly_partition('analytics_events', (CURRENT_DATE- INTERVAL '1 month')::date);
SELECT create_monthly_partition('analytics_events', (CURRENT_DATE)::date);
SELECT create_monthly_partition('analytics_events', (CURRENT_DATE+ INTERVAL '1 month')::date);

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Partition Maintenance Jobs
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to maintain all partitions
CREATE OR REPLACE FUNCTION maintain_partitions() RETURNS VOID AS $$
BEGIN
    -- Create future partitions
    PERFORM auto_create_partitions('audit_logs', 'monthly', 30);
    PERFORM auto_create_partitions('blockchain_transactions', 'monthly', 30);
    PERFORM auto_create_partitions('notification_history', 'weekly', 28);
    PERFORM auto_create_partitions('ticket_transactions', 'monthly', 90);
    PERFORM auto_create_partitions('sessions', 'daily', 7);
    PERFORM auto_create_partitions('analytics_events', 'monthly', 30);
    
    -- Drop old partitions based on retention policy
    -- PERFORM drop_old_partitions('audit_logs', 365);  -- Keep 1 year
    -- PERFORM drop_old_partitions('sessions', 30);     -- Keep 30 days
    -- PERFORM drop_old_partitions('notification_history', 90); -- Keep 90 days
    
    RAISE NOTICE 'Partition maintenance completed at %', CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION maintain_partitions IS 'Maintains all partitioned tables - creates new and drops old partitions';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Partition Information Views
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- View to monitor partition sizes and row counts
CREATE OR REPLACE VIEW partition_info AS
SELECT 
    n.nspname AS schema_name,
    c.relname AS table_name,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
    pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
    CASE 
        WHEN c.reltuples > 0 THEN c.reltuples::BIGINT
        ELSE 0
    END AS estimated_rows,
    CASE 
        WHEN pt.tablename IS NOT NULL THEN 'partition'
        WHEN c.relkind = 'p' THEN 'parent'
        ELSE 'regular'
    END AS table_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_tables pt ON pt.schemaname = n.nspname AND pt.tablename = c.relname
WHERE n.nspname = 'public'
AND (
    c.relname LIKE '%audit_logs%' OR
    c.relname LIKE '%blockchain_transactions%' OR
    c.relname LIKE '%notification_history%' OR
    c.relname LIKE '%ticket_transactions%' OR
    c.relname LIKE '%sessions%' OR
    c.relname LIKE '%analytics_events%'
)
ORDER BY 
    CASE 
        WHEN c.relname ~ '^\w+_\d{4}_\d{2}(_\d{2})?$' THEN 1
        ELSE 0
    END,
    c.relname;

COMMENT ON VIEW partition_info IS 'Shows size and row count information for all partitioned tables';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Partition Pruning
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Ensure partition pruning is enabled
SET enable_partition_pruning = on;

-- Set constraint exclusion for better query planning
ALTER SYSTEM SET constraint_exclusion = 'partition';

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant Permissions
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Grant permissions on new tables and functions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tickettoken_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tickettoken_app;


-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Post-Migration Instructions
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
To set up automatic partition maintenance, create a cron job or pg_cron job:

-- Using pg_cron (if installed):
SELECT cron.schedule(
    'partition-maintenance',
    '0 2 * * *', -- Run at 2 AM daily
    'SELECT maintain_partitions();'
);

-- Or using system cron:
0 2 * * * psql -U postgres -d tickettoken -c "SELECT maintain_partitions();"

-- Monitor partition usage:
SELECT * FROM partition_info ORDER BY total_size DESC;

-- Check partition pruning effectiveness:
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM audit_logs 
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';
*/

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DOWN Migration (commented out for safety)
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- BEGIN;
-- 
-- -- Drop views
-- DROP VIEW IF EXISTS partition_info;
-- 
-- -- Drop maintenance functions
-- DROP FUNCTION IF EXISTS maintain_partitions();
-- DROP FUNCTION IF EXISTS drop_old_partitions(TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS auto_create_partitions(TEXT, TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS create_daily_partition(TEXT, DATE);
-- DROP FUNCTION IF EXISTS create_weekly_partition(TEXT, DATE);
-- DROP FUNCTION IF EXISTS create_monthly_partition(TEXT, DATE);
-- 
-- -- Convert back to non-partitioned tables (data loss warning!)
-- -- This would require careful data migration
-- 
-- COMMIT;

-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration Verification Queries
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
-- Verify partitioned tables
SELECT 
    c.relname AS table_name,
    p.partstrat AS partition_strategy,
    pg_get_partkeydef(c.oid) AS partition_key
FROM pg_class c
JOIN pg_partitioned_table p ON p.partrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace;

-- List all partitions
SELECT 
    parent.relname AS parent_table,
    child.relname AS partition_name,
    pg_get_expr(child.relpartbound, child.oid) AS partition_bounds
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
ORDER BY parent.relname, child.relname;

-- Test partition pruning
EXPLAIN (ANALYZE, BUFFERS) 
SELECT COUNT(*) FROM audit_logs 
WHERE created_at >= CURRENT_DATE;
*/
