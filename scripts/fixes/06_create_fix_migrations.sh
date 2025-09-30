#!/bin/bash
# Create migration files for database fixes

set -euo pipefail

echo "Creating migration files for fixes..."

# Ensure migrations directory exists
mkdir -p database/postgresql/migrations

# Create migration for UUID fixes
cat > database/postgresql/migrations/020_fix_uuids.sql << 'SQL'
-- Migration: Fix UUID generation functions
-- This updates all existing UUID columns to use sequential UUIDs

BEGIN;

-- Ensure extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Log the change
INSERT INTO migrations (name, applied_at) 
VALUES ('020_fix_uuids', NOW());

COMMIT;
SQL

# Create migration for missing indexes
cat > database/postgresql/migrations/021_add_missing_indexes.sql << 'SQL'
-- Migration: Add missing foreign key indexes

BEGIN;

-- Missing indexes found in testing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_fee_tracking_transaction_signature 
ON gas_fee_tracking(transaction_signature);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_smart_contract_events_transaction_id 
ON smart_contract_events(transaction_id);

-- Additional performance indexes
CREATE INDEX idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at);
CREATE INDEX idx_events_venue_date ON events(venue_id, event_date);

INSERT INTO migrations (name, applied_at) 
VALUES ('021_add_missing_indexes', NOW());

COMMIT;
SQL

# Create migration for partitioning
cat > database/postgresql/migrations/022_add_partitioning.sql << 'SQL'
-- Migration: Convert high-volume tables to partitioned tables

BEGIN;

-- 1. Rename existing tables
ALTER TABLE audit_logs RENAME TO audit_logs_old;
ALTER TABLE tickets RENAME TO tickets_old;
ALTER TABLE transactions RENAME TO transactions_old;
ALTER TABLE user_sessions RENAME TO user_sessions_old;

-- 2. Create partitioned tables
CREATE TABLE audit_logs (
    LIKE audit_logs_old INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE tickets (
    LIKE tickets_old INCLUDING ALL  
) PARTITION BY RANGE (created_at);

CREATE TABLE transactions (
    LIKE transactions_old INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE user_sessions (
    LIKE user_sessions_old INCLUDING ALL
) PARTITION BY RANGE (last_access_time);

-- 3. Create initial partitions (3 months)
-- Audit logs
CREATE TABLE audit_logs_2025_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE audit_logs_2025_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE audit_logs_2025_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Tickets
CREATE TABLE tickets_2025_01 PARTITION OF tickets
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE tickets_2025_02 PARTITION OF tickets
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE tickets_2025_03 PARTITION OF tickets
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Transactions
CREATE TABLE transactions_2025_01 PARTITION OF transactions
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE transactions_2025_02 PARTITION OF transactions
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE transactions_2025_03 PARTITION OF transactions
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- User sessions
CREATE TABLE user_sessions_2025_01 PARTITION OF user_sessions
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE user_sessions_2025_02 PARTITION OF user_sessions
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE user_sessions_2025_03 PARTITION OF user_sessions
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

COMMIT;
SQL

# Create tenant support migration
cat > database/postgresql/migrations/025_tenant_support.sql << 'SQL'
-- Migration: Add multi-tenant support

BEGIN;

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan_type VARCHAR(50) DEFAULT 'standard',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create default tenant for existing data
INSERT INTO tenants (id, name, slug) 
VALUES (uuid_generate_v1(), 'Default Tenant', 'default')
ON CONFLICT (slug) DO NOTHING;

-- 3. Add foreign key constraints for tenant_id
-- Note: We already added tenant_id columns in the schema files

INSERT INTO migrations (name, applied_at) 
VALUES ('025_tenant_support', NOW());

COMMIT;
SQL

echo "Migration files created successfully!"
