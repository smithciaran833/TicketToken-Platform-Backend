-- Automated Data Retention Cleanup
-- Runs daily to enforce retention policies

CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired sessions (older than 30 days)
    DELETE FROM user_sessions 
    WHERE last_activity < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % expired sessions', deleted_count;
    
    -- Delete old audit logs (keep 7 years for compliance)
    DELETE FROM audit_logs
    WHERE created_at < NOW() - INTERVAL '7 years'
    AND category NOT IN ('financial', 'compliance');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % old audit logs', deleted_count;
    
    -- Anonymize old customer data (GDPR right to be forgotten)
    UPDATE users 
    SET 
        email = 'deleted_' || id || '@removed.com',
        first_name = 'Deleted',
        last_name = 'User',
        phone = NULL,
        deleted_at = NOW()
    WHERE 
        deletion_requested_at IS NOT NULL 
        AND deletion_requested_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Anonymized % users', deleted_count;
    
    -- Clean up orphaned records
    DELETE FROM wallet_addresses WHERE user_id NOT IN (SELECT id FROM users);
    DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users);
    
    -- Log cleanup completion
    INSERT INTO audit_logs (
        action, 
        entity_type, 
        category,
        description
    ) VALUES (
        'data_cleanup',
        'system',
        'maintenance',
        format('Data retention cleanup completed at %s', NOW())
    );
END;
$$ LANGUAGE plpgsql;
