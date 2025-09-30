-- Database Security Validation Report

\echo '================================================'
\echo 'TicketToken Database Security Validation Report'
\echo '================================================'
\echo ''

-- Check Row Level Security
\echo 'Row Level Security Status:'
SELECT 
    schemaname,
    tablename,
    CASE WHEN rowsecurity THEN '✅ Enabled' ELSE '❌ Disabled' END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'venues', 'tickets', 'transactions', 'payment_methods')
ORDER BY tablename;

\echo ''
\echo 'Audit Triggers:'
SELECT 
    event_object_table as table_name,
    trigger_name,
    event_manipulation as trigger_event,
    action_timing as timing
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_%'
ORDER BY event_object_table;

\echo ''
\echo 'Security Functions:'
SELECT 
    proname as function_name,
    CASE 
        WHEN proname LIKE 'mask_%' THEN 'Data Masking'
        WHEN proname LIKE 'check_%' THEN 'Validation'
        WHEN proname = 'audit_trigger_function' THEN 'Audit Logging'
        WHEN proname = 'cleanup_expired_data' THEN 'Data Retention'
        ELSE 'Security Helper'
    END as function_type
FROM pg_proc 
WHERE proname IN (
    'audit_trigger_function',
    'mask_email', 'mask_phone', 'mask_tax_id',
    'check_password_strength', 'check_suspicious_activity',
    'generate_secure_token', 'cleanup_expired_data'
)
ORDER BY function_type, function_name;

\echo ''
\echo 'Sensitive Data Columns:'
SELECT 
    table_name,
    column_name,
    data_type,
    CASE 
        WHEN column_name LIKE '%hash%' THEN '✅ Hashed'
        WHEN column_name LIKE '%encrypted%' THEN '✅ Encrypted'
        WHEN column_name IN ('password', 'ssn', 'tax_id') THEN '❌ Check Encryption'
        ELSE '✓ Regular'
    END as security_status
FROM information_schema.columns
WHERE table_schema = 'public'
AND (
    column_name LIKE '%password%' 
    OR column_name LIKE '%ssn%'
    OR column_name LIKE '%tax_id%'
    OR column_name LIKE '%hash%'
    OR column_name LIKE '%encrypted%'
)
ORDER BY table_name, column_name;

\echo ''
\echo 'Database Encryption Status:'
SELECT 
    name,
    setting,
    CASE 
        WHEN name = 'ssl' AND setting = 'on' THEN '✅ SSL Enabled'
        WHEN name = 'ssl' AND setting = 'off' THEN '❌ SSL Disabled'
        ELSE setting
    END as status
FROM pg_settings 
WHERE name IN ('ssl', 'ssl_cert_file', 'ssl_key_file');
