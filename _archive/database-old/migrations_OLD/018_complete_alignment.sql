-- Migration: Complete the alignment (handle audit_logs)


-- Get the default tenant ID
DO $$
DECLARE
    default_tenant_id UUID;
BEGIN
    -- Get the default tenant ID
    SELECT id INTO default_tenant_id FROM tenants WHERE slug = 'default';
    
    -- Disable the trigger temporarily
    ALTER TABLE audit_logs DISABLE TRIGGER ALL;
    
    -- Update audit_logs with default tenant
    EXECUTE format('UPDATE audit_logs SET tenant_id = %L WHERE tenant_id IS NULL', default_tenant_id);
    
    -- Re-enable triggers
    ALTER TABLE audit_logs ENABLE TRIGGER ALL;
    
    -- Update remaining tables
    UPDATE notification_queue SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE system_logs SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE users SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE events SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE permissions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE roles SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE sessions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
END $$;

