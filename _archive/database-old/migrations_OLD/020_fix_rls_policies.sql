-- Fix RLS policies to be stricter (no NULL bypass except for superuser)

-- Drop existing permissive policies
DROP POLICY IF EXISTS orders_tenant_isolation ON orders;
DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets;
DROP POLICY IF EXISTS payment_intents_tenant_isolation ON payment_intents;
DROP POLICY IF EXISTS refunds_tenant_isolation ON refunds;
DROP POLICY IF EXISTS events_tenant_isolation ON events;
DROP POLICY IF EXISTS venues_tenant_isolation ON venues;
DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
DROP POLICY IF EXISTS outbox_tenant_isolation ON outbox;
DROP POLICY IF EXISTS webhook_inbox_tenant_isolation ON webhook_inbox;

-- Create stricter policies that require tenant_id match
-- Only bypass for postgres superuser role

-- Orders - strict tenant isolation
CREATE POLICY orders_tenant_isolation ON orders
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Tickets - strict tenant isolation
CREATE POLICY tickets_tenant_isolation ON tickets
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Payment intents - strict tenant isolation
CREATE POLICY payment_intents_tenant_isolation ON payment_intents
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Refunds - strict tenant isolation
CREATE POLICY refunds_tenant_isolation ON refunds
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Events - strict tenant isolation
CREATE POLICY events_tenant_isolation ON events
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Venues - strict tenant isolation
CREATE POLICY venues_tenant_isolation ON venues
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Notifications - strict tenant isolation
CREATE POLICY notifications_tenant_isolation ON notifications
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Outbox - strict tenant isolation
CREATE POLICY outbox_tenant_isolation ON outbox
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Webhook inbox - strict tenant isolation
CREATE POLICY webhook_inbox_tenant_isolation ON webhook_inbox
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid 
        OR current_user = 'postgres'
    );

-- Track this migration
INSERT INTO migrations (name) VALUES ('031_fix_rls_policies')
ON CONFLICT (name) DO NOTHING;

