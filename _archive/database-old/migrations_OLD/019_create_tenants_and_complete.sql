-- Migration: Create tenants table and complete alignment


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

-- 2. Insert default tenant
INSERT INTO tenants (id, name, slug) 
VALUES (uuid_generate_v1(), 'Default Tenant', 'default')
ON CONFLICT (slug) DO NOTHING;

-- 3. Update all tables with default tenant
DO $$
DECLARE
    default_tenant_id UUID;
    r RECORD;
BEGIN
    -- Get the default tenant ID
    SELECT id INTO default_tenant_id FROM tenants WHERE slug = 'default';
    
    -- Update each table that has tenant_id
    FOR r IN 
        SELECT DISTINCT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'tenant_id' 
        AND table_schema = 'public'
        AND table_name NOT IN ('tenants')
    LOOP
        -- Special handling for audit_logs
        IF r.table_name = 'audit_logs' THEN
            EXECUTE format('ALTER TABLE %I DISABLE TRIGGER ALL', r.table_name);
            EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', 
                          r.table_name, default_tenant_id);
            EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', r.table_name);
        ELSE
            EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', 
                          r.table_name, default_tenant_id);
        END IF;
        
        RAISE NOTICE 'Updated % with default tenant', r.table_name;
    END LOOP;
END $$;

