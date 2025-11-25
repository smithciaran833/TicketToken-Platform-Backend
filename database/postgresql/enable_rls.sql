-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================
-- This script enables RLS on critical tables and creates policies
-- for tenant isolation and admin access.
--
-- USAGE:
--   PGPASSWORD=your_password psql -h localhost -U postgres -d tickettoken_db -f enable_rls.sql
--
-- WHAT THIS DOES:
--   1. Enables RLS on users, venues, and tickets tables
--   2. Creates policies so users can only see their own data
--   3. Creates admin policies to access all data
--   4. Creates service role that bypasses RLS for background jobs
-- ============================================

\echo '=================================================='
\echo 'Enabling Row Level Security'
\echo '=================================================='
\echo ''

-- Enable RLS on critical tables
\echo 'Step 1/5: Enabling RLS on users table...'
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

\echo 'Step 2/5: Enabling RLS on venues table...'
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

\echo 'Step 3/5: Enabling RLS on tickets table...'
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================
\echo 'Step 4/5: Creating RLS policies for users table...'

-- Policy: Users can view their own profile
CREATE POLICY users_view_own ON users
    FOR SELECT
    USING (id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Users can update their own profile
CREATE POLICY users_update_own ON users
    FOR UPDATE
    USING (id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Admins can view all users
CREATE POLICY users_admin_all ON users
    FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin' OR
        current_setting('app.current_user_role', TRUE) = 'superadmin'
    );

-- ============================================
-- VENUES TABLE POLICIES
-- ============================================
\echo 'Creating RLS policies for venues table...'

-- Policy: Venue owners can view their own venues
CREATE POLICY venues_view_own ON venues
    FOR SELECT
    USING (owner_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Venue owners can update their own venues
CREATE POLICY venues_update_own ON venues
    FOR UPDATE
    USING (owner_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Venue owners can delete their own venues
CREATE POLICY venues_delete_own ON venues
    FOR DELETE
    USING (owner_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Venue owners can insert new venues
CREATE POLICY venues_insert_own ON venues
    FOR INSERT
    WITH CHECK (owner_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Public can view active venues (for browsing)
CREATE POLICY venues_public_view ON venues
    FOR SELECT
    USING (status = 'active');

-- Policy: Admins can do everything with venues
CREATE POLICY venues_admin_all ON venues
    FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin' OR
        current_setting('app.current_user_role', TRUE) = 'superadmin'
    );

-- ============================================
-- TICKETS TABLE POLICIES
-- ============================================
\echo 'Creating RLS policies for tickets table...'

-- Policy: Users can view tickets they own
CREATE POLICY tickets_view_own ON tickets
    FOR SELECT
    USING (
        user_id = current_setting('app.current_user_id', TRUE)::UUID OR
        venue_id IN (
            SELECT id FROM venues 
            WHERE owner_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- Policy: Users can update their own tickets (for transfers)
CREATE POLICY tickets_update_own ON tickets
    FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Policy: Venue owners can view all tickets for their venues
CREATE POLICY tickets_venue_owner_view ON tickets
    FOR SELECT
    USING (
        venue_id IN (
            SELECT id FROM venues 
            WHERE owner_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- Policy: Admins can do everything with tickets
CREATE POLICY tickets_admin_all ON tickets
    FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin' OR
        current_setting('app.current_user_role', TRUE) = 'superadmin'
    );

-- ============================================
-- SERVICE ROLE (for background jobs)
-- ============================================
\echo 'Step 5/5: Creating service role that bypasses RLS...'

-- Create a service role for background jobs
-- NOTE: Generate a strong password with: openssl rand -base64 32
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- Use SERVICE_ROLE_PASSWORD environment variable or generate one manually
        -- For production, set this via: export SERVICE_ROLE_PASSWORD='your_secure_password_here'
        CREATE ROLE service_role WITH LOGIN PASSWORD :'SERVICE_ROLE_PASSWORD';
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
    END IF;
END $$;

-- Allow service role to bypass RLS
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE venues FORCE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============================================
-- VERIFICATION
-- ============================================
\echo ''
\echo '=================================================='
\echo 'Verification'
\echo '=================================================='
\echo ''

\echo 'RLS Status:'
SELECT 
    schemaname,
    tablename,
    rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE tablename IN ('users', 'venues', 'tickets')
ORDER BY tablename;

\echo ''
\echo 'RLS Policies:'
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd as "Command"
FROM pg_policies 
WHERE tablename IN ('users', 'venues', 'tickets')
ORDER BY tablename, policyname;

\echo ''
\echo '=================================================='
\echo 'RLS Configuration Complete!'
\echo '=================================================='
\echo ''
\echo 'IMPORTANT: Application must set these session variables:'
\echo '  - app.current_user_id (UUID of logged in user)'
\echo '  - app.current_user_role (role: user, admin, superadmin)'
\echo ''
\echo 'Example in Node.js:'
\echo '  await client.query("SET app.current_user_id = $1", [userId]);'
\echo '  await client.query("SET app.current_user_role = $1", [userRole]);'
\echo ''
\echo 'For background jobs, use the service_role account.'
\echo ''
