-- ============================================================================
-- Task 1.3: Database Security Activation - Final RLS Policies and Views
-- ============================================================================
-- This script completes the database security activation by:
-- 1. Adding missing RLS policies for venues and tickets
-- 2. Fixing the venues_masked view with correct column names
-- 3. Providing verification queries
-- ============================================================================

\echo '=== Starting Final RLS Policies and Views Setup ==='

-- ============================================================================
-- SECTION 1: Add Missing RLS Policies for Venues
-- ============================================================================

\echo 'Adding RLS policy for venues...'

-- Policy: venues_manage_own
-- Allows users to SELECT/UPDATE/DELETE venues they created
DROP POLICY IF EXISTS venues_manage_own ON venues;
CREATE POLICY venues_manage_own ON venues
    FOR ALL
    TO authenticated
    USING (created_by = current_setting('app.current_user_id')::uuid);

\echo 'Venues RLS policy created successfully'

-- ============================================================================
-- SECTION 2: Add Missing RLS Policy for Tickets
-- ============================================================================

\echo 'Adding RLS policy for tickets...'

-- Policy: tickets_view_own
-- Allows users to view their own tickets
DROP POLICY IF EXISTS tickets_view_own ON tickets;
CREATE POLICY tickets_view_own ON tickets
    FOR SELECT
    TO authenticated
    USING (user_id = current_setting('app.current_user_id')::uuid);

\echo 'Tickets RLS policy created successfully'

-- ============================================================================
-- SECTION 3: Fix venues_masked View
-- ============================================================================

\echo 'Recreating venues_masked view with correct columns...'

-- Drop existing view
DROP VIEW IF EXISTS venues_masked CASCADE;

-- Recreate with correct column names from actual venues table
CREATE VIEW venues_masked AS
SELECT 
    id,
    tenant_id,
    name,
    description,
    venue_type,
    capacity,
    -- Address fields (using actual column names)
    address_line1,
    address_line2,
    city,
    state_province,
    postal_code,
    country_code,
    -- Location
    latitude,
    longitude,
    timezone,
    -- Contact (masked)
    CASE 
        WHEN LENGTH(email) > 0 THEN 
            CONCAT(LEFT(email, 2), '***@***', RIGHT(SPLIT_PART(email, '@', 2), 4))
        ELSE NULL
    END AS email_masked,
    CASE 
        WHEN LENGTH(phone) > 4 THEN 
            CONCAT('***-***-', RIGHT(phone, 4))
        ELSE '***-***-****'
    END AS phone_masked,
    website,
    -- Metadata
    status,
    created_by,
    created_at,
    updated_at
FROM venues;

\echo 'venues_masked view recreated successfully'

-- Grant appropriate permissions
GRANT SELECT ON venues_masked TO authenticated;

\echo 'Permissions granted on venues_masked view'

-- ============================================================================
-- SECTION 4: Verification Queries
-- ============================================================================

\echo ''
\echo '=== VERIFICATION QUERIES ==='
\echo ''

-- Verify venues RLS policies
\echo 'Checking venues RLS policies:'
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'venues'
ORDER BY policyname;

\echo ''

-- Verify tickets RLS policies
\echo 'Checking tickets RLS policies:'
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'tickets'
ORDER BY policyname;

\echo ''

-- Verify venues_masked view exists and structure
\echo 'Checking venues_masked view structure:'
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'venues_masked'
ORDER BY ordinal_position;

\echo ''

-- Verify RLS is enabled on key tables
\echo 'Checking RLS status on key tables:'
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('venues', 'tickets', 'users', 'events', 'payments')
ORDER BY tablename;

\echo ''
\echo '=== Verification Complete ==='
\echo ''
\echo 'Summary of changes:'
\echo '  ✓ Added venues_manage_own RLS policy'
\echo '  ✓ Added tickets_view_own RLS policy'
\echo '  ✓ Fixed venues_masked view with correct columns'
\echo ''
\echo 'To test the policies:'
\echo '  1. Set user context: SET app.current_user_id = ''<uuid>'';'
\echo '  2. Query venues: SELECT * FROM venues;'
\echo '  3. Query tickets: SELECT * FROM tickets;'
\echo '  4. Query masked view: SELECT * FROM venues_masked;'
\echo ''
\echo '=== Script Complete ==='
