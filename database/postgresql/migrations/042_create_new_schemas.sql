-- Migration: 001_create_new_schemas.sql
-- Description: Create new schemas for analytics, partnerships, customer success, monitoring, and operations
-- Safe: Only creates new schemas, does not modify existing objects

BEGIN;

-- Create new schemas
CREATE SCHEMA IF NOT EXISTS analytics_v2;
COMMENT ON SCHEMA analytics_v2 IS 'Advanced analytics and reporting for customer LTV, revenue projections';

CREATE SCHEMA IF NOT EXISTS partnerships;
COMMENT ON SCHEMA partnerships IS 'Partner agreements and commission tracking';

CREATE SCHEMA IF NOT EXISTS customer_success;
COMMENT ON SCHEMA customer_success IS 'Customer success metrics and tracking';

CREATE SCHEMA IF NOT EXISTS monitoring;
COMMENT ON SCHEMA monitoring IS 'System monitoring and SLA tracking';

CREATE SCHEMA IF NOT EXISTS operations;
COMMENT ON SCHEMA operations IS 'Operational metrics and internal tools';

-- Grant appropriate permissions
GRANT USAGE ON SCHEMA analytics_v2 TO tickettoken;
GRANT USAGE ON SCHEMA partnerships TO tickettoken;
GRANT USAGE ON SCHEMA customer_success TO tickettoken;
GRANT USAGE ON SCHEMA monitoring TO tickettoken;
GRANT USAGE ON SCHEMA operations TO tickettoken;

-- Record migration
INSERT INTO core.schema_migrations (version, name, applied_at)
VALUES ('001', 'create_new_schemas', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
