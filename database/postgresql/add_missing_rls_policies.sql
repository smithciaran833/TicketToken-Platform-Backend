-- ============================================
-- ADD MISSING RLS POLICIES
-- ============================================
-- This script adds missing Row Level Security policies
-- using the ACTUAL column names from the database
--
-- USAGE:
--   PGPASSWORD=postgres psql -h localhost -U postgres -d tickettoken_db -f add_missing_rls_policies.sql
-- ============================================

\echo ''
\echo '=================================================='
\echo 'ADDING MISSING RLS POLICIES'
\echo '=================================================='
\echo ''

-- ============================================
-- 1. VENUES: Add policy for venue owners
-- ============================================

\echo 'Adding venues_manage_own policy...'

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS venues_manage_own ON venues;

-- Create policy: Venue owners can manage their venues
-- Uses created_by column to identify the owner
CREATE POLICY venues_manage_own ON venues
  FOR ALL
  TO app_role
  USING (created_by = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (created_by = current_setting('app.current_user_id', true)::uuid);

\echo '✓ venues_manage_own policy added'

-- ============================================
-- 2. TICKETS: Add policy for ticket owners to view
-- ============================================

\echo ''
\echo 'Adding tickets_view_own policy...'

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS tickets_view_own ON tickets;

-- Create policy: Users can view their own tickets
-- Uses user_id column to identify the owner
CREATE POLICY tickets_view_own ON tickets
  FOR SELECT
  TO app_role
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

\echo '✓ tickets_view_own policy added'

-- ============================================
-- 3. OPTIONAL: Tenant Isolation Policies
-- ============================================
-- All tables have tenant_id column
-- Consider adding tenant isolation policies

\echo ''
\echo 'Adding tenant isolation policies...'

-- VENUES: Tenant isolation
DROP POLICY IF EXISTS venues_tenant_isolation ON venues;
CREATE POLICY venues_tenant_isolation ON venues
  FOR ALL
  TO app_role
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

\echo '✓ venues_tenant_isolation policy added'

-- TICKETS: Tenant isolation
DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets;
CREATE POLICY tickets_tenant_isolation ON tickets
  FOR ALL
  TO app_role
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

\echo '✓ tickets_tenant_isolation policy added'

-- USERS: Tenant isolation
DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  TO app_role
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

\echo '✓ users_tenant_isolation policy added'

-- ============================================
-- SUMMARY
-- ============================================

\echo ''
\echo '=================================================='
\echo 'RLS POLICIES ADDED SUCCESSFULLY'
\echo '=================================================='
\echo ''
\echo 'Added policies:'
\echo '  1. venues_manage_own - Owners can manage their venues (using created_by)'
\echo '  2. tickets_view_own - Users can view their tickets (using user_id)'
\echo '  3. venues_tenant_isolation - Tenant data isolation'
\echo '  4. tickets_tenant_isolation - Tenant data isolation'
\echo '  5. users_tenant_isolation - Tenant data isolation'
\echo ''
\echo 'Application must set these session variables:'
\echo '  SET app.current_user_id = <user_uuid>;'
\echo '  SET app.current_tenant_id = <tenant_uuid>;'
\echo '  SET app.current_user_role = <user_role>;'
\echo ''
