-- ============================================
-- COMPREHENSIVE SECURITY VALIDATION
-- ============================================
-- This script validates all database security configurations
--
-- USAGE:
--   PGPASSWORD=your_password psql -h localhost -U postgres -d tickettoken_db -f validate_security_complete.sql
--
-- CHECKS:
--   1. Row Level Security (RLS) status
--   2. SSL configuration
--   3. Tax ID encryption setup
--   4. Audit triggers
--   5. Security functions
-- ============================================

\echo ''
\echo '==================================================
'
\echo 'TICKETTOKEN DATABASE SECURITY VALIDATION'
\echo '=================================================='
\echo ''
\echo 'Database: tickettoken_db'
\echo 'Timestamp:' \\timing
\echo ''

-- ============================================
-- 1. ROW LEVEL SECURITY (RLS)
-- ============================================
\echo '=================================================='
\echo '1. ROW LEVEL SECURITY STATUS'
\echo '=================================================='
\echo ''

SELECT 
    schemaname as "Schema",
    tablename as "Table",
    CASE 
        WHEN rowsecurity THEN '✓ ENABLED' 
        ELSE '❌ DISABLED' 
    END as "RLS Status"
FROM pg_tables 
WHERE tablename IN ('users', 'venues', 'tickets')
ORDER BY tablename;

\echo ''
\echo 'RLS Policies:'
SELECT 
    schemaname as "Schema",
    tablename as "Table",
    policyname as "Policy Name",
    cmd as "Command",
    CASE 
        WHEN permissive = 't' THEN 'Permissive'
        ELSE 'Restrictive'
    END as "Type"
FROM pg_policies 
WHERE tablename IN ('users', 'venues', 'tickets')
ORDER BY tablename, policyname;

-- ============================================
-- 2. SSL CONFIGURATION
-- ============================================
\echo ''
\echo '=================================================='
\echo '2. SSL/TLS CONFIGURATION'
\echo '=================================================='
\echo ''

SELECT 
    name as "Setting",
    setting as "Value",
    CASE 
        WHEN name = 'ssl' AND setting = 'on' THEN '✓ ENABLED'
        WHEN name = 'ssl' AND setting = 'off' THEN '❌ DISABLED'
        WHEN name = 'ssl_min_protocol_version' AND setting = 'TLSv1.2' THEN '✓ SECURE'
        WHEN name = 'ssl_min_protocol_version' THEN '⚠ CHECK VERSION'
        ELSE ''
    END as "Status"
FROM pg_settings 
WHERE name IN ('ssl', 'ssl_cert_file', 'ssl_key_file', 'ssl_ca_file', 'ssl_min_protocol_version')
ORDER BY name;

-- ============================================
-- 3. ENCRYPTION & MASKING
-- ============================================
\echo ''
\echo '=================================================='
\echo '3. DATA ENCRYPTION & MASKING'
\echo '=================================================='
\echo ''

\echo 'Masking Functions:'
SELECT 
    proname as "Function Name",
    CASE 
        WHEN proname IN ('mask_email', 'mask_phone', 'mask_tax_id') THEN '✓ PRESENT'
        ELSE ''
    END as "Status"
FROM pg_proc 
WHERE proname IN ('mask_email', 'mask_phone', 'mask_tax_id')
ORDER BY proname;

\echo ''
\echo 'Encryption Functions:'
SELECT 
    proname as "Function Name",
    CASE 
        WHEN proname IN ('encrypt_tax_id', 'decrypt_tax_id') THEN '✓ PRESENT'
        ELSE ''
    END as "Status"
FROM pg_proc 
WHERE proname IN ('encrypt_tax_id', 'decrypt_tax_id')
ORDER BY proname;

\echo ''
\echo 'Tax ID Protection:'
SELECT 
    schemaname as "Schema",
    viewname as "View Name",
    CASE 
        WHEN viewname = 'venues_masked' THEN '✓ PRESENT'
        ELSE ''
    END as "Status"
FROM pg_views
WHERE viewname = 'venues_masked';

\echo ''
\echo 'Tax ID Validation Trigger:'
SELECT 
    trigger_name as "Trigger Name",
    event_object_table as "Table",
    CASE 
        WHEN trigger_name = 'validate_tax_id_trigger' THEN '✓ ACTIVE'
        ELSE ''
    END as "Status"
FROM information_schema.triggers
WHERE trigger_name = 'validate_tax_id_trigger';

-- ============================================
-- 4. AUDIT CONFIGURATION
-- ============================================
\echo ''
\echo '=================================================='
\echo '4. AUDIT TRAIL CONFIGURATION'
\echo '=================================================='
\echo ''

\echo 'Audit Function:'
SELECT 
    proname as "Function Name",
    CASE 
        WHEN proname = 'audit_trigger_function' THEN '✓ PRESENT'
        ELSE ''
    END as "Status"
FROM pg_proc 
WHERE proname = 'audit_trigger_function';

\echo ''
\echo 'Audit Triggers:'
SELECT 
    COUNT(*) as "Audit Triggers Count",
    CASE 
        WHEN COUNT(*) > 0 THEN '✓ CONFIGURED'
        ELSE '❌ MISSING'
    END as "Status"
