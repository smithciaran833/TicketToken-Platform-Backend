-- Migration: Convert high-volume tables to partitioned tables


-- 1. Rename existing tables
ALTER TABLE audit_logs RENAME TO audit_logs_old;
ALTER TABLE tickets RENAME TO tickets_old;
ALTER TABLE transactions RENAME TO transactions_old;
ALTER TABLE user_sessions RENAME TO user_sessions_old;

-- 2. Create partitioned tables
CREATE TABLE IF NOT EXISTS audit_logs (
    LIKE audit_logs_old INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS tickets (
    LIKE tickets_old INCLUDING ALL  
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS transactions (
    LIKE transactions_old INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS user_sessions (
    LIKE user_sessions_old INCLUDING ALL
) PARTITION BY RANGE (last_access_time);

-- 3. Create initial partitions (3 months)
-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs_2025_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS audit_logs_2025_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS audit_logs_2025_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Tickets
CREATE TABLE IF NOT EXISTS tickets_2025_01 PARTITION OF tickets
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS tickets_2025_02 PARTITION OF tickets
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS tickets_2025_03 PARTITION OF tickets
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Transactions
CREATE TABLE IF NOT EXISTS transactions_2025_01 PARTITION OF transactions
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS transactions_2025_02 PARTITION OF transactions
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS transactions_2025_03 PARTITION OF transactions
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions_2025_01 PARTITION OF user_sessions
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS user_sessions_2025_02 PARTITION OF user_sessions
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS user_sessions_2025_03 PARTITION OF user_sessions
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- 4. Copy data (only if tables exist)
-- Note: These will fail gracefully if tables don't exist yet
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs_old') THEN
        INSERT INTO audit_logs SELECT * FROM audit_logs_old;
        DROP TABLE audit_logs_old;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tickets_old') THEN
        INSERT INTO tickets SELECT * FROM tickets_old;
        DROP TABLE tickets_old;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions_old') THEN
        INSERT INTO transactions SELECT * FROM transactions_old;
        DROP TABLE transactions_old;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions_old') THEN
        INSERT INTO user_sessions SELECT * FROM user_sessions_old;
        DROP TABLE user_sessions_old;
    END IF;
END $$;

INSERT INTO migrations (name, applied_at) 
VALUES ('022_add_partitioning', NOW());

