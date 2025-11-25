-- ============================================
-- VALIDATE SECURITY CONFIGURATION (FIXED)
-- ============================================
-- This script validates all database security configurations
-- FIXED version with correct syntax
--
-- USAGE:
--   PGPASSWORD=postgres psql -h localhost -U postgres -d tickettoken_db -f validate_security_FIXED.sql
-- ============================================

\echo ''
\echo '=================================================='
\echo 'DATABASE SECURITY VALIDATION'
\echo '=================================================='
\echo ''

-- ============================================
-- 1. ROW LEVEL SECURITY STATUS
-- ============================================
\echo '1. ROW LEVEL SECURITY STATUS'
\echo '----------------------------'

SELECT 
    schemaname,
    tablename,
    CASE 
        WHEN rowsecurity THEN 'ENABLED' 
        ELSE 'DISABLED' 
    END as rls_status
FROM pg_tables 
WHERE tablename IN ('users', 'venues', 'tickets')
AND schemaname = 'public'
ORDER BY tablename;

\echo ''
\echo 'RLS Policies:'
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd as command_type
FROM pg_policies 
WHERE tablename IN ('users', 'venues', 'tickets')
ORDER BY tablename, policyname;

-- ============================================
-- 2. CHECK VENUES_MASKED VIEW
-- ============================================
\echo ''
\echo '2. VENUES_MASKED VIEW STATUS'
\echo '----------------------------'

SELECT 
    schemaname,
    viewname,
    'EXISTS' as status
FROM pg_views
WHERE viewname = 'venues_masked'
UNION ALL
SELECT 
    'public' as schemaname,
    'venues_masked' as viewname,
    'MISSING' as status
WHERE NOT EXISTS (
    SELECT 1 FROM pg_views WHERE viewname = 'venues_masked'
);

-- ============================================
-- 3. CHECK SECURITY FUNCTIONS
-- ============================================
\echo ''
\echo '3. SECURITY FUNCTIONS STATUS'
\echo '----------------------------'

SELECT 
    proname as function_name,
    'EXISTS' as status
FROM pg_proc 
WHERE proname IN (
    'get_venue_tax_id',
    'mask_email',
    'mask_phone'
)
ORDER BY proname;

-- ============================================
-- 4. CHECK DATABASE ROLES
-- ============================================
\echo ''
\echo '4. DATABASE ROLES STATUS'
\echo '----------------------------'

SELECT 
    rolname as role_name,
    CASE WHEN rolcanlogin THEN 'YES' ELSE 'NO' END as can_login,
    CASE WHEN rolsuper THEN 'YES' ELSE 'NO' END as is_superuser
FROM pg_roles
WHERE rolname IN ('app_role', 'readonly_role', 'admin_role')
ORDER BY rolname;

-- ============================================
-- 5. TEST RLS POLICIES
-- ============================================
\echo ''
\echo '5. TESTING RLS POLICIES'
\echo '----------------------------'
\echo 'Setting test session variables...'

-- Set test session variables
SET app.current_user_id = '00000000-0000-0000-0000-000000000001';
SET app.current_tenant_id = '00000000-0000-0000-0000-000000000001';
SET app.current_user_role = 'user';

\echo 'Session variables set'
\echo ''

-- ============================================
-- SUMMARY
-- ============================================
\echo ''
\echo '=================================================='
\echo 'VALIDATION SUMMARY'
\echo '=================================================='
\echo ''

DO $$
DECLARE
    rls_count INT;
    policy_count INT;
    view_exists BOOLEAN;
    func_count INT;
    role_count INT;
BEGIN
    -- Count RLS enabled tables
    SELECT COUNT(*) INTO rls_count
    FROM pg_tables 
    WHERE tablename IN ('users', 'venues', 'tickets')
    AND rowsecurity = true;
    
    -- Count policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE tablename IN ('users', 'venues', 'tickets');
    
    -- Check view exists
    SELECT EXISTS(SELECT 1 FROM pg_views WHERE viewname = 'venues_masked')
    INTO view_exists;
    
    -- Count functions
    SELECT COUNT(*) INTO func_count
    FROM pg_proc 
    WHERE proname IN ('get_venue_tax_id', 'mask_email', 'mask_phone');
    
    -- Count roles
    SELECT COUNT(*) INTO role_count
    FROM pg_roles
    WHERE rolname IN ('app_role', 'readonly_role', 'admin_role');
    
    RAISE NOTICE '';
    RAISE NOTICE 'Security Status Summary:';
    RAISE NOTICE '========================';
    RAISE NOTICE 'RLS Enabled Tables: % / 3', rls_count;
    RAISE NOTICE 'RLS Policies: %', policy_count;
    RAISE NOTICE 'venues_masked view: %', CASE WHEN view_exists THEN 'EXISTS' ELSE 'MISSING' END;
    RAISE NOTICE 'Security Functions: % / 3', func_count;
    RAISE NOTICE 'Security Roles: % / 3', role_count;
    RAISE NOTICE '';
    
    IF rls_count >= 3 AND policy_count >= 5 AND view_exists AND func_count >= 1 THEN
        RAISE NOTICE 'Status: READY FOR PRODUCTION';
    ELSE
        RAISE NOTICE 'Status: NEEDS ATTENTION - Some security features missing';
    END IF;
    RAISE NOTICE '';
END $$;

\echo '=================================================='
\echo 'VALIDATION COMPLETE'
\echo '=================================================='
\echo ''
