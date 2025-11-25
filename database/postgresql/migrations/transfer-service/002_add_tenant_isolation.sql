-- Migration: 002_add_tenant_isolation.sql
-- Description: Add multi-tenancy support with Row Level Security
-- Phase 3: Database & Schema Improvements

-- Add tenant_id column to ticket_transfers
ALTER TABLE ticket_transfers 
ADD COLUMN tenant_id UUID;

-- Add tenant_id column to transfer_history
ALTER TABLE transfer_history 
ADD COLUMN tenant_id UUID;

-- Create index on tenant_id for performance
CREATE INDEX idx_ticket_transfers_tenant_id ON ticket_transfers(tenant_id);
CREATE INDEX idx_transfer_history_tenant_id ON transfer_history(tenant_id);

-- Composite index for tenant queries
CREATE INDEX idx_ticket_transfers_tenant_status ON ticket_transfers(tenant_id, status);
CREATE INDEX idx_ticket_transfers_tenant_from_user ON ticket_transfers(tenant_id, from_user_id);

-- Enable Row Level Security
ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for ticket_transfers
-- Users can only see transfers within their tenant
CREATE POLICY ticket_transfers_tenant_isolation ON ticket_transfers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Create RLS policy for transfer_history
CREATE POLICY transfer_history_tenant_isolation ON transfer_history
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- Create policy for service accounts (bypass RLS when needed)
CREATE POLICY ticket_transfers_service_account ON ticket_transfers
    USING (current_setting('app.bypass_rls', TRUE)::TEXT = 'true');

CREATE POLICY transfer_history_service_account ON transfer_history
    USING (current_setting('app.bypass_rls', TRUE)::TEXT = 'true');

-- Add comment
COMMENT ON COLUMN ticket_transfers.tenant_id IS 'Tenant ID for multi-tenancy isolation';
COMMENT ON COLUMN transfer_history.tenant_id IS 'Tenant ID for multi-tenancy isolation';
