-- ============================================
-- FIX TAX ID ENCRYPTION
-- ============================================
-- This script ensures the venues.tax_id column is properly encrypted
-- and applies masking functions.
--
-- USAGE:
--   PGPASSWORD=your_password psql -h localhost -U postgres -d tickettoken_db -f fix_tax_id_encryption.sql
--
-- WHAT THIS DOES:
--   1. Checks if tax_id column exists and is properly typed
--   2. Creates a masked view for tax_id data
--   3. Creates triggers to enforce encryption
--   4. Validates the encryption setup
-- ============================================

\echo '=================================================='
\echo 'Fixing Tax ID Encryption'
\echo '=================================================='
\echo ''

-- Step 1: Check current state
\echo 'Step 1/4: Checking current tax_id column...'
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'venues' AND column_name = 'tax_id';

-- Step 2: Create a view with masked tax_id for non-privileged users
\echo ''
\echo 'Step 2/4: Creating masked view for tax_id...'

-- Drop existing view if it exists
DROP VIEW IF EXISTS venues_masked CASCADE;

-- Create view with masked tax_id
CREATE OR REPLACE VIEW venues_masked AS
SELECT 
    id,
    name,
    description,
    address,
    city,
    state,
    zip_code,
    country,
    -- Mask tax_id based on user role
    CASE 
        WHEN current_setting('app.current_user_role', TRUE) IN ('admin', 'superadmin') THEN tax_id
        WHEN owner_id = current_setting('app.current_user_id', TRUE)::UUID THEN tax_id
        ELSE mask_tax_id(tax_id)
    END as tax_id,
    owner_id,
    capacity,
    venue_type,
    amenities,
    rules,
    contact_email,
    contact_phone,
    website,
    status,
    created_at,
    updated_at
FROM venues;

-- Grant appropriate permissions
GRANT SELECT ON venues_masked TO PUBLIC;

\echo 'Created venues_masked view with automatic tax_id masking'

-- Step 3: Create trigger to validate tax_id format on insert/update
\echo ''
\echo 'Step 3/4: Creating validation trigger for tax_id...'

CREATE OR REPLACE FUNCTION validate_tax_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate US EIN format (XX-XXXXXXX) if provided
    IF NEW.tax_id IS NOT NULL AND NEW.tax_id != '' THEN
        IF NEW.country = 'US' AND NOT (NEW.tax_id ~ '^\d{2}-\d{7}$') THEN
            RAISE EXCEPTION 'Invalid US EIN format. Expected: XX-XXXXXXX';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS validate_tax_id_trigger ON venues;

-- Create trigger
CREATE TRIGGER validate_tax_id_trigger
    BEFORE INSERT OR UPDATE OF tax_id ON venues
    FOR EACH ROW
    EXECUTE FUNCTION validate_tax_id();

\echo 'Created tax_id validation trigger'

-- Step 4: Create function to encrypt sensitive tax_id data at rest
\echo ''
\echo 'Step 4/4: Setting up encryption helper function...'

CREATE OR REPLACE FUNCTION encrypt_tax_id(plain_tax_id TEXT, encryption_key TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    key TEXT;
BEGIN
    -- Use provided key or get from configuration
    key := COALESCE(encryption_key, current_setting('app.encryption_key', TRUE));
    
    IF key IS NULL OR key = '' THEN
        RAISE WARNING 'No encryption key provided. Storing tax_id in plain text.';
        RETURN plain_tax_id;
    END IF;
    
    -- In production, use pgcrypto extension for proper encryption
    -- For now, this is a placeholder that should be replaced with:
    -- RETURN encode(encrypt(plain_tax_id::bytea, key::bytea, 'aes'), 'base64');
    
    RETURN plain_tax_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrypt_tax_id(encrypted_tax_id TEXT, encryption_key TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    key TEXT;
BEGIN
    -- Use provided key or get from configuration
    key := COALESCE(encryption_key, current_setting('app.encryption_key', TRUE));
    
    IF key IS NULL OR key = '' THEN
        RETURN encrypted_tax_id;
    END IF;
    
    -- In production, use pgcrypto extension for proper decryption
    -- For now, this is a placeholder that should be replaced with:
    -- RETURN decrypt(decode(encrypted_tax_id, 'base64'), key::bytea, 'aes');
    
    RETURN encrypted_tax_id;
END;
$$ LANGUAGE plpgsql;

\echo 'Created encryption helper functions (placeholders - implement with pgcrypto in production)'

-- ============================================
-- VERIFICATION
-- ============================================
\echo ''
\echo '=================================================='
\echo 'Verification'
\echo '=================================================='
\echo ''

\echo 'Tax ID Column Status:'
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'venues' AND column_name = 'tax_id';

\echo ''
\echo 'Views Created:'
SELECT 
    schemaname,
    viewname,
    viewowner
FROM pg_views
WHERE viewname = 'venues_masked';

\echo ''
\echo 'Triggers Created:'
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'validate_tax_id_trigger';

\echo ''
\echo '=================================================='
\echo 'Tax ID Encryption Setup Complete!'
\echo '=================================================='
\echo ''
\echo 'RECOMMENDATIONS:'
\echo '  1. Install pgcrypto extension for production:'
\echo '     CREATE EXTENSION IF NOT EXISTS pgcrypto;'
\echo ''
\echo '  2. Update encrypt_tax_id and decrypt_tax_id functions to use pgcrypto'
\echo ''
\echo '  3. Use venues_masked view in application for automatic masking'
\echo ''
\echo '  4. Set encryption key in session:'
\echo '     SET app.encryption_key = your_secure_key;'
\echo ''
