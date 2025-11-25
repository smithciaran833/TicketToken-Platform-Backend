-- Migration: Add tenant_id to all scanning-service tables for proper multi-tenancy
-- Phase 1.5: Database-level tenant isolation

-- ============================================================================
-- PART 1: Add tenant_id columns to all tables
-- ============================================================================

-- Add tenant_id to devices table
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add tenant_id to tickets table (if not exists)
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add tenant_id to events table (if not exists)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add tenant_id to scans table
ALTER TABLE scans 
ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add tenant_id to scan_policies table
ALTER TABLE scan_policies 
ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add venue_id to tickets and events for venue isolation
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS venue_id UUID;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS venue_id UUID;

-- ============================================================================
-- PART 2: Create indexes for tenant_id for query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scans_tenant_id ON scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scan_policies_tenant_id ON scan_policies(tenant_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_devices_tenant_venue ON devices(tenant_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_venue ON tickets(tenant_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant_venue ON events(tenant_id, venue_id);

-- ============================================================================
-- PART 3: Enable Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_policies ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4: Create RLS Policies
-- ============================================================================

-- Devices table policies
DROP POLICY IF EXISTS devices_tenant_isolation ON devices;
CREATE POLICY devices_tenant_isolation ON devices
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Tickets table policies
DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets;
CREATE POLICY tickets_tenant_isolation ON tickets
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Events table policies
DROP POLICY IF EXISTS events_tenant_isolation ON events;
CREATE POLICY events_tenant_isolation ON events
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Scans table policies
DROP POLICY IF EXISTS scans_tenant_isolation ON scans;
CREATE POLICY scans_tenant_isolation ON scans
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Scan policies table policies
DROP POLICY IF EXISTS scan_policies_tenant_isolation ON scan_policies;
CREATE POLICY scan_policies_tenant_isolation ON scan_policies
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- ============================================================================
-- PART 5: Create helper function to set tenant context
-- ============================================================================

CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to application role
-- Note: Replace 'app_user' with your actual application database user
-- GRANT EXECUTE ON FUNCTION set_tenant_context TO app_user;

-- ============================================================================
-- PART 6: Add foreign key constraints (optional - depends on tenant table)
-- ============================================================================

-- NOTE: Uncomment these if you have a tenants table
-- ALTER TABLE devices 
-- ADD CONSTRAINT fk_devices_tenant 
-- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ALTER TABLE tickets 
-- ADD CONSTRAINT fk_tickets_tenant 
-- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ALTER TABLE events 
-- ADD CONSTRAINT fk_events_tenant 
-- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ALTER TABLE scans 
-- ADD CONSTRAINT fk_scans_tenant 
-- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ALTER TABLE scan_policies 
-- ADD CONSTRAINT fk_scan_policies_tenant 
-- FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 7: Create audit trigger for tenant violations (optional security layer)
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_tenant_isolation_violation()
RETURNS TRIGGER AS $$
BEGIN
    -- Log any attempts to access data from wrong tenant
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id != current_setting('app.current_tenant_id', TRUE)::UUID THEN
            RAISE EXCEPTION 'Tenant isolation violation: attempted to % data for tenant % while context is %',
                TG_OP, NEW.tenant_id, current_setting('app.current_tenant_id', TRUE);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to critical tables
DROP TRIGGER IF EXISTS trg_devices_tenant_check ON devices;
CREATE TRIGGER trg_devices_tenant_check
    BEFORE INSERT OR UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION audit_tenant_isolation_violation();

DROP TRIGGER IF EXISTS trg_scans_tenant_check ON scans;
CREATE TRIGGER trg_scans_tenant_check
    BEFORE INSERT OR UPDATE ON scans
    FOR EACH ROW
    EXECUTE FUNCTION audit_tenant_isolation_violation();

-- ============================================================================
-- PART 8: Update existing data (IMPORTANT: Run this with caution)
-- ============================================================================

-- NOTE: This section should be customized based on your actual data
-- The default UUID should be replaced with actual tenant IDs

-- Example: Update all records to belong to a specific tenant
-- UPDATE devices SET tenant_id = 'your-actual-tenant-uuid' WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
-- UPDATE tickets SET tenant_id = 'your-actual-tenant-uuid' WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
-- UPDATE events SET tenant_id = 'your-actual-tenant-uuid' WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
-- UPDATE scans SET tenant_id = 'your-actual-tenant-uuid' WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
-- UPDATE scan_policies SET tenant_id = 'your-actual-tenant-uuid' WHERE tenant_id = '00000000-0000-0000-0000-000000000000';

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- 1. After running this migration, the application MUST set the tenant context
--    before making any queries: SELECT set_tenant_context('tenant-uuid');
-- 
-- 2. The default tenant_id '00000000-0000-0000-0000-000000000000' should be
--    replaced with actual tenant IDs before enabling RLS in production.
--
-- 3. RLS policies will block ALL queries that don't have a tenant context set.
--    Make sure your application connection pooler sets this on every connection.
--
-- 4. To temporarily bypass RLS for maintenance (use with EXTREME caution):
--    SET app.current_tenant_id = '';  -- Allows superuser to see all data
--
-- 5. Monitor query performance after adding indexes. Add additional composite
--    indexes if needed based on your query patterns.
-- ============================================================================
