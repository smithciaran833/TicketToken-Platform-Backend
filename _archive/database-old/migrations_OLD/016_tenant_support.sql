-- Migration: Add multi-tenant support


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

