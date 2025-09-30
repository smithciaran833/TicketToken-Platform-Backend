-- TicketToken Database Security Enhancements
-- Run this script to apply all security improvements

\echo 'Starting database security enhancements...'

-- 1. Create audit trigger function
\echo 'Creating audit trigger function...'
\i functions/audit_trigger_function.sql

-- 2. Create data masking functions
\echo 'Creating data masking functions...'
\i functions/mask_sensitive_data.sql

-- 3. Create security helper functions
\echo 'Creating security functions...'
\i functions/security_functions.sql

-- 4. Create data retention cleanup
\echo 'Creating data retention cleanup...'
\i functions/data_retention_cleanup.sql

-- 5. Apply audit triggers to critical tables
\echo 'Applying audit triggers...'
\i triggers/audit_triggers.sql

-- 6. Verify installations
\echo 'Verifying security installations...'
SELECT COUNT(*) as security_functions FROM pg_proc WHERE proname IN (
    'audit_trigger_function',
    'mask_email',
    'mask_phone',
    'mask_tax_id',
    'check_password_strength',
    'generate_secure_token',
    'check_suspicious_activity',
    'cleanup_expired_data'
);

SELECT COUNT(*) as audit_triggers FROM pg_trigger WHERE tgname LIKE 'audit_%_trigger';

\echo 'Security enhancements complete!'