FROM pg_trigger 
WHERE tgname LIKE 'audit_%_trigger';

\echo ''
\echo 'Audit Triggers Detail:'
SELECT 
    tgname as "Trigger Name",
    tgrelid::regclass as "Table"
FROM pg_trigger 
WHERE tgname LIKE 'audit_%_trigger'
ORDER BY tgname;

-- ============================================
-- 5. SECURITY FUNCTIONS
-- ============================================
\echo ''
\echo '=================================================='
\echo '5. SECURITY FUNCTIONS'
\echo '=================================================='
\echo ''

SELECT 
    proname as "Function Name",
    CASE 
        WHEN proname IN (
            'check_password_strength',
            'generate_secure_token', 
            'check_suspicious_activity',
            'cleanup_expired_data'
        ) THEN '✓ PRESENT'
        ELSE ''
    END as "Status"
FROM pg_proc 
WHERE proname IN (
    'check_password_strength',
    'generate_secure_token',
    'check_suspicious_activity',
    'cleanup_expired_data'
)
ORDER BY proname;

-- ============================================
-- 6. SERVICE ROLES
-- ============================================
\echo ''
\echo '=================================================='
\echo '6. SERVICE ROLES'
\echo '=================================================='
\echo ''

SELECT 
    rolname as "Role Name",
    CASE 
        WHEN rolname = 'service_role' THEN '✓ EXISTS'
        ELSE ''
    END as "Status",
    CASE 
        WHEN rolcanlogin THEN 'Can Login'
        ELSE 'No Login'
    END as "Login"
FROM pg_roles
WHERE rolname = 'service_role';

-- ============================================
-- SUMMARY
-- ============================================
\echo ''
\echo '=================================================='
\echo 'SECURITY VALIDATION SUMMARY'
\echo '=================================================='
\echo ''

DO $$
DECLARE
    rls_enabled INT;
    ssl_enabled BOOLEAN;
    audit_triggers INT;
    mask_functions INT;
    security_functions INT;
    service_role_exists BOOLEAN;
BEGIN
    -- Check RLS
    SELECT COUNT(*) INTO rls_enabled
    FROM pg_tables 
    WHERE tablename IN ('users', 'venues', 'tickets') 
    AND rowsecurity = true;
    
    -- Check SSL
    SELECT setting = 'on' INTO ssl_enabled
    FROM pg_settings 
    WHERE name = 'ssl';
    
    -- Check Audit Triggers
    SELECT COUNT(*) INTO audit_triggers
    FROM pg_trigger 
    WHERE tgname LIKE 'audit_%_trigger';
    
    -- Check Masking Functions
    SELECT COUNT(*) INTO mask_functions
    FROM pg_proc 
    WHERE proname IN ('mask_email', 'mask_phone', 'mask_tax_id');
    
    -- Check Security Functions
    SELECT COUNT(*) INTO security_functions
    FROM pg_proc 
    WHERE proname IN (
        'check_password_strength',
        'generate_secure_token',
        'check_suspicious_activity',
        'cleanup_expired_data'
    );
    
    -- Check Service Role
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') 
    INTO service_role_exists;
    
    -- Display Results
    RAISE NOTICE '';
    RAISE NOTICE '┌────────────────────────────────────────┬─────────┐';
    RAISE NOTICE '│ Security Feature                       │ Status  │';
    RAISE NOTICE '├────────────────────────────────────────┼─────────┤';
    RAISE NOTICE '│ Row Level Security (% of 3)            │ % %     │', 
        rls_enabled, CASE WHEN rls_enabled = 3 THEN '✓' ELSE '❌' END;
    RAISE NOTICE '│ SSL/TLS Encryption                     │ %      │', 
        CASE WHEN ssl_enabled THEN '✓' ELSE '❌' END;
    RAISE NOTICE '│ Audit Triggers                         │ % %     │', 
        audit_triggers, CASE WHEN audit_triggers > 0 THEN '✓' ELSE '❌' END;
    RAISE NOTICE '│ Data Masking Functions (% of 3)        │ % %     │', 
        mask_functions, CASE WHEN mask_functions = 3 THEN '✓' ELSE '❌' END;
    RAISE NOTICE '│ Security Helper Functions (% of 4)     │ % %     │', 
        security_functions, CASE WHEN security_functions = 4 THEN '✓' ELSE '❌' END;
    RAISE NOTICE '│ Service Role                           │ %      │',
 CASE WHEN service_role_exists THEN '✓' ELSE '❌' END;
    RAISE NOTICE '└────────────────────────────────────────┴─────────┘';
    RAISE NOTICE '';
    
    IF rls_enabled = 3 AND ssl_enabled AND audit_triggers > 0 
       AND mask_functions = 3 AND security_functions = 4 AND service_role_exists THEN
        RAISE NOTICE '✓✓✓ ALL SECURITY CHECKS PASSED ✓✓✓';
    ELSE
        RAISE NOTICE '⚠ SOME SECURITY CHECKS FAILED - REVIEW ABOVE';
    END IF;
    RAISE NOTICE '';
END $$;

\echo ''
\echo '=================================================='
\echo 'VALIDATION COMPLETE'
\echo '=================================================='
\echo ''
