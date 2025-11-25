-- WP-1: Complete Database Schema Finalization & RLS
-- This migration completes all remaining WP-1 tasks

-- ============================================
-- PART 1: Fix UUID Generation (68 tables)
-- ============================================

-- Drop old uuid-ossp extension if no longer needed after this
-- CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid is built-in since PG 13

-- Fix all tables using uuid_generate_v4()
ALTER TABLE events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE order_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE outbox ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE payment_intents ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE refunds ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE tenants ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE tickets_old ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE transactions_old ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE venues ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE webhook_inbox ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Fix all tables using uuid_generate_v1() 
ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_old ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE blockchain_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE event_tiers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE feature_flags ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE idempotency_keys ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE notification_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE notification_queue ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE payment_methods ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE permissions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE price_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE roles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE royalties ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE search_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE search_index_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE service_health ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sessions_2025_08_14 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE settlements ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ticket_metadata ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ticket_redemptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ticket_refunds ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ticket_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ticket_transfers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ticket_types ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE venue_compliance ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE venue_integrations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE venue_layouts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE venue_settings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE venue_staff ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE wallet_addresses ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Fix partition tables
ALTER TABLE analytics_events_2025_08 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE analytics_events_2025_09 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_01 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_02 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_03 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_05 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_06 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_07 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_08 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE audit_logs_2025_09 ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE notification_history_2025_32 ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ============================================
-- PART 2: Convert Email Columns to citext
-- ============================================

-- Enable citext extension
CREATE EXTENSION IF NOT EXISTS citext;

-- Convert all email columns to citext
ALTER TABLE orders ALTER COLUMN user_email TYPE citext;
ALTER TABLE orders ALTER COLUMN customer_email TYPE citext;
ALTER TABLE payment_methods ALTER COLUMN billing_email TYPE citext;
ALTER TABLE ticket_transfers ALTER COLUMN to_email TYPE citext;
ALTER TABLE users ALTER COLUMN email TYPE citext;
ALTER TABLE venue_staff ALTER COLUMN contact_email TYPE citext;

-- ============================================
-- PART 3: Create Missing Indexes
-- ============================================

-- Composite index for venue + date filtering
CREATE INDEX IF NOT EXISTS idx_events_venue_date ON events(venue_id, start_date);

-- Index for orders by venue (via tenant_id)
CREATE INDEX IF NOT EXISTS idx_orders_venue_id ON orders(tenant_id);

-- ============================================
-- PART 4: Enable RLS on Critical Tables
-- ============================================

-- Enable RLS on reservations (it has event_id for scoping)
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Create policy for reservations
CREATE POLICY reservations_tenant_isolation ON reservations
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM events e 
        WHERE e.id = reservations.event_id 
        AND e.venue_id = current_setting('app.venue_id', true)::uuid
    )
);

-- Enable RLS on other critical tables with venue_id
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_staff ENABLE ROW LEVEL SECURITY;

-- Create policies for venue-scoped tables
CREATE POLICY api_keys_venue_isolation ON api_keys
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY royalties_venue_isolation ON royalties
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY settlement_batches_venue_isolation ON settlement_batches
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY venue_analytics_venue_isolation ON venue_analytics
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY venue_compliance_venue_isolation ON venue_compliance
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY venue_integrations_venue_isolation ON venue_integrations
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY venue_layouts_venue_isolation ON venue_layouts
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY venue_settings_venue_isolation ON venue_settings
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

CREATE POLICY venue_staff_venue_isolation ON venue_staff
FOR ALL USING (venue_id = current_setting('app.venue_id', true)::uuid);

-- Enable RLS on tenant-scoped tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant-scoped tables
CREATE POLICY roles_tenant_isolation ON roles
FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY permissions_tenant_isolation ON permissions
FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ============================================
-- VERIFICATION QUERIES (Run these after migration)
-- ============================================

-- Check UUID methods are all correct
-- SELECT COUNT(*) as old_uuid_count FROM information_schema.columns 
-- WHERE table_schema = 'public' AND column_name = 'id' 
-- AND column_default NOT LIKE '%gen_random_uuid()%';

-- Check email columns are citext
-- SELECT table_name, column_name, data_type FROM information_schema.columns 
-- WHERE table_schema = 'public' AND column_name LIKE '%email%';

-- Check RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('reservations', 'api_keys', 'venue_settings', 'roles');

-- Check indexes exist
-- SELECT indexname FROM pg_indexes 
-- WHERE indexname IN ('idx_events_venue_date', 'idx_orders_venue_id');
